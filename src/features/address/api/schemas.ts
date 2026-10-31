import { z } from 'zod';

/**
 * Address and serviceability DTOs, transcribed from the running backend and verified against a
 * live local instance on 2026-08-18.
 *
 * ## The `hub_id` snake_case field
 *
 * `GET /v1/me/addresses` returns `hub_id` while every neighbouring field is camelCase. That is
 * the wire as it actually is, so the schema spells it that way and the adapter renames it —
 * which is exactly what an adapter is for. It is recorded as a contract inconsistency in
 * `docs/BACKEND_INTEGRATION_MAP.md` rather than silently normalised and forgotten.
 */

/** The three verdicts `POST /v1/serviceability/check` can return. Backend-owned, never derived. */
export const serviceabilityStatusSchema = z.enum([
  'serviceable',
  'temporarily_unavailable',
  'outside_service_area',
]);

export type ServiceabilityStatus = z.infer<typeof serviceabilityStatusSchema>;

const hubSchema = z.object({ id: z.string(), name: z.string() });

export const serviceabilitySchema = z.object({
  status: serviceabilityStatusSchema,
  /** Present only when a hub covers the point. Operational identity, shown to nobody. */
  hub: hubSchema.optional(),
  /** `outside_service_area` only: where Spoon IS live, for the Not serviceable screen. */
  liveAreas: z.array(z.string()).optional(),
  /** `outside_service_area` only: the refused locality and how many others wait at its pincode. */
  demand: z
    .object({ locality: z.string().nullable(), neighbours: z.number().int().nonnegative() })
    .optional(),
});

export type ServiceabilityDto = z.infer<typeof serviceabilitySchema>;

/** The evaluated verdict returned with a saved address and by address writes. */
export const addressServiceabilitySchema = z.object({
  status: serviceabilityStatusSchema,
  reason: z.enum(['AVAILABLE', 'NOT_SERVICEABLE', 'SOCIETY_NOT_SUPPORTED']),
  hub: hubSchema.optional(),
});

export type AddressServiceabilityDto = z.infer<typeof addressServiceabilitySchema>;

/** One row of `GET /v1/me/addresses`. */
export const addressSchema = z.object({
  id: z.string(),
  label: z.string(),
  flat: z.string().nullable(),
  tower: z.string().nullable(),
  society: z.string().nullable(),
  street: z.string(),
  /**
   * Nullable in the database: an address can be saved where neither geocoder knew a postcode.
   * `GET /v1/me/addresses` coalesces it to `''` today, but this is a LIST schema — one strict field
   * rejects every row, and a bare null took out the whole saved-address list on 2026-09-20. So a
   * null is read as `''`, the same "no pincode" the server already sends, and nothing downstream
   * has to know the difference.
   */
  pincode: z
    .string()
    .nullish()
    .transform((value) => value ?? ''),
  city: z.string().nullable(),
  state: z.string().nullable(),
  /** Snake_case on the wire. See the note above. */
  hub_id: z.string().nullable(),
  receiverName: z.string().nullable(),
  receiverPhone: z.string().nullable(),
  isDefault: z.boolean(),
  /** Returned so an edit can re-centre its map on the saved point. */
  latitude: z.number(),
  longitude: z.number(),
  placeId: z.string().nullable().optional(),
  /** Current backend-evaluated serviceability, not the stored hub_id projection. */
  serviceability: addressServiceabilitySchema,
  /**
   * The redesigned details form's fields (Figma 1870:2485 / 1870:2576) and when the address was
   * last used for an order. NULLISH, not required: a backend that predates them simply omits the
   * keys, and every address it returns must still parse — one failed row fails the whole list.
   */
  propertyType: z
    .enum(['apartment', 'house'])
    .nullish()
    .transform((value) => value ?? null),
  floor: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  lane: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  landmark: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  // The whole area the map read at the pin (R-AREA-15). Absent from a backend that predates them.
  placeName: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  locality: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  areaLine: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  /** The society picked from the list, or the name typed under "Others" (R-AREA-18 to 20). */
  societyId: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  customSociety: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  lastUsedAt: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  /**
   * The version of the address steps that last saved it; below `ADDRESS_STEPS_VERSION` the
   * customer goes through them again (owner, 31 Oct 2026). Absent from a V0 that predates it.
   */
  detailsVersion: z.number().int().optional(),
});

export type AddressDto = z.infer<typeof addressSchema>;
export type AddressPropertyType = 'apartment' | 'house';

export const addressListSchema = z.array(addressSchema);

/**
 * `POST /v1/me/addresses` / `PUT /v1/me/addresses/:id` — 201/200.
 *
 * Note the asymmetry with the LIST: the write response is a summary, not the full row, and it
 * carries the fulfilment verdict for the address it just saved. That verdict is stricter than
 * `POST /serviceability/check`: the check tests the hub polygon alone, while this also requires
 * the same active KML-backed hub. A Places ID is optional metadata; coordinates remain the
 * authoritative serviceability and fulfilment target.
 *
 * ## `label` is OPTIONAL, and that is the contract rather than a relaxation
 *
 * The two writes do not answer identically. `POST` echoes the label it stored; `PUT` does not —
 * its handler builds `{ id, receiverName, receiverPhone, placeId, latitude, longitude,
 * isDefault, serviceability }` and stops. The published contract agrees: `AddressWritten` marks
 * only `[id, isDefault, serviceability, latitude, longitude]` required, so a `label` that is
 * absent is a conforming response, not a truncated one.
 *
 * Requiring it here made every SUCCESSFUL update fail at the parse and surface to the customer
 * as a failed save, on top of a row the backend had already changed — the worst possible pairing,
 * because retrying re-sent a write that had already succeeded. Nothing meaningful is given up by
 * matching the contract: the label the app renders comes from `GET /v1/me/addresses`, which the
 * mutation invalidates, and no screen reads the label off the write reply.
 */
export const addressWriteResponseSchema = z.object({
  address: z.object({
    id: z.string(),
    /** Echoed by `POST`, omitted by `PUT`. Optional per `AddressWritten`, never invented. */
    label: z.string().optional(),
    receiverName: z.string().nullable(),
    receiverPhone: z.string().nullable(),
    placeId: z.string().nullable().optional(),
    latitude: z.number(),
    longitude: z.number(),
    isDefault: z.boolean(),
    serviceability: addressServiceabilitySchema,
  }),
});

export type AddressWriteResponse = z.infer<typeof addressWriteResponseSchema>;

/** The body accepted by create/update. Coordinates are REQUIRED — never faked, never defaulted. */
export interface AddressWriteInput {
  readonly label: string;
  readonly flat?: string;
  readonly tower?: string;
  readonly society?: string;
  readonly street: string;
  readonly pincode: string;
  readonly city?: string;
  readonly state?: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly placeId?: string;
  readonly receiverName?: string;
  readonly receiverPhone?: string;
  readonly isDefault?: boolean;
  /** Sent by the redesigned form. On PUT an absent key leaves the stored value; `''` clears it. */
  readonly propertyType?: AddressPropertyType;
  readonly floor?: string;
  readonly lane?: string;
  readonly landmark?: string;
  /** The area the map read at the pin. Sent only with a newly placed pin; `''` clears. */
  readonly placeName?: string;
  readonly locality?: string;
  readonly areaLine?: string;
  /** A society from `GET /v1/societies`; or, under "Others", the name typed. Never both. */
  readonly societyId?: string;
  readonly customSociety?: string;
  /**
   * The version of the address steps that sent this save (`ADDRESS_STEPS_VERSION`). Sent only by
   * the details form, and only to a V0 that knows it; "set as default" never sends it.
   */
  readonly detailsVersion?: number;
}

/** One row of the society dropdown: an entry of `GET /v1/societies`. */
export const societySchema = z.object({ id: z.string(), name: z.string() });
export const societyListSchema = z.object({ societies: z.array(societySchema) });
export type SocietyDto = z.infer<typeof societySchema>;
