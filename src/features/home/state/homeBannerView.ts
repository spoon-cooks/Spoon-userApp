import { formatMinutes } from '@core/format';
import type { RatingSelection } from '@ui';

import type { BookingStatus } from '@features/booking';

/**
 * The Home booking banner, as a typed state machine — Figma `367:71` "Banner cards" (task §6/§7).
 *
 * ## The rule this file exists to enforce
 *
 * The banner is chosen by what the SERVER says about the booking. Not by a timer, not by
 * comparing the device clock to a scheduled start, not by remembering what the last render
 * showed. Every discriminator below is a field on a payload; where a field does not exist, the
 * state is NOT SYNTHESISED — it is declared underivable and recorded in
 * `docs/FINAL_FIGMA_BACKEND_GAPS.md`. That is the whole of §7's "do not manufacture backend
 * state in production".
 *
 * ## Eleven drawn cards, eight distinct presentations
 *
 * `367:71` draws eleven cards. Three pairs differ ONLY in which cook is pictured — `337:4307`
 * and `394:1235` are both "Arrived", `337:4330` and `394:1257` are both "Live booking",
 * `337:4495` and `394:1279` are both "Share your rating!" — so the cook is DATA, not a variant.
 * Reassignment changes the drawn TITLE in exactly two places (`394:1210` "Reassigned" where
 * `337:4261` says "Upcoming booking", `393:1050` "Reassigned" where `337:4284` says "Arriving"),
 * which is why only those two carry a distinct variant here.
 *
 * Collapsing the pairs is not a simplification of the design; drawing them as separate variants
 * would be a mis-reading of it, and would produce two code paths that must stay identical
 * forever.
 *
 * ## Destination
 *
 * Every banner leads to the SAME route — the booking lifecycle host `/booking/[id]` — because
 * every Figma page named in §7 (8a, 8b, 8c, 9a, 9b, 10a, 10b, 11, 12a, 12b, 14a) is a VIEW of
 * that one screen, selected there by server state. `figmaPage` is recorded so the mapping is
 * auditable, but the banner does NOT tell the destination which view to draw: doing so would let
 * a stale Home decide what a fresh booking read should render.
 */

/** The drawn presentations. `reassigned*` are selected from backend assignment history. */
export type HomeBannerVariant =
  | 'confirmed'
  | 'reassignedConfirmed'
  | 'cancelled'
  | 'arriving'
  | 'reassignedArriving'
  | 'arrived'
  | 'live'
  | 'rate';

/**
 * The Figma page each variant leads to, per §7. Documentation with a type — it is asserted in
 * tests so the table cannot drift from the brief silently.
 */
export const BANNER_DESTINATION_PAGE: Record<HomeBannerVariant, string> = Object.freeze({
  confirmed: '8a',
  reassignedConfirmed: '8b',
  cancelled: '8c',
  arriving: '9a/9b',
  reassignedArriving: '10a/10b',
  arrived: '11',
  live: '12a/12b',
  rate: '14a',
});

export interface HomeBannerDestination {
  /** The lifecycle host. One route, many views. */
  readonly route: '/booking/[id]';
  readonly bookingId: string;
  /** Which Figma page the server state is expected to resolve to. Audit trail, not an instruction. */
  readonly figmaPage: string;
}

export interface HomeBannerRating {
  readonly description: string;
  /**
   * A value the SERVER already holds.
   *
   * Typed as `RatingSelection` — the nine numerals OR `5+` — because `383:765` draws `5+` as a
   * finished state of this very card, so a card rendering a stored rating must be able to show
   * it. Whether the server can currently STORE it is a separate question, answered in
   * `docs/FINAL_FIGMA_BACKEND_GAPS.md`.
   */
  readonly value?: RatingSelection;
}

export interface HomeBannerViewModel {
  readonly variant: HomeBannerVariant;
  readonly bookingId: string;
  /** `337:4356` — the brand-yellow title. */
  readonly title: string;
  /** `337:4366` / `337:4367` / `337:4368`. Present on `cancelled` too — see `HomeBookingBanner`'s
   * doc comment for why that deviates from `393:1072`'s literal drawing. */
  readonly dateLabel?: string;
  readonly timeLabel?: string;
  readonly cookName?: string;
  readonly cookPhotoUrl?: string;
  /** Drawn only if `cookPhotoUrl` fails to load. See `HomeBannerInput.cookPhotoFallbackUrl`. */
  readonly cookPhotoFallbackUrl?: string;
  /** `337:4412` — "Arriving in" / "Arrived at" / "Time left". Absent on the block-badge forms. */
  readonly badgeCaption?: string;
  /** `337:4370` — "Confirmed!" / "Completed!" / "12 mins" / "1:12 PM" / "Cancelled". */
  readonly badgeValue?: string;
  /** `393:1202` — the apology row. Present only on `cancelled`, appended below its cook block and
   * badge rather than replacing them. */
  readonly notice?: string;
  /** `336:4235` — present only when the server says the booking may be rated. */
  readonly rating?: HomeBannerRating;
  readonly destination: HomeBannerDestination;
}

/**
 * What the banner needs to know. Every field maps to a real response field; the server remains the
 * authority for lifecycle state, reassignment, arrival time, ETA and rateability.
 */
export interface HomeBannerInput {
  readonly bookingId: string;
  readonly status: BookingStatus;
  /** `GET /v1/bookings/:id` → `cook.name` / `cook.photoUrl`. */
  readonly cookName?: string | null;
  readonly cookPhotoUrl?: string | null;
  /**
   * The bundled cut-out to show if `cookPhotoUrl` FAILS TO LOAD, not if it is absent.
   *
   * Set only when `cookPhotoUrl` is a hosted URL, because that is the only case with anything to
   * fall back FROM: when the bundled asset is already the primary there is nothing behind it.
   * A hosted photo that 404s otherwise leaves an empty panel, which makes a bad URL strictly
   * worse than no URL — the bundled tier having been skipped the moment the field was non-null.
   */
  readonly cookPhotoFallbackUrl?: string | null;
  /** Preformatted by `adapters.ts` from `scheduledStart`. Presentation of a server instant. */
  readonly dateLabel: string;
  readonly timeLabel: string;
  /** `GET /v1/bookings/:id/tracking` → `eta.estimatedArrivalAt`, already turned into minutes. */
  readonly etaMinutes?: number | null;
  /** `timing.expectedEnd` turned into minutes. The ONLY authority for "Time left". */
  readonly minutesLeft?: number | null;
  /**
   * The same instant, measured the other way: minutes PAST `timing.expectedEnd`.
   *
   * `minutesLeft` floors at zero, so a service nobody has ended showed "0 mins" indefinitely under
   * a "Time left" caption. Above zero this replaces both.
   */
  readonly minutesOver?: number | null;
  /**
   * "Arrived at 1:12 PM" (`337:4307`).
   *
   * `timing.arrivedAt`, persisted by the backend arrival transition. `actualStart` is when service
   * started and is intentionally not used for this label.
   */
  readonly arrivedAtLabel?: string | null;
  /** `allowedActions.canRate`. The server decides rateability; this never re-derives it. */
  readonly canRate?: boolean;
  /** `cancellation.cancelledBy === 'system'` distinguishes 8c from a customer cancellation. */
  readonly cancelledBy?: string | null;
  /**
   * Whether `scheduledStart + durationMinutes` is already in the past — `slotHasEnded` in
   * `adapters.ts`, computed against the skew-corrected server clock Home already holds.
   *
   * Read ONLY by the cancelled branch. A completed booking's card is retired by `canRate`, which
   * is the server's decision and outlives the slot on purpose so a customer can still rate it.
   */
  readonly slotEnded?: boolean;
  /**
   * Whether this booking's cook was reassigned.
   *
   * Derived from the backend's durable replacement-assignment history. An absent field remains
   * backward-compatible and never becomes a guessed reassignment.
   */
  readonly reassigned?: boolean;
  /** `336:4239` — server copy for the 5+ legend. */
  readonly ratingPrompt?: string;
  /** True when the server has handed an elapsed, unserved booking to support. */
  readonly recoveryHandoff?: boolean;
}

/** The drawn copy. Labels on a card; no endpoint serves them and none is expected to. */
const COPY = {
  confirmed: 'Upcoming booking',
  reassigned: 'Reassigned',
  cancelled: 'Cancelled',
  arriving: 'Arriving',
  arrived: 'Arrived',
  live: 'Live booking',
  rate: 'Share your rating!',
  cancelledNotice: 'We sincerely apologize for cancelling this booking',
  captionArrivingIn: 'Arriving in',
  captionArrivedAt: 'Arrived at',
  captionTimeLeft: 'Time left',
  /** Past the service end. No frame draws it; agreed with the product owner 2026-09-18. */
  captionRunningOver: 'Running over',
  badgeConfirmed: 'Confirmed!',
  attention: 'Booking needs attention',
  badgeAttention: 'Needs attention',
  badgeCompleted: 'Completed!',
  /** Shown where a number is designed but the server supplied none. Never a guessed figure. */
  badgeArrived: 'Arrived',
  badgeUnknown: '—',
  badgeCancelled: 'Cancelled',
} as const;

function minutesBadge(minutes: number | null | undefined, fallback: string): string {
  return minutes === null || minutes === undefined ? fallback : formatMinutes(minutes);
}

/**
 * The live card's badge — counting down to the service end, or up from it.
 *
 * Hours are broken out only past the end, because only an overrun is unbounded: a countdown is
 * capped by the booking, an overrun by nothing at all, and "230 mins" in a badge this size is
 * unreadable where "3h 50m" is not.
 */
function liveBadge(input: HomeBannerInput): { caption: string; value: string } {
  const over = input.minutesOver ?? 0;
  if (over <= 0) {
    return {
      caption: COPY.captionTimeLeft,
      value: minutesBadge(input.minutesLeft, COPY.badgeUnknown),
    };
  }

  const hours = Math.floor(over / 60);
  const minutes = over % 60;
  return {
    caption: COPY.captionRunningOver,
    value: hours === 0 ? formatMinutes(minutes) : `${hours}h ${minutes}m`,
  };
}

/**
 * Selects the banner for one active booking, or `null` when the design draws none.
 *
 * Returns `null` — rather than a card with invented copy — for a status the file has no card for.
 * Today the only such case is a booking the CUSTOMER cancelled: `393:1072` is the apology Spoon
 * owes for cancelling, and showing it for a cancellation the customer chose would apologise for
 * their own decision.
 */
export function homeBannerFor(input: HomeBannerInput): HomeBannerViewModel | null {
  const variant = variantFor(input);
  if (variant === null) return null;

  const destination: HomeBannerDestination = {
    route: '/booking/[id]',
    bookingId: input.bookingId,
    figmaPage: BANNER_DESTINATION_PAGE[variant],
  };

  const identity = {
    bookingId: input.bookingId,
    dateLabel: input.dateLabel,
    timeLabel: input.timeLabel,
    cookName: input.cookName ?? '',
    ...(input.cookPhotoUrl === null || input.cookPhotoUrl === undefined
      ? {}
      : { cookPhotoUrl: input.cookPhotoUrl }),
    ...(input.cookPhotoFallbackUrl === null || input.cookPhotoFallbackUrl === undefined
      ? {}
      : { cookPhotoFallbackUrl: input.cookPhotoFallbackUrl }),
    destination,
  };

  switch (variant) {
    case 'cancelled':
      // Cook block + "Cancelled" badge (same shape as every other card) PLUS the apology row —
      // a deliberate departure from `393:1072`'s literal "no cook block, no badge" drawing, per
      // explicit product reference showing both present alongside the notice.
      return {
        ...identity,
        variant,
        title: COPY.cancelled,
        badgeValue: COPY.badgeCancelled,
        notice: COPY.cancelledNotice,
      };

    case 'confirmed':
      return {
        ...identity,
        variant,
        title: input.recoveryHandoff === true ? COPY.attention : COPY.confirmed,
        badgeValue: input.recoveryHandoff === true ? COPY.badgeAttention : COPY.badgeConfirmed,
      };

    case 'reassignedConfirmed':
      return {
        ...identity,
        variant,
        title: input.recoveryHandoff === true ? COPY.attention : COPY.reassigned,
        badgeValue: input.recoveryHandoff === true ? COPY.badgeAttention : COPY.badgeConfirmed,
      };

    case 'arriving':
      return {
        ...identity,
        variant,
        title: COPY.arriving,
        badgeCaption: COPY.captionArrivingIn,
        badgeValue: minutesBadge(input.etaMinutes, COPY.badgeUnknown),
      };

    case 'reassignedArriving':
      return {
        ...identity,
        variant,
        title: COPY.reassigned,
        badgeCaption: COPY.captionArrivingIn,
        badgeValue: minutesBadge(input.etaMinutes, COPY.badgeUnknown),
      };

    case 'arrived':
      return {
        ...identity,
        variant,
        title: COPY.arrived,
        badgeCaption: COPY.captionArrivedAt,
        // The persisted arrival instant is used; `actualStart` is intentionally not substituted.
        badgeValue: input.arrivedAtLabel ?? COPY.badgeArrived,
      };

    case 'live':
      return {
        ...identity,
        variant,
        title: COPY.live,
        badgeCaption: liveBadge(input).caption,
        badgeValue: liveBadge(input).value,
      };

    case 'rate':
      return {
        ...identity,
        variant,
        title: COPY.rate,
        badgeValue: COPY.badgeCompleted,
        rating: {
          description:
            input.ratingPrompt ??
            'Reward the cook with a 5+ rating if the service exceeded your expectations & keep them motivated!',
        },
      };
  }
}

/**
 * Status (plus the two payload facts that statuses cannot express) → variant.
 *
 * ## `created` is not confirmed
 *
 * `created` and `assigned` used to share the confirmed card, on the reading that "from the
 * customer's side the booking is confirmed either way". They are not the same thing:
 * `assigned` means the payment was captured and a cook was matched, and `created` means the
 * payment has NOT been finalized. Drawing "Confirmed!" over an unpaid booking tells the customer
 * their money moved and their cook is coming when neither is true — and, because a `created`
 * booking sits in the active list until its service window elapses, it would keep saying so.
 *
 * There is no drawn card for "payment pending", and inventing one is not this file's decision to
 * make, so the honest answer is no banner: Home falls back to its pre-booking variant and the
 * customer is not told something false. `null` is already how this function declines a status it
 * has no card for.
 */
function variantFor(input: HomeBannerInput): HomeBannerVariant | null {
  const reassigned = input.reassigned === true;

  switch (input.status) {
    // Payment not finalized. See the note above: no card claims confirmation for it.
    case 'created':
      return null;

    case 'assigned':
      return reassigned ? 'reassignedConfirmed' : 'confirmed';

    case 'cook_en_route':
      return reassigned ? 'reassignedArriving' : 'arriving';

    case 'cook_arrived':
      return 'arrived';

    case 'cooking':
      return 'live';

    case 'completed':
      // The rate card is offered only when the SERVER says the booking may be rated. A completed
      // booking already rated draws no banner, which is what `allowedActions.canRate` is for.
      return input.canRate === true ? 'rate' : null;

    case 'cancelled':
      /*
       * The apology is for a slot the customer is about to lose, so it stops being Home's
       * business once that slot has passed.
       *
       * `GET /v1/me/bookings/active` keeps a cancelled booking for a server-side backstop counted
       * from `actual_end`, which is measured in days — correct for the endpoint, whose job is to
       * keep completed-but-unrated work reachable, and far too long for a card whose only message
       * is "the booking you have this evening is off". Left alone it sat on Home for days after
       * the evening in question, which is what was observed: a Sep 11 booking still apologising
       * on Sep 12.
       *
       * After the slot ends the record belongs to My bookings, which is the screen for bookings
       * that have already happened — or, here, already not happened.
       */
      if (input.slotEnded === true) return null;

      // Only Spoon's own cancellation apologises. `cancelledBy` is the server's word for who did
      // it; absence is treated as NOT-system, so a customer cancellation never shows the apology.
      return input.cancelledBy === 'system' ? 'cancelled' : null;
  }
}
