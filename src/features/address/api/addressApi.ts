import type { ApiClient, JsonValue } from '@core/api';
import { expectNoContent, idempotencyHeader } from '@core/api';
import { toE164 } from '@features/auth';

import {
  addressListSchema,
  addressWriteResponseSchema,
  serviceabilitySchema,
  societyListSchema,
} from './schemas';
import type {
  AddressDto,
  AddressWriteInput,
  AddressWriteResponse,
  ServiceabilityDto,
  SocietyDto,
} from './schemas';

/**
 * Address and serviceability endpoints.
 *
 * ## Idempotency
 *
 * Only CREATE requires an `Idempotency-Key` (the backend rejects it with INVALID_REQUEST
 * otherwise); update and delete are naturally idempotent and demand none. The key is scoped to
 * the PAYLOAD, so a retry after an ambiguous timeout replays the same intent instead of creating
 * a second address, while an edited form starts a genuinely new one — see `addressCreateScope`
 * and `@core/api/idempotency`.
 *
 * ## Serviceability is never computed here
 *
 * The client sends coordinates and renders a verdict. There is no distance check, no polygon, no
 * pincode allow-list and no cached "we serve Bengaluru" rule anywhere in this app.
 */

/** `POST /v1/serviceability/check`'s body: the point, plus what the geocoder read there. */
export interface ServiceabilityCheckInput {
  readonly latitude: number;
  readonly longitude: number;
  readonly street?: string | null;
  readonly locality?: string | null;
  readonly city?: string | null;
  readonly pincode?: string | null;
}

export const ADDRESS_PATHS = {
  list: '/v1/me/addresses',
  byId: (addressId: string) => `/v1/me/addresses/${addressId}`,
  serviceability: '/v1/serviceability/check',
  societies: '/v1/societies',
} as const;

function bodyOf(input: AddressWriteInput): JsonValue {
  // Optional fields are OMITTED rather than sent as null: the backend schemas are
  // `additionalProperties: false` with typed optionals, and an explicit null fails validation.
  return {
    label: input.label,
    street: input.street,
    pincode: input.pincode,
    latitude: input.latitude,
    longitude: input.longitude,
    ...(input.placeId === undefined ? {} : { placeId: input.placeId }),
    ...(input.flat === undefined ? {} : { flat: input.flat }),
    ...(input.tower === undefined ? {} : { tower: input.tower }),
    ...(input.society === undefined ? {} : { society: input.society }),
    // The details redesign's fields. Absent on a PUT means "unchanged" to the server, so builds
    // that predate them can keep replaying a row without erasing what a newer build saved.
    ...(input.propertyType === undefined ? {} : { propertyType: input.propertyType }),
    ...(input.floor === undefined ? {} : { floor: input.floor }),
    ...(input.lane === undefined ? {} : { lane: input.lane }),
    ...(input.landmark === undefined ? {} : { landmark: input.landmark }),
    ...(input.placeName === undefined ? {} : { placeName: input.placeName }),
    ...(input.societyId === undefined ? {} : { societyId: input.societyId }),
    ...(input.customSociety === undefined ? {} : { customSociety: input.customSociety }),
    ...(input.detailsVersion === undefined ? {} : { detailsVersion: input.detailsVersion }),
    ...(input.locality === undefined ? {} : { locality: input.locality }),
    ...(input.areaLine === undefined ? {} : { areaLine: input.areaLine }),
    ...(input.city === undefined ? {} : { city: input.city }),
    ...(input.state === undefined ? {} : { state: input.state }),
    ...(input.receiverName === undefined ? {} : { receiverName: input.receiverName }),
    /*
     * E.164, because that is the only shape the endpoint accepts.
     *
     * Both write schemas bound `receiverPhone` with `^\+[1-9][0-9]{7,14}$`, and `64:27` draws a
     * bare "Phone no." field on a `phone-pad` whose own placeholder is "98765 43210". So the
     * value the design invites — ten national digits, optionally spaced — is exactly the value
     * the backend refuses, and every save that filled the optional receiver phone came back
     * `INVALID_REQUEST` with nothing on screen to explain which field was wrong. Verified
     * against the deployed API: `9876543210` -> 400, `+91 98765 43210` -> 400,
     * `+919876543210` -> accepted.
     *
     * `toE164` is the SAME helper Login already uses for the number it sends to
     * `POST /v1/auth/otp/send`, so there is one normalisation rule in the app rather than two.
     * It only ever adds the prefix and strips separators — a number the customer typed with its
     * country code, and one the backend previously stored (already E.164, replayed by the edit
     * form), both pass through untouched.
     *
     * Placed on the transport boundary rather than in the screen so create, update and the
     * idempotency scope below all see the same bytes: an intent typed as "98765 43210" and
     * retyped as "9876543210" is one intent and reuses its key, instead of minting a second.
     */
    ...(input.receiverPhone === undefined ? {} : { receiverPhone: toE164(input.receiverPhone) }),
    ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
  };
}

/**
 * The idempotency scope for a CREATE — the attempt's identity.
 *
 * ## Why the whole body, and not the point
 *
 * This scope used to be `address.create:<lat>,<lon>`. The coordinates are the one part of the
 * form the customer is LEAST likely to change between attempts, so the key survived exactly the
 * edits it should not have: a save that failed, a corrected flat number, and a retry that reused
 * the original `Idempotency-Key` with a different body. The backend is right to refuse that — a
 * key names one request, and answering a changed one from a stored response would be a lie — so
 * it returns `IDEMPOTENCY_CONFLICT`, and the screen is then stuck on a key it can neither reuse
 * nor rotate until the pin moves or the app restarts. Observed on the handset.
 *
 * Deriving the scope from the body inverts that: an UNCHANGED retry is byte-for-byte the same
 * intent and reuses the key (which is what makes recovery from an ambiguous timeout work — the
 * backend replays the original result rather than creating a second address), and ANY edit —
 * flat, building, label, receiver name, receiver phone, the point itself — is a different intent
 * and mints a new key.
 *
 * ## Why it is derived from `bodyOf`
 *
 * The identity has to be the identity of what is actually SENT. Reading the same function the
 * request body comes from is what keeps those two from drifting: a field added to the body
 * without being added here would silently become invisible to the scope, which is precisely the
 * bug this replaces.
 *
 * ## Stability
 *
 * Keys are SORTED, so the conditional spreads in `bodyOf` cannot change the scope by changing
 * the order in which optional fields appear. The pairs are JSON-encoded rather than joined with
 * a separator, so a value containing the separator cannot make two different payloads collide.
 * Nothing time-based, random or attempt-counted goes in: two identical submissions a minute
 * apart are the same intent and must produce the same key.
 *
 * The scope never leaves the device — `idempotencyHeader` maps it to a generated key and sends
 * only that — so its length is a local map-key concern and not a wire constraint.
 */
export function addressCreateScope(input: AddressWriteInput): string {
  const body = bodyOf(input) as Record<string, JsonValue>;
  const canonical = Object.keys(body)
    .sort()
    .map((key) => [key, body[key]]);

  return `address.create:${JSON.stringify(canonical)}`;
}

export function createAddressApi(api: ApiClient) {
  return {
    /** `GET /v1/me/addresses`. */
    async list(signal?: AbortSignal): Promise<readonly AddressDto[]> {
      return api.request(ADDRESS_PATHS.list, {
        parse: (data) => addressListSchema.parse(data),
        ...(signal === undefined ? {} : { signal }),
      });
    },

    /**
     * `POST /v1/serviceability/check`.
     *
     * Tests the HUB POLYGON only. It answers "do we serve this area", which is what the map step
     * asks. It does not answer "can we cook at this address" — that additionally requires a
     * supported society, and only the address write and the availability reads know it.
     */
    /** `GET /v1/societies`: the societies the Apartment form offers at a pin (R-AREA-19). */
    async societies(
      point: { readonly latitude: number; readonly longitude: number },
      signal?: AbortSignal,
    ): Promise<readonly SocietyDto[]> {
      return api.request(
        `${ADDRESS_PATHS.societies}?latitude=${point.latitude}&longitude=${point.longitude}`,
        {
          method: 'GET',
          ...(signal === undefined ? {} : { signal }),
          parse: (data) => societyListSchema.parse(data).societies,
        },
      );
    },

    async check(point: ServiceabilityCheckInput, signal?: AbortSignal): Promise<ServiceabilityDto> {
      // The geocoder's reading is optional and only names a refused place as demand; coverage is
      // decided by the coordinates alone. Empty values are omitted, never sent as null.
      const named = (key: 'street' | 'locality' | 'city' | 'pincode') => {
        const value = point[key]?.trim();
        return value === undefined || value === '' ? {} : { [key]: value };
      };
      return api.request(ADDRESS_PATHS.serviceability, {
        method: 'POST',
        body: {
          latitude: point.latitude,
          longitude: point.longitude,
          ...named('street'),
          ...named('locality'),
          ...named('city'),
          ...named('pincode'),
        },
        parse: (data) => serviceabilitySchema.parse(data),
        ...(signal === undefined ? {} : { signal }),
      });
    },

    /** `POST /v1/me/addresses` — 201. Requires an Idempotency-Key scoped to the draft. */
    async create(input: AddressWriteInput, scope: string): Promise<AddressWriteResponse> {
      return api.request(ADDRESS_PATHS.list, {
        method: 'POST',
        headers: idempotencyHeader(scope),
        body: bodyOf(input),
        parse: (data) => addressWriteResponseSchema.parse(data),
      });
    },

    /** `PUT /v1/me/addresses/:id` — 200. No idempotency key: a full replace is already idempotent. */
    async update(addressId: string, input: AddressWriteInput): Promise<AddressWriteResponse> {
      return api.request(ADDRESS_PATHS.byId(addressId), {
        method: 'PUT',
        body: bodyOf(input),
        parse: (data) => addressWriteResponseSchema.parse(data),
      });
    },

    /**
     * `DELETE /v1/me/addresses/:id` — 204.
     *
     * The backend ARCHIVES rather than hard-deletes, and deliberately does not promote another
     * address to default. The client must not promote one either: no product rule defines the
     * order, so the account is simply left with no default until the customer picks one.
     */
    async remove(addressId: string): Promise<void> {
      return api.request(ADDRESS_PATHS.byId(addressId), {
        method: 'DELETE',
        parse: expectNoContent,
      });
    },
  };
}

export type AddressApi = ReturnType<typeof createAddressApi>;
