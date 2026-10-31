import { z } from 'zod';

/**
 * Auth DTOs, transcribed from the running backend (`src/api/routes/v1/index.ts`) and verified
 * against a live local instance on 2026-08-18.
 *
 * These describe the WIRE, not the app. Nothing here is a view model: the screens keep their own
 * types and an adapter sits between (see `adapters.ts`).
 *
 * Every schema is `.passthrough()`-free and deliberately strict about the fields the app relies
 * on, but does NOT enumerate fields it ignores — zod drops unknown keys by default, which is the
 * behaviour we want at a boundary: a backend that adds a field must never break a release.
 */

/** `POST /v1/auth/otp/send` — 202. */
export const otpSendResponseSchema = z.object({
  accepted: z.boolean(),
  /** The send cooldown. The OTP screen's resend timer is this value, never a client constant. */
  retryAfterSeconds: z.number().int().nonnegative(),
  /**
   * Development affordance only. The backend emits it exclusively when its own environment is
   * development/test AND the operator set the echo flag; `loadConfig` refuses the flag in
   * staging and production. The app therefore treats it as "may be absent", always.
   */
  devOtp: z.string().optional(),
});

export type OtpSendResponse = z.infer<typeof otpSendResponseSchema>;

/** The `user` block returned by OTP verify. */
export const authUserSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'cook']),
  status: z.string(),
  /**
   * The backend's own answer to "does this account still need onboarding". It is true when the
   * user has no `user_profiles` row. The client never derives this from a missing name.
   */
  onboardingRequired: z.boolean(),
  /** `GET /v1/me`'s flag of the same name: the current profile steps are still owed. */
  profileUpdateRequired: z.boolean().optional(),
});

export type AuthUser = z.infer<typeof authUserSchema>;

/**
 * The token triple, returned identically by `otp/verify` and `refresh`.
 *
 * `accessTokenExpiresAt` is an ISO instant chosen by the server. The client stores it verbatim
 * and never computes an expiry from a TTL it guessed.
 */
export const sessionTokensSchema = z.object({
  accessToken: z.string().min(1),
  accessTokenExpiresAt: z.string().datetime(),
  refreshToken: z.string().min(1),
});

export type SessionTokensDto = z.infer<typeof sessionTokensSchema>;

/** `POST /v1/auth/otp/verify` — 200. */
export const otpVerifyResponseSchema = sessionTokensSchema.extend({
  user: authUserSchema,
});

export type OtpVerifyResponse = z.infer<typeof otpVerifyResponseSchema>;

/**
 * `POST /v1/auth/refresh` — 200.
 *
 * Rotating: the response carries a NEW refresh token which replaces the one just spent. The
 * backend detects reuse of a spent token and kills the family, so storing the new one is not
 * optional.
 */
export const refreshResponseSchema = sessionTokensSchema;

/**
 * `ProfileData` — the committed questionnaire answers.
 *
 * Returned by `PUT /v1/me/profile` and INLINED into `GET /v1/me` (the contract composes them
 * with `allOf`, so both calls hand back the same eight keys at the same level). One schema is
 * therefore parsed from two endpoints, which is what stops the edit form and the completion card
 * disagreeing about the same answer.
 *
 * ## Why the option ids are `z.string()` and not `z.enum([...])`
 *
 * Every single-select value is a canonical option id and the contract enumerates them, so an
 * enum would be the tighter transcription. It would also be the more BRITTLE one at exactly the
 * wrong moment: this schema parses `GET /v1/me`, which the boot gate reads before anything else
 * renders. A backend that adds a fifth household option would make that parse throw, and the
 * whole app would fail to open over a chip nobody selected.
 *
 * An unknown id costs nothing instead: `PreferenceGrid` matches selection by id, so a value no
 * chip carries simply draws none selected — the same as an unanswered question — and the next
 * save writes whatever the customer then picks. The canonical ids remain owned by `fields.ts`
 * (they are what is SENT); this end of the wire only has to survive what comes back.
 *
 * `grownUpEating` distinguishes `null` (never answered, or cleared) from `[]` (answered, then
 * emptied) and the contract keeps the two apart. The form cannot draw that difference — no chips
 * is no chips — so `detailsData.ts` collapses it for display only, and never on the way out.
 */
export const profileDataSchema = z.object({
  /** Null until the customer saves a profile. A cook's operational name is not returned here. */
  name: z.string().nullable(),
  householdStructure: z.string().nullable(),
  mealStructure: z.string().nullable(),
  pressingIssue: z.string().nullable(),
  dietaryPreference: z.string().nullable(),
  grownUpEating: z.array(z.string()).nullable(),
  regionPreference: z.string().nullable(),
  genderPreference: z.string().nullable(),
  /**
   * The taste-profile wizard's answers (Figma page `1405:448`). Optional on the way IN so a V0
   * that has not shipped them yet still parses: an absent key reads as `null`, "not answered".
   */
  householdAdults: z.number().int().nullable().default(null),
  householdKids: z.number().int().nullable().default(null),
  householdElders: z.number().int().nullable().default(null),
  nonVegPreferences: z.array(z.string()).nullable().default(null),
  oilLevel: z.string().nullable().default(null),
  gheeOnly: z.boolean().nullable().default(null),
  mealHassles: z.array(z.string()).nullable().default(null),
  /**
   * Server-owned, read verbatim, never recomputed here (task §9).
   *
   * The rule is `name` AND `mealStructure` AND `dietaryPreference`, each present and non-blank —
   * the three starred fields `338:4508` draws — and it is the exact inverse of
   * `onboardingRequired` on `/auth/otp/verify`. A client-side copy of that rule would disagree
   * with the server the moment either side moved, so there isn't one.
   */
  profileComplete: z.boolean(),
  /**
   * Server-owned: the customer still owes the current version of the profile steps (owner, 31 Oct
   * 2026, every existing customer redoes them once). Absent from a V0 that predates it, which is
   * also how the app knows not to send `flowVersion` there (`supportsStepVersions`).
   */
  profileUpdateRequired: z.boolean().optional(),
});

export type ProfileData = z.infer<typeof profileDataSchema>;

/**
 * `PUT /v1/me/profile` — the request body.
 *
 * A PATCH in behaviour: an OMITTED key preserves the stored answer, an explicit `null` CLEARS
 * it, and a value replaces it. Everything but `name` is therefore optional at the type level,
 * which is what lets a caller send `{ name }` alone without erasing seven answers.
 *
 * The taste-profile wizard does not use that latitude — it prefills every answer and submits
 * every answer, so an untouched field round-trips its own value rather than relying on omission.
 * The one exception is `householdStructure`, which the wizard no longer asks and so omits. See
 * `profileUpdateFrom`.
 */
export interface ProfileUpdateRequest {
  readonly name: string;
  readonly householdStructure?: string | null;
  readonly mealStructure?: string | null;
  readonly pressingIssue?: string | null;
  readonly dietaryPreference?: string | null;
  readonly grownUpEating?: readonly string[] | null;
  readonly regionPreference?: string | null;
  readonly genderPreference?: string | null;
  readonly householdAdults?: number | null;
  readonly householdKids?: number | null;
  readonly householdElders?: number | null;
  readonly nonVegPreferences?: readonly string[] | null;
  readonly oilLevel?: string | null;
  readonly gheeOnly?: boolean | null;
  readonly mealHassles?: readonly string[] | null;
  /**
   * The version of the profile steps that sent this save (`PROFILE_STEPS_VERSION`). Sent only to a
   * V0 that reports `profileUpdateRequired`: an older one refuses keys it does not know.
   */
  readonly flowVersion?: number;
}

/**
 * `GET /v1/me` — 200.
 *
 * Identity plus the inlined profile. The seven questionnaire answers are returned HERE and by
 * `PUT /v1/me/profile` and nowhere else — no booking, tracking or notification projection
 * carries them — so this is the one read the edit form prefills from.
 */
export const meResponseSchema = profileDataSchema.extend({
  id: z.string(),
  role: z.enum(['user', 'cook']),
  status: z.string(),
  phone: z.string(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

/**
 * `PUT /v1/me/profile` — 200.
 *
 * The committed projection, computed from the written row — a superset of the `{ name }` this
 * operation used to return. It is parsed rather than discarded because it is the authority on
 * what was actually stored, including the recomputed `profileComplete`: the save path merges it
 * straight into the `/me` cache so the completion card is correct without waiting for a refetch.
 */
export const updateProfileResponseSchema = profileDataSchema;
