import type { ApiClient, JsonValue } from '@core/api';
import { expectNoContent } from '@core/api';

import {
  meResponseSchema,
  otpSendResponseSchema,
  otpVerifyResponseSchema,
  refreshResponseSchema,
  updateProfileResponseSchema,
} from './schemas';
import type {
  MeResponse,
  OtpSendResponse,
  OtpVerifyResponse,
  ProfileData,
  ProfileUpdateRequest,
} from './schemas';

/**
 * The auth endpoints, as functions.
 *
 * Screens never see these — the hooks in `hooks.ts` do. Keeping the transport calls separate
 * from the React layer is what makes them testable without a renderer, and what stops a
 * component from acquiring a dependency on a URL.
 *
 * ## Which calls carry a token
 *
 * `otp/send`, `otp/verify` and `refresh` are `authenticated: false`. This is not a detail: the
 * client's 401 interceptor triggers a REFRESH, and a refresh call that could itself 401 into a
 * refresh is an infinite loop. Excluding them from auth breaks that cycle structurally rather
 * than by a guard someone can forget.
 */

export const AUTH_PATHS = {
  otpSend: '/v1/auth/otp/send',
  otpVerify: '/v1/auth/otp/verify',
  refresh: '/v1/auth/refresh',
  logout: '/v1/auth/logout',
  me: '/v1/me',
  profile: '/v1/me/profile',
} as const;

/**
 * Normalises a typed number to E.164.
 *
 * The backend's schema is `^\+[1-9][0-9]{7,14}$` and it rejects anything else with
 * INVALID_REQUEST. The Login screen collects ten digits behind a fixed "+91", so the country
 * code is added here, once, rather than in the screen.
 *
 * It only ever ADDS the prefix — it does not strip, reorder or guess at a different country.
 * A value that already looks like E.164 is passed through untouched.
 */
export function toE164(rawDigits: string, countryCode = '+91'): string {
  const trimmed = rawDigits.trim();
  if (trimmed.startsWith('+')) return trimmed.replace(/[^\d+]/g, '');
  return `${countryCode}${trimmed.replace(/\D/g, '')}`;
}

/**
 * The non-default halves of an OTP send.
 *
 * Both exist for the account-deletion flow (`@features/account`) and both default to Login's
 * behaviour, so Login's own call — `sendOtp(phone)` — puts the same bytes on the wire it always
 * has: body `{ phone }`, no token.
 */
export interface SendOtpOptions {
  /**
   * Which app is asking. The backend resolves anything that is not the literal `cook` to
   * `customer`, so omitting this is identical in behaviour to sending `customer` — Login omits
   * it, and deletion sends it explicitly because that is the flag the backend splits the two
   * apps on.
   */
  readonly audience?: 'customer';
  /**
   * Whether to attach the caller's bearer token.
   *
   * Login cannot: no session exists yet. Deletion can, and does, because the auth rate limiter
   * buckets by user id when a token is present and by phone number when it is not — which keeps
   * a customer's deletion sends out of the same 8-per-10-minutes budget as their login sends on
   * that number, in both directions.
   *
   * This is the only reason it matters: the route itself never reads the header, and the phone
   * is still taken from the BODY. The session is not, and must not be, the source of the number.
   */
  readonly authenticated?: boolean;
  readonly signal?: AbortSignal;
}

export function createAuthApi(api: ApiClient) {
  return {
    /** `POST /v1/auth/otp/send`. Rate limited by a server-side cooldown; 429 = RATE_LIMITED. */
    async sendOtp(phone: string, options: SendOtpOptions = {}): Promise<OtpSendResponse> {
      return api.request(AUTH_PATHS.otpSend, {
        method: 'POST',
        authenticated: options.authenticated ?? false,
        // Built key by key rather than spread: an `audience: undefined` would reach the wire as a
        // declared-but-absent key, and JSON has no `undefined` (see `updateProfile` below).
        body: {
          phone,
          ...(options.audience === undefined ? {} : { audience: options.audience }),
        },
        parse: (data) => otpSendResponseSchema.parse(data),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
    },

    /**
     * `POST /v1/auth/otp/verify`.
     *
     * `deviceId` is required by the contract and binds the refresh-token family to this
     * install, so it must be STABLE across launches — see `deviceId.ts`.
     */
    async verifyOtp(
      input: { phone: string; otp: string; deviceId: string },
      signal?: AbortSignal,
    ): Promise<OtpVerifyResponse> {
      return api.request(AUTH_PATHS.otpVerify, {
        method: 'POST',
        authenticated: false,
        body: { phone: input.phone, otp: input.otp, deviceId: input.deviceId },
        parse: (data) => otpVerifyResponseSchema.parse(data),
        ...(signal === undefined ? {} : { signal }),
      });
    },

    /** `POST /v1/auth/refresh`. Rotating — the response's refresh token replaces the old one. */
    async refresh(refreshToken: string) {
      return api.request(AUTH_PATHS.refresh, {
        method: 'POST',
        authenticated: false,
        body: { refreshToken },
        parse: (data) => refreshResponseSchema.parse(data),
      });
    },

    /**
     * `POST /v1/auth/logout` — 204.
     *
     * BEARER-authenticated and takes NO body: the server revokes the session named by the access
     * token's `sessionId`, and with it the whole refresh-token family. The client does not say
     * which token to revoke, so there is nothing to send.
     *
     * Best-effort by design: the caller clears local state regardless of the outcome, because a
     * user who taps Log Out must end up logged out even with no network. The server-side
     * revocation is what this call is for; the local clear is not conditional on it.
     */
    async logout(): Promise<void> {
      return api.request(AUTH_PATHS.logout, {
        method: 'POST',
        parse: expectNoContent,
      });
    },

    /** `GET /v1/me`. */
    async getMe(signal?: AbortSignal): Promise<MeResponse> {
      return api.request(AUTH_PATHS.me, {
        parse: (data) => meResponseSchema.parse(data),
        ...(signal === undefined ? {} : { signal }),
      });
    },

    /**
     * `PUT /v1/me/profile` — the whole questionnaire, not just the name.
     *
     * The body is passed through as the caller assembled it. That is deliberate: the operation
     * is a PATCH, so which keys are PRESENT is itself meaningful — an omitted key preserves the
     * stored answer and an explicit `null` clears it — and a transport that helpfully pruned
     * nulls would turn every intentional clear into a no-op. `ProfileUpdateRequest` is the type
     * that makes that distinction expressible; this function does not second-guess it.
     *
     * The reply is the committed projection, parsed rather than discarded so the caller can
     * write the server's own answer back into the `/me` cache.
     */
    async updateProfile(patch: ProfileUpdateRequest): Promise<ProfileData> {
      // Built key by key rather than spread, because PRESENCE is the contract's verb. A spread
      // would carry `undefined` values onto the wire as absent-but-declared keys, and JSON has no
      // `undefined` — the transport's own `JsonValue` refuses it for exactly that reason. Naming
      // each key keeps "omitted" and "explicitly null" the two distinct instructions they are.
      const body: Record<string, JsonValue> = { name: patch.name };

      if (patch.householdStructure !== undefined) {
        body.householdStructure = patch.householdStructure;
      }
      if (patch.mealStructure !== undefined) body.mealStructure = patch.mealStructure;
      if (patch.pressingIssue !== undefined) body.pressingIssue = patch.pressingIssue;
      if (patch.dietaryPreference !== undefined) body.dietaryPreference = patch.dietaryPreference;
      if (patch.grownUpEating !== undefined) {
        // Copied, not passed: the caller's array is `readonly`, and the request body is handed to
        // a serialiser that has no business holding a reference into the caller's form state.
        body.grownUpEating = patch.grownUpEating === null ? null : [...patch.grownUpEating];
      }
      if (patch.regionPreference !== undefined) body.regionPreference = patch.regionPreference;
      if (patch.genderPreference !== undefined) body.genderPreference = patch.genderPreference;
      if (patch.householdAdults !== undefined) body.householdAdults = patch.householdAdults;
      if (patch.householdKids !== undefined) body.householdKids = patch.householdKids;
      if (patch.householdElders !== undefined) body.householdElders = patch.householdElders;
      if (patch.nonVegPreferences !== undefined) {
        body.nonVegPreferences =
          patch.nonVegPreferences === null ? null : [...patch.nonVegPreferences];
      }
      if (patch.oilLevel !== undefined) body.oilLevel = patch.oilLevel;
      if (patch.gheeOnly !== undefined) body.gheeOnly = patch.gheeOnly;
      if (patch.mealHassles !== undefined) {
        body.mealHassles = patch.mealHassles === null ? null : [...patch.mealHassles];
      }
      if (patch.flowVersion !== undefined) body.flowVersion = patch.flowVersion;

      return api.request(AUTH_PATHS.profile, {
        method: 'PUT',
        body,
        parse: (data) => updateProfileResponseSchema.parse(data),
      });
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
