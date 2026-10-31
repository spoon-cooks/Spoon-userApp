import { z } from 'zod';

import { refundTrackerSchema } from '@features/refunds';

/**
 * Booking DTOs — quote, create, detail, active, history, and the lifecycle reads.
 *
 * Verified against a live instance on 2026-08-18.
 *
 * ## Statuses are the backend's, exactly
 *
 * `created | assigned | cook_en_route | cook_arrived | cooking | completed | cancelled`. The app
 * adds none. Reassignment is an EVENT reflected in the payload, not an eighth status, and
 * auto-cancellation is `cancelled` plus cancellation metadata — the UI distinguishes them by
 * reading those fields, never by inventing a status.
 *
 * ## `allowedActions` is authority, not a hint
 *
 * The server says whether this booking may be cancelled, rescheduled, extended, rated, tipped or
 * called about. The client does NOT re-derive any of them from status and time. That is the
 * single most important line in this file: every one of those rules has a policy behind it
 * (bands, reschedule counts, extension windows) that lives on the server and moves without a
 * release.
 */

export const bookingStatusSchema = z.enum([
  'created',
  'assigned',
  'cook_en_route',
  'cook_arrived',
  'cooking',
  'completed',
  'cancelled',
]);

export type BookingStatus = z.infer<typeof bookingStatusSchema>;

export const slotTypeSchema = z.enum(['scheduled', 'instant']);

/** The immutable price snapshot. Integer paise; the client never recomputes any of it. */
export const priceSchema = z.object({
  amountPaise: z.number().int().nonnegative(),
  durationMinutes: z.number().int().positive(),
  serviceAmountPaise: z.number().int().nonnegative(),
  taxRateBps: z.number().int().nonnegative(),
  taxAmountPaise: z.number().int().nonnegative(),
  totalAmountPaise: z.number().int().nonnegative(),
  currency: z.literal('INR'),
  pricingVersion: z.string(),
  /**
   * The struck-through "was" price shown at checkout, pre-tax (backend DEC-088). Booking detail
   * only; null/absent when there was none.
   */
  strikeAmountPaise: z.number().int().positive().nullish(),
});

export type PriceDto = z.infer<typeof priceSchema>;

/** `POST /v1/bookings/quote` — the quote carries its own expiry. */
export const quoteResponseSchema = z.object({
  quote: priceSchema.extend({ validUntil: z.string().datetime() }),
  slotType: slotTypeSchema,
  scheduledStart: z.string().datetime().nullable(),
  durationMinutes: z.number().int().positive(),
});

export type QuoteResponse = z.infer<typeof quoteResponseSchema>;

export const bookingAddressSchema = z.object({
  label: z.string(),
  /** Immutable customer-selected booking target, captured by the backend. */
  latitude: z.number(),
  longitude: z.number(),
  flat: z.string().nullable(),
  tower: z.string().nullable(),
  society: z.string().nullable(),
  street: z.string(),
  pincode: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  hubName: z.string().nullable(),
  receiverName: z.string().nullable(),
  receiverPhone: z.string().nullable(),
});

/**
 * The assigned cook on `GET /v1/bookings/:id`.
 *
 * ## This schema described a cook the backend has never sent
 *
 * It read `id`, `name`, `photoUrl` and a numeric `rating`. The backend sends `cookId`,
 * `displayName`, `profileImageUrl` and `rating` as an OBJECT — `{ average, count }`. Three of
 * those mismatches would only have emptied the fields, because every one was optional and Zod
 * drops unknown keys. The fourth did far worse: an object where `z.number()` was expected is a
 * type error, not a missing value, so `bookingDetailSchema.parse` THREW on every booking that
 * had a cook.
 *
 * The blast radius was the whole detail read. `useBookingDetail` errored, `detailData` stayed
 * null, and Home — which builds its banner from the detail — silently drew the pre-booking
 * variant. A confirmed booking with a cook assigned to it produced no Upcoming banner at all,
 * and nothing on screen said why. The booking detail screen was unreachable for the same reason.
 *
 * ## Why this normalises instead of renaming everywhere
 *
 * The output keeps the shape every existing reader already uses (`id`, `name`, `photoUrl`,
 * `rating`), so the fix lands entirely at the boundary — which is where a provider's field names
 * belong — rather than rippling through adapters and screens. Both spellings are accepted so the
 * app parses whether it is pointed at the current backend or an older deployment, and `rating`
 * takes either the object or a bare number for the same reason.
 *
 * `average` is what the card shows; `count` is carried through so a reader that wants "4.8 (312)"
 * does not need a second request.
 */
const cookRatingSchema = z.union([
  z.object({ average: z.number(), count: z.number().int().nonnegative().optional() }),
  z.number().transform((average) => ({ average, count: undefined })),
]);

export const bookingCookSchema = z
  .object({
    // What the backend sends today.
    cookId: z.string().optional(),
    displayName: z.string().optional(),
    profileImageUrl: z.string().nullish(),
    // Tolerated legacy spellings, so an older deployment still parses.
    id: z.string().optional(),
    name: z.string().optional(),
    photoUrl: z.string().nullish(),
    // Not part of this projection — V0 carries no cook contact detail on the booking — but
    // accepted rather than rejected if a deployment ever adds it.
    phone: z.string().nullish(),
    rating: cookRatingSchema.nullish(),
    /**
     * The typed `CustomerCookCard` fields the deployed backend has always sent and this schema
     * used to strip. Every one is `nullish`-tolerant so an older deployment still parses; the
     * card was built to drop what is absent, never to invent it.
     *
     * `profileCode` is the backend's stable card identity. The app no longer resolves anything
     * by it: a cook's photo and dishes come from the backend (DEC-114).
     *
     * `profileVariant` is the backend's veg/mixed presentation decision, derived server-side
     * from the CUSTOMER's stored `dietaryPreference`. The client renders the variant it is
     * told; it never re-derives one.
     */
    profileCode: z.string().nullish(),
    profileVariant: z.enum(['veg', 'mixed']).nullish(),
    region: z.string().nullish(),
    languages: z.array(z.string()).nullish(),
    cuisines: z.array(z.string()).nullish(),
    specialties: z.array(z.string()).nullish(),
    gender: z.string().nullish(),
    spoonTrained: z.boolean().nullish(),
    backgroundVerified: z.boolean().nullish(),
    hygieneVerified: z.boolean().nullish(),
  })
  .transform((cook) => ({
    id: cook.cookId ?? cook.id,
    name: cook.displayName ?? cook.name,
    phone: cook.phone,
    /** The number the card draws. `null` when the server published none. */
    rating: cook.rating?.average ?? null,
    ratingCount: cook.rating?.count ?? null,
    /**
     * Absence is normalised to `null`, never `undefined`.
     *
     * The two spellings would otherwise disagree about what "no photo" looks like — a backend
     * sending `profileImageUrl: null` produced `undefined` here purely because `??` fell through
     * to the legacy key. Readers check both today, but one shape for one meaning is what keeps
     * that true.
     */
    photoUrl: cook.profileImageUrl ?? cook.photoUrl ?? null,
    profileCode: cook.profileCode ?? null,
    /** Absent (older deployment) keeps the presentation the card has always defaulted to. */
    profileVariant: cook.profileVariant ?? null,
    region: cook.region ?? null,
    languages: cook.languages ?? null,
    cuisines: cook.cuisines ?? null,
    specialties: cook.specialties ?? null,
    gender: cook.gender ?? null,
    spoonTrained: cook.spoonTrained ?? null,
    backgroundVerified: cook.backgroundVerified ?? null,
    hygieneVerified: cook.hygieneVerified ?? null,
  }));

/**
 * Service timing.
 *
 * `actualStart` and `expectedEnd` are the ONLY authority for the in-service countdown.
 * `scheduledStart + durationMinutes` is explicitly NOT the service end: an extension moves
 * `expectedEnd`, and a late start moves it too.
 */
export const bookingTimingSchema = z.object({
  /** Persisted cook arrival time, distinct from service start. */
  arrivedAt: z.string().datetime().nullish(),
  actualStart: z.string().datetime().nullable(),
  expectedEnd: z.string().datetime().nullable(),
  actualEnd: z.string().datetime().nullable(),
});

/**
 * `POST /v1/bookings/:id/tips` - 201 (`created`) or 202 (`processing`).
 *
 * The SAME shape `POST /bookings/:id/payments/order` returns, which is the point: one client
 * pipeline - order, open checkout, verify, refetch - serves both, and a tip is not a second,
 * looser way to take money.
 *
 * `providerOrderId` is `null` while the provider order is not yet confirmed (the 202), never
 * absent. `keyId` is Razorpay's PUBLIC key, attached per order so rotating it or moving between
 * the test and live merchant accounts needs no app release; `null` only where none is
 * configured, which is reachable in development alone. The secret never leaves the backend.
 */
export const tipOrderSchema = z.object({
  tipId: z.string(),
  paymentId: z.string(),
  bookingId: z.string(),
  cookId: z.string(),
  provider: z.literal('razorpay'),
  amountPaise: z.number().int().nonnegative(),
  currency: z.literal('INR'),
  status: z.enum(['created', 'processing', 'captured', 'failed']),
  providerOrderId: z.string().nullable(),
  keyId: z.string().nullable(),
});

export type TipOrderDto = z.infer<typeof tipOrderSchema>;

/**
 * `POST /v1/bookings/:id/tips/verify` - the tip after verification.
 *
 * Identical to the order without `keyId`: a settled tip has no checkout left to open. What the
 * client reads from it is `status`; what it TRUSTS is the booking it then refetches.
 */
export const tipStatusSchema = tipOrderSchema.omit({ keyId: true });

export type TipStatusDto = z.infer<typeof tipStatusSchema>;

/**
 * `POST /v1/bookings/:id/extensions` - 201, the payment-pending quote.
 *
 * Capacity is reserved first and the checkout order attached after that transaction commits, so
 * a provider outage cannot hold the hub lock open. The quote therefore always names an
 * `extensionId` - which the verify route needs - and may still carry a null `providerOrderId`.
 *
 * ## `keyId`
 *
 * The backend attaches the public Razorpay key here, exactly as `POST /payments/order` and
 * `POST /tips` do; `ExtensionQuote` declares it in the published contract. It was once absent,
 * which is why the field is modelled `.nullable().optional()` rather than required - a tolerant
 * shape that parses both the old and the current reply, and leaves the decision about a missing
 * key to `useCreateExtension`, which fails CLOSED rather than opening Razorpay against a guessed
 * or app-embedded one.
 *
 * `pricePaise` is deprecated in the contract and deliberately not read: `totalAmountPaise` is
 * what the customer is charged.
 */
export const extensionQuoteSchema = z.object({
  extensionId: z.string(),
  state: z.literal('payment_pending'),
  paymentId: z.string(),
  minutes: z.number().int().positive(),
  taxAmountPaise: z.number().int().nonnegative(),
  totalAmountPaise: z.number().int().nonnegative(),
  currency: z.literal('INR'),
  pricingVersion: z.string(),
  newExpectedEnd: z.string(),
  calculatedAt: z.string(),
  providerOrderId: z.string().nullable(),
  keyId: z.string().nullable().optional(),
});

export type ExtensionQuoteDto = z.infer<typeof extensionQuoteSchema>;

/**
 * `PUT /v1/bookings/:id/rating` - 200/201.
 *
 * Parsed rather than discarded because two of its fields answer questions the client cannot:
 * `created` is false when the call REPLAYED an existing rating (there is one rating per booking,
 * so a retry is not a second one), and `exceptional` is the STORED answer, which on a replay is
 * the first submission's rather than this request's.
 *
 * `isFivePlus` is the EARNINGS term - exactly `stars === 5`, unaffected by `exceptional` - and is
 * carried through unchanged. Nothing in this app pays anybody, so it is read and not acted on.
 */
export const ratingResultSchema = z.object({
  ratingId: z.string(),
  bookingId: z.string(),
  cookId: z.string(),
  stars: z.number(),
  isFivePlus: z.boolean(),
  exceptional: z.boolean(),
  /** The rate card's chip keys and "Prefer a different cook next time?" (Figma `1603:50`). */
  chips: z.array(z.string()).nullish(),
  avoidCook: z.boolean().nullish(),
  /** The photos, video and voice note attached to the rating. */
  media: z
    .array(z.object({ mediaId: z.string(), kind: z.enum(['photo', 'video', 'voice']) }))
    .nullish(),
  created: z.boolean(),
});

export type RatingResultDto = z.infer<typeof ratingResultSchema>;

export const ratingMediaKindSchema = z.enum(['photo', 'video', 'voice']);
export type RatingMediaKind = z.infer<typeof ratingMediaKindSchema>;

/**
 * `POST /v1/bookings/:id/rating/media` — a signed upload for one rating photo, video or voice
 * note. The app PUTs the file to `upload.url` carrying exactly `upload.headers`, then names
 * `mediaId` in the rating.
 */
export const ratingMediaUploadSchema = z.object({
  mediaId: z.string(),
  kind: ratingMediaKindSchema,
  upload: z.object({
    method: z.literal('PUT'),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()),
    expiresAt: z.string(),
  }),
});

export type RatingMediaUploadDto = z.infer<typeof ratingMediaUploadSchema>;

/**
 * `GET /v1/bookings/:id/rating/media` — the customer's own voice note, photos and video on their
 * rating, each on a signed link that lasts about ten minutes. Empty when unrated, and after 180
 * days. Read back so a reopened visit redraws its submitted rate card.
 */
export const myRatingMediaSchema = z.object({
  media: z.array(
    z.object({
      mediaId: z.string(),
      kind: ratingMediaKindSchema,
      contentType: z.string(),
      sizeBytes: z.number(),
      durationMs: z.number().nullable(),
      url: z.string().url(),
    }),
  ),
});

export type MyRatingMediaDto = z.infer<typeof myRatingMediaSchema>;

export const bookingReassignmentSchema = z.object({
  /** True when the current assignment replaced an earlier cook assignment. */
  occurred: z.boolean(),
  sequence: z.number().int().nonnegative(),
  reassignedAt: z.string().datetime().nullable(),
});

/**
 * The backend's authoritative recovery state, published beside `status`.
 *
 * `support_handoff` is how a booking whose whole service window elapsed unserved stops being an
 * ordinary "upcoming" one: the wire status is still `assigned` — `no_show` is deliberately not a
 * booking status — so this fact is the ONLY truthful thing to render. `pending` means Spoon is
 * still actively recovering the booking. Tolerant (`nullish`) so a backend that predates the
 * field parses unchanged.
 */
export const bookingRecoverySchema = z.object({
  state: z.enum(['pending', 'support_handoff']),
  openedAt: z.string().datetime(),
});

export type BookingRecoveryDto = z.infer<typeof bookingRecoverySchema>;

/**
 * The rating a booking ALREADY carries, on the detail payload.
 *
 * `allowedActions.canRate` says whether a booking may still be rated, which is the only thing
 * this payload used to carry -- and the completion screen was left inferring three facts from
 * that one bit: whether a rating exists (fair), whether it was the `5+` appreciation (it cannot
 * know), and whether WRITTEN feedback was given (it cannot know either). The result was a 4.5
 * rendering as a lone "5+" chip, and "Thanks for sharing your feedback!" shown to a customer who
 * wrote nothing.
 *
 * BACKEND_PENDING: none of these three fields is sent today. They are declared `nullish` so the
 * app reads them the moment the backend adds them, and degrades to the in-memory rating until
 * then (which survives only while the screen stays open). The names here are the contract asked
 * for -- `ratingStars`, `ratingExceptional`, `ratingFeedback` -- and a different spelling on the
 * wire is silently stripped by Zod rather than failing loudly, so they have to match.
 *
 * `ratingStars` is already published on `GET /v1/me/bookings*` (`bookingSummarySchema`), so this
 * is the same field on a payload that lacks it, not a new concept.
 */
export const bookingRatingSchema = z.object({
  /** 1..5 on a half-step scale, as `PUT /v1/bookings/:id/rating` accepts it. */
  ratingStars: z.number().nullish(),
  /** The `5+` appreciation, which is NOT the number 5 -- see `RATING_EXCEPTIONAL`. */
  ratingExceptional: z.boolean().nullish(),
  /** The words the customer wrote, or null when they rated without writing any. */
  ratingFeedback: z.string().nullish(),
});

export const allowedActionsSchema = z.object({
  canCancel: z.boolean(),
  canReschedule: z.boolean(),
  canExtend: z.boolean(),
  canRate: z.boolean(),
  canTip: z.boolean(),
  canCallCook: z.boolean(),
});

export type AllowedActions = z.infer<typeof allowedActionsSchema>;

export const bookingCancellationSchema = z.object({
  reasonCode: z.string().nullish(),
  reasonDetail: z.string().nullish(),
  cancelledAt: z.string().datetime().nullish(),
  cancelledBy: z.string().nullish(),
  band: z.string().nullish(),
  refundAmountPaise: z.number().int().nonnegative().nullish(),
  chargeAmountPaise: z.number().int().nonnegative().nullish(),
});

export const bookingDetailSchema = z.object({
  id: z.string(),
  status: bookingStatusSchema,
  slotType: slotTypeSchema,
  scheduledStart: z.string().datetime().nullable(),
  durationMinutes: z.number().int().positive(),
  /**
   * `durationMinutes` plus every CONFIRMED extension, summed by the server.
   *
   * `durationMinutes` is the ORIGINAL priced duration and deliberately never moves -- pricing and
   * capacity key off it, so a later, separately-priced add-on must not rewrite it. That leaves it
   * unable to describe an extended service: the row would read "45 mins" beside a start and end
   * 75 minutes apart.
   *
   * NOT computable here as `durationMinutes + extension.minutes`. `booking_extensions_one_live`
   * only forbids a second CONCURRENT extension, so a booking may hold several confirmed rows,
   * and `extension.minutes` names only the most recent -- that sum would under-report a
   * twice-extended service by the earlier extension's minutes. The server sums every confirmed
   * row, and guarantees the result agrees with `timing.expectedEnd - timing.actualStart`.
   *
   * BACKEND_PENDING: committed on `fix/booking-detail-rating-cancellation-fields`, not yet
   * deployed. `nullish` so the app reads it the moment it lands and falls back to
   * `durationMinutes` until then -- which is the correct answer for every unextended booking.
   */
  totalDurationMinutes: z.number().int().positive().nullish(),
  price: priceSchema,
  /** The payment hold. Past it, an unpaid booking is released by the worker. */
  holdExpiresAt: z.string().datetime().nullish(),
  /** What the customer already rated, and whether they wrote anything. See `bookingRatingSchema`. */
  ratingStars: z.number().nullish(),
  ratingExceptional: z.boolean().nullish(),
  ratingFeedback: z.string().nullish(),
  /** The rate card's chips the customer picked (keys). Absent from an older API. */
  ratingChips: z.array(z.string()).nullish(),
  address: bookingAddressSchema,
  mealNotes: z.string().nullable(),
  referenceUrl: z.string().nullable(),
  mealBrief: z.unknown().nullable(),
  cook: bookingCookSchema.nullable(),
  /**
   * The cook is due up to 15 minutes before (`early`) or 10 after (`late`) the booked start
   * (Business Rules Spec §8). Absent from an older API, which reads as on time.
   */
  cookArrival: z.enum(['early', 'late']).nullish(),
  timing: bookingTimingSchema,
  reassignment: bookingReassignmentSchema.nullish(),
  recovery: bookingRecoverySchema.nullish(),
  cancellation: bookingCancellationSchema.nullable(),
  /** The authoritative tip state — a captured tip is what the completed screen reports as paid. */
  tip: z
    .object({
      tipId: z.string(),
      amountPaise: z.number().int().positive(),
      status: z.enum(['payment_pending', 'captured', 'failed']),
      capturedAt: z.string().datetime().nullable(),
    })
    .nullish(),
  /** What was paid beyond the booking: each confirmed extension, and captured tips (V0). */
  charges: z
    .object({
      extensions: z.array(
        z.object({
          minutes: z.number().int().positive(),
          baseAmountPaise: z.number().int().nonnegative(),
          chargedAmountPaise: z.number().int().nonnegative(),
        }),
      ),
      tipAmountPaise: z.number().int().nonnegative(),
    })
    .nullish(),
  /** How the booking was paid, masked by the server ("UPI", "••••@okhdfcbank"). */
  paymentMethod: z
    .object({ type: z.string(), label: z.string(), detail: z.string().nullable() })
    .nullish(),
  /**
   * The Recurring visit this booking fulfils; null/absent for a one-time booking. Visit details
   * then reads "Recurring visit" and its Payment details are the plan's Autopay (Figma
   * `2165:13928`, `2165:14262`).
   */
  recurring: z.object({ recurringBookingId: z.string(), visitId: z.string() }).nullish(),
  /**
   * How many times the customer moved this booking -- capped at 1 by product policy (DEC-070),
   * the same field `BookingSummaryDto` carries and My bookings already draws a pill from.
   *
   * The DEPLOYED detail endpoint has been sending this all along; it was simply not declared
   * here, so Zod stripped it before anything could read it. `nullish` for the same reason it is
   * nullish on the summary: it is absent on a booking that has never been moved.
   */
  rescheduleCount: z.number().int().nullish(),
  /**
   * True when Ops moved this booking's time rather than the customer herself.
   * `rescheduleCount` alone cannot carry this: it is deliberately the customer's own
   * one-time budget and an admin move never spends it, so a booking Ops rescheduled reads
   * identically to one that was always at its current time without this field. `nullish`
   * for the same defensive reason `rescheduleCount` above is.
   */
  rescheduledByOps: z.boolean().nullish(),
  allowedActions: allowedActionsSchema,
});

export type BookingDetailDto = z.infer<typeof bookingDetailSchema>;

/**
 * `GET /v1/bookings/:id`.
 *
 * `serverTime` is the server's clock at the moment it built the response, and it sits BESIDE the
 * booking rather than inside it because it describes the response, not the booking. It is what
 * lets the in-service countdown correct for device clock drift: a handset whose clock is minutes
 * out would otherwise count down to the wrong moment against a correct `expectedEnd`.
 *
 * Optional, so a deployment that predates it parses rather than failing — the countdown then
 * falls back to the device clock, which is what it did before this field existed.
 */
export const bookingDetailResponseSchema = z.object({
  booking: bookingDetailSchema,
  serverTime: z.string().datetime().nullish(),
});

export type BookingDetailResponse = z.infer<typeof bookingDetailResponseSchema>;
/**
 * `POST /v1/bookings` — 201.
 *
 * The create response is a SUMMARY, not the full detail: it carries the identity, the price
 * snapshot and the payment hold, but no cook, timing or allowed actions, because none exist yet.
 * The caller refetches the detail rather than treating this as one.
 */
export const bookingCreateResponseSchema = z.object({
  booking: z.object({
    id: z.string(),
    status: bookingStatusSchema,
    slotType: slotTypeSchema,
    scheduledStart: z.string().datetime().nullable(),
    durationMinutes: z.number().int().positive(),
    price: priceSchema,
    holdExpiresAt: z.string().datetime().nullish(),
  }),
});

export type BookingCreateResponse = z.infer<typeof bookingCreateResponseSchema>;

/**
 * The booking's remembered cook — its last assignment, published on summaries so the history and
 * refund cards can draw her name, photograph and rating (`6:245`) without a detail fetch.
 * `.nullish()` throughout so a response from a deployment that predates the field still parses.
 */
export const bookingSummaryCookSchema = z.object({
  displayName: z.string(),
  profileCode: z.string().nullish(),
  profileImageUrl: z.string().nullish(),
  ratingAverage: z.number().nullish(),
  ratingCount: z.number().int().nullish(),
});
export type BookingSummaryCookDto = z.infer<typeof bookingSummaryCookSchema>;

/**
 * A row of `GET /v1/me/bookings` and `/me/bookings/active` — a summary, not the full detail.
 *
 * `cancelledBy` / `policyBand` / `rescheduleCount` / `ratingStars` are loose and nullish for the
 * same reason every other lifecycle-dependent field on this schema is (`recovery`,
 * `reassignment`): each is only meaningful once something specific has happened to the booking
 * (a cancellation, a reschedule, a rating), so a booking that never reached that state has none of
 * it — never an invented default. `cancelledBy`/`policyBand` are bare strings, not enums, matching
 * `bookingCancellationSchema.band` / `refundSchema.reason` elsewhere in this file: a new backend
 * category must not crash parsing before the client has a name for it.
 */
export const bookingSummarySchema = z.object({
  id: z.string(),
  status: bookingStatusSchema,
  slotType: slotTypeSchema,
  scheduledStart: z.string().datetime().nullable(),
  durationMinutes: z.number().int().positive(),
  price: priceSchema,
  /**
   * The session's own moments, as the detail's `timing` (start OTP, the end it runs to, end OTP).
   * Absent from a V0 that predates it; the cards then show the booked slot (`serviceWindowOf`).
   */
  timing: bookingTimingSchema.nullish(),
  addressLabel: z.string().nullish(),
  cook: bookingSummaryCookSchema.nullish(),
  reassignment: bookingReassignmentSchema.nullish(),
  recovery: bookingRecoverySchema.nullish(),
  /** Who cancelled it — `'customer' | 'operations' | 'system'`. Not sufficient alone to decide
   * Cancelled vs. Unfulfilled; see `myBookingPresentationFor` in `@features/history`. */
  cancelledBy: z.string().nullish(),
  /** The refund policy that decided a cancellation. The field that actually distinguishes
   * Unfulfilled (`'SERVICE_FAILURE_FULL_REFUND'`) from every other cancellation. */
  policyBand: z.string().nullish(),
  /** How many times the customer moved this booking. Capped at 1 by product policy (DEC-070). */
  rescheduleCount: z.number().int().nullish(),
  /** True when Ops, not the customer, moved this booking's time — see `bookingDetailSchema`'s
   * field of the same name for why `rescheduleCount` alone cannot carry this. */
  rescheduledByOps: z.boolean().nullish(),
  /** The customer's OWN rating for this specific booking — never the cook's aggregate average
   * (`cook.ratingAverage`, a different field with different meaning). */
  ratingStars: z.number().nullish(),
  /** The recurring plan this booking is a visit of; absent/null for a one-time booking. My
   * bookings tags and draws the two kinds differently. */
  recurringBookingId: z.string().nullish(),
});

export type BookingSummaryDto = z.infer<typeof bookingSummarySchema>;

export const bookingListResponseSchema = z.object({ bookings: z.array(bookingSummarySchema) });

/**
 * One page of `GET /v1/me/bookings`. `nextCursor` is OPAQUE — handed back as `?cursor=` and never
 * parsed — and `null` on the last page. A backend that predates it omits the key, which reads as
 * "no more pages": the list degrades to its first page rather than failing to parse.
 */
export const bookingHistoryPageSchema = z.object({
  bookings: z.array(bookingSummarySchema),
  nextCursor: z.string().nullish(),
});

/** One page of `GET /v1/me/bookings/active` — the same shape, and the same opaque `nextCursor`. */
export const bookingActivePageSchema = bookingHistoryPageSchema;

/** `GET /v1/bookings/:id/cancellation-preview`. Every number is the server's. */
export const cancellationPreviewSchema = z.object({
  bookingId: z.string(),
  cancellable: z.boolean(),
  band: z.string().nullish(),
  refundPercent: z.number().nullish(),
  minutesToStart: z.number().nullish(),
  serviceAmountPaise: z.number().int().nonnegative(),
  capturedAmountPaise: z.number().int().nonnegative(),
  refundAmountPaise: z.number().int().nonnegative(),
  chargeAmountPaise: z.number().int().nonnegative(),
  policyVersion: z.string(),
});

export type CancellationPreviewDto = z.infer<typeof cancellationPreviewSchema>;

/** `GET /v1/bookings/:id/reschedule-options`. Customer-initiated reschedule IS implemented. */
export const rescheduleOptionsSchema = z.object({
  bookingId: z.string(),
  durationMinutes: z.number().int().positive(),
  currentServiceStart: z.string().datetime(),
  rescheduleCount: z.number().int().nonnegative(),
  maxReschedules: z.number().int().nonnegative(),
  reschedulable: z.boolean(),
});

export type RescheduleOptionsDto = z.infer<typeof rescheduleOptionsSchema>;

/**
 * `GET /v1/me/refunds` and `GET /v1/bookings/:id/refunds` — the CUSTOMER refund projection.
 *
 * Both routes return the same `RefundRecord`, from the same mapper, so one schema parses both.
 *
 * ## The field names are the backend's, and they were wrong here
 *
 * This schema previously read `id`, `status` and `createdAt` — none of which the backend sends.
 * It sends `refundId`, `state` and `requestedAt`. Every field was ALSO optional, so the mismatch
 * could not fail: a perfectly valid refund parsed into an object of `undefined`s, and the screen
 * drew a row with no identity and no status pill. That is the exact failure mode a loose boundary
 * schema is supposed to be examined for — it does not throw, it quietly empties the record.
 *
 * ## `state` is not simplified
 *
 * `reconcile_required` and `failed_terminal` are real durable outcomes (DEC-067). Collapsing them
 * into "pending" would tell a customer their money is on the way when nobody knows that yet, so
 * the value is carried through and the screen renders what the server said.
 *
 * `reason` and `state` stay `z.string()` rather than enums for the same reason the profile option
 * ids do: this parses a list the customer opens, and a category added server-side must not make
 * the screen throw. The vocabularies are documented in the contract and asserted in tests.
 */
export const refundSchema = z.object({
  refundId: z.string(),
  /** Null for a Recurring debit's refund: a visit cancelled before it became a booking. */
  bookingId: z.string().nullable(),
  /** Why Spoon owes this refund. A bounded, customer-safe category. */
  reason: z.string(),
  amountPaise: z.number().int().nonnegative(),
  currency: z.string(),
  /** `requested | provider_pending | succeeded | failed_retryable | failed_terminal | reconcile_required` */
  state: z.string(),
  requestedAt: z.string(),
  /** Set once the provider settled it; null while the refund is still in flight. */
  completedAt: z.string().nullable(),
  /**
   * Booking context the drawn refund row heads with (`71:615`): the service date and duration,
   * and the booking's remembered cook. `.nullish()` for pre-field deployments, whose rows then
   * render the amount-only fallback they always did.
   */
  serviceStart: z.string().nullish(),
  durationMinutes: z.number().int().positive().nullish(),
  cook: bookingSummaryCookSchema.nullish(),
  /** The refund tracker (DEC-090). `.nullish()` for deployments that predate it. */
  tracker: refundTrackerSchema.nullish(),
});

export type RefundDto = z.infer<typeof refundSchema>;

export const refundListResponseSchema = z.object({ refunds: z.array(refundSchema) });

/** One page of `GET /v1/me/refunds` — see `bookingHistoryPageSchema` for `nextCursor`. */
export const refundHistoryPageSchema = z.object({
  refunds: z.array(refundSchema),
  nextCursor: z.string().nullish(),
});

/**
 * `GET /v1/bookings/:id/extension-options`.
 *
 * Read from the backend source (`ExtensionOption`) rather than from a live response: the
 * endpoint 404s until a booking is actually in service, which local seeding did not reach.
 * Marked as contract-read, not runtime-verified, in `docs/BACKEND_INTEGRATION_MAP.md`.
 *
 * `newExpectedEnd` is the server's — the client never adds minutes to a current end time.
 */
export const extensionOptionSchema = z.object({
  minutes: z.number().int().positive(),
  pricePaise: z.number().int().nonnegative(),
  taxAmountPaise: z.number().int().nonnegative(),
  taxRateBps: z.number().int().nonnegative(),
  totalAmountPaise: z.number().int().nonnegative(),
  currency: z.literal('INR'),
  pricingVersion: z.string(),
  newExpectedEnd: z.string().datetime(),
});

export type ExtensionOptionDto = z.infer<typeof extensionOptionSchema>;

export const extensionOptionsResponseSchema = z.object({
  options: z.array(extensionOptionSchema),
});

/**
 * `GET /v1/bookings/:id/tracking`.
 *
 * Deliberately permissive beyond the fields the UI reads: tracking carries operational movement
 * and confidence data that the customer app has no designed surface for, and enumerating it here
 * would create a boundary that breaks whenever operations adds a field.
 *
 * `eta.estimatedArrivalAt` is the ONLY ETA. It is nullable, and a null ETA renders the designed
 * "no ETA yet" presentation rather than a computed guess.
 *
 * ## `serviceOtp` — the code the customer reads out
 *
 * The 4-digit start/end codes are served HERE, not on the booking read (the customer app's
 * long-standing BE-1 gap, closed backend-side by exposing them on tracking). The server derives
 * them from state and returns `null` once a code is consumed or the booking is not in a state
 * where that code applies, so the client shows exactly what it is given and never remembers a
 * code past its window.
 *
 * `refreshAfterSeconds` is the server's own polling instruction — the client does not pick a
 * tracking interval.
 */
export const trackingSchema = z.object({
  bookingId: z.string(),
  status: bookingStatusSchema,
  eta: z.object({
    estimatedArrivalAt: z.string().datetime().nullable(),
    updatedAt: z.string().datetime().nullable(),
  }),
  /** Operational evidence is backend-owned and preserved even though V0 has no movement UI. */
  movement: z
    .object({
      status: z.enum([
        'awaiting_departure',
        'progress_observed',
        'position_stale',
        'arrived',
        'not_tracking',
      ]),
      lastEvidenceAt: z.string().datetime().nullable(),
      etaConfidence: z.enum(['usable', 'degraded', 'unavailable']),
    })
    .optional(),
  arrivedAt: z.string().datetime().nullable().optional(),
  reassignment: bookingReassignmentSchema.nullish(),
  timingVerdict: z.string().nullish(),
  serviceOtp: z
    .object({
      start: z.string().nullish(),
      end: z.string().nullish(),
    })
    .nullish(),
  destination: z
    .object({
      gateName: z.string().nullish(),
      societyName: z.string().nullish(),
    })
    .nullish(),
  refreshAfterSeconds: z.number().int().positive().nullish(),
  message: z.string().optional(),
});

export type TrackingDto = z.infer<typeof trackingSchema>;

/**
 * `GET /v1/bookings/:id/cook-contact` — the assigned cook's number, for a direct dial.
 *
 * A SEPARATE read, deliberately. V0's Call Cook hands the customer a cook's personal number
 * (owner decision 2026-08-18: no masking layer, no VoIP, no WhatsApp), so the number crosses the
 * wire only when Call is pressed — never on the booking detail that every service screen polls.
 *
 * The server refuses with `RESOURCE_NOT_FOUND` for every ineligible case — someone else's
 * booking, an unassigned cook, a terminal status — and deliberately does not say which, because
 * distinguishing them would confirm a booking exists. The client must therefore treat a 404 as
 * "contact currently unavailable" and NOT as "no such booking".
 */
export const cookContactSchema = z.object({
  cook: z.object({
    cookId: z.string(),
    displayName: z.string(),
    phone: z.string(),
  }),
});

export type CookContactDto = z.infer<typeof cookContactSchema>;
