import { formatMinutes, formatPaise } from '@core/format';
import { RATING_EXCEPTIONAL, RATING_VALUES } from '@ui';
import type { CookViewModel, DetailRow, RatingSelection } from '@ui';

import { currentSkewMs, serviceWindowOf } from '@core/time';
import { refundTrackerFrom } from '@features/refunds';
import type { RefundTrackerView } from '@features/refunds';

import type { BookingDetailDto, RefundDto, TrackingDto } from './api';
import { viewForBooking } from './state/bookingStatusView';
import type {
  BookingDetailViewModel,
  BookingSummaryViewModel,
  TipSheetViewModel,
  TrackingViewModel,
} from './types';
import type { BookingDetailsViewModel } from './components/BookingDetailsSheet';

/**
 * Booking DTO -> lifecycle view model.
 *
 * ## What comes from the server
 *
 * The status (and therefore the SCREEN), the price snapshot, the address, the cook, the service
 * timing and — decisively — `allowedActions`. Whether Cancel, Reschedule, Extend, Rate, Tip or
 * Call are offered is read from that block and never re-derived from status and clock.
 *
 * ## What comes from the design
 *
 * All copy. Banner titles, note text, CTA labels and section headings have no endpoint and are
 * not domain state; they are supplied as `base` and selected by status.
 *
 * ## What is NOT here, and why
 *
 * `clockSkewMs` is no longer invented and no longer stuck at zero: the booking read publishes
 * `serverTime`, which `useBookingDetail` measures against the device clock at the seam and files
 * in the central skew store (§29). This adapter reads that ONE observation rather than taking a
 * timestamp of its own, so every countdown in the app agrees about what time it is.
 *
 * The service OTP is NOT here either, but for a different reason: it is not on the booking read.
 * It arrives on `GET /v1/bookings/:id/tracking` and is applied by `trackingDetailFrom` below.
 */

/**
 * "45 mins" / "1 hr", from whichever duration the caller decided is the truthful one.
 *
 * `servedDurationMinutes` below picks it; this only formats. Both call sites rendered these same
 * three lines, so they share them rather than drifting apart.
 */
function durationTextFrom(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60} hr` : `${minutes} mins`;
}

/**
 * The duration the customer was actually served -- `totalDurationMinutes` when the server sends
 * it, `durationMinutes` otherwise.
 *
 * The two differ only once a booking has been EXTENDED, and only the server can tell them apart;
 * see `totalDurationMinutes` in `schemas.ts` for why this is not arithmetic.
 */
function servedDurationMinutes(dto: BookingDetailDto): number {
  return typeof dto.totalDurationMinutes === 'number' && dto.totalDurationMinutes > 0
    ? dto.totalDurationMinutes
    : dto.durationMinutes;
}

/** `3:1095` — Date / Start time / Duration / End Time, formatted from server instants. */
export function bookingRowsFrom(dto: BookingDetailDto): readonly DetailRow[] {
  const at = (value: string | null | undefined) =>
    typeof value === 'string' && value !== '' ? new Date(value) : null;

  /**
   * The start the customer actually experienced, not the one they booked.
   *
   * Service begins when the OTP is handed to the cook, which the server reports as
   * `timing.actualStart`. This row read `scheduledStart` alone, so a cook who arrived late left
   * the customer looking at a "Start time" that had already passed without anything happening,
   * and an "End Time" measured from it. `scheduledStart` remains the answer BEFORE service
   * starts, when there is no actual start to show.
   */
  const start = at(dto.timing.actualStart) ?? at(dto.scheduledStart);

  /**
   * And the end the server projects from it — `actualEnd` once the service is over,
   * `expectedEnd` while it is running.
   *
   * NOT computed as start + duration, deliberately. An EXTENDED booking's end moves without its
   * `durationMinutes` moving with it (`/extension-options` publishes `newExpectedEnd` for exactly
   * this reason), so arithmetic here would quietly under-report the end of every extended
   * service. The server owns the projection; this row picks which of its two answers applies.
   *
   * CONFIRMED with the backend: `expectedEnd` is written at the Start OTP as
   * `actual_start + purchased duration`, so it is already re-based on a late start, and a
   * confirmed extension updates the same column. Both reach here unmodified.
   */
  const end = at(dto.timing.actualEnd) ?? at(dto.timing.expectedEnd);

  const time = (date: Date | null) =>
    date === null || Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  /*
   * Beside the start and end above, so it MUST be the served duration: `durationMinutes` would
   * label a 75-minute extended service "45 mins" between two timestamps that disagree with it.
   */
  const duration = durationTextFrom(servedDurationMinutes(dto));

  return [
    {
      label: 'Date',
      value:
        start === null || Number.isNaN(start.getTime())
          ? '—'
          : start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    },
    { label: 'Start time', value: time(start) },
    { label: 'Duration', value: duration },
    { label: 'End Time', value: time(end) },
  ];
}

/** `257:3439` — Booking amount / Taxes / Total paid, straight off the immutable snapshot. */
export function paymentRowsFrom(dto: BookingDetailDto): readonly DetailRow[] {
  return [
    { label: 'Booking amount', value: formatPaise(dto.price.serviceAmountPaise) },
    {
      // The rate is the server's, in basis points. Rendering it is not computing it.
      label: `Taxes @${dto.price.taxRateBps / 100}%`,
      value: formatPaise(dto.price.taxAmountPaise),
    },
    { label: 'Total paid', value: formatPaise(dto.price.totalAmountPaise), emphasis: 'total' },
  ];
}

/** `250:2861` — the booking-details sheet. */
export function detailsSheetFrom(input: {
  readonly base: BookingDetailsViewModel;
  readonly dto: BookingDetailDto;
}): BookingDetailsViewModel {
  return {
    ...input.base,
    bookingRows: bookingRowsFrom(input.dto),
    paymentRows: paymentRowsFrom(input.dto),
  };
}

/** `250:2951` — "Today, Aug 5 • 12:00 PM • 1 hr". Formatting, not assembly of domain facts. */
export function scheduleLineFrom(dto: BookingDetailDto, now: Date = new Date()): string {
  // Same reasoning as the Duration row: an extended service ran longer than it was priced for.
  const duration = durationTextFrom(servedDurationMinutes(dto));

  // The visit's own start: the booked slot until the start OTP, then its (owner, 31 Oct 2026).
  const shownStart = serviceWindowOf({
    bookedStart: dto.scheduledStart,
    durationMinutes: dto.durationMinutes,
    timing: dto.timing,
  }).start;
  if (shownStart === null) return duration;
  const start = new Date(shownStart);
  if (Number.isNaN(start.getTime())) return duration;

  const sameDay =
    start.getFullYear() === now.getFullYear() &&
    start.getMonth() === now.getMonth() &&
    start.getDate() === now.getDate();

  const day = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const dayLabel = sameDay ? `Today, ${day}` : day;
  const time = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return `${dayLabel} • ${time} • ${duration}`;
}

/**
 * The rating the server says is already on this booking, as the widget's own value type.
 *
 * `5+` is `RATING_EXCEPTIONAL`, not the number 5 -- the backend carries the two separately
 * (`stars: 5` plus `exceptional: true`), and collapsing them here would lose the distinction the
 * submit path is careful to preserve.
 *
 * A star value off the half-step scale is DROPPED rather than rounded: the widget has nine chips
 * and can only fill one of them, so an unrecognised number would silently fill the wrong one.
 */
function submittedRatingFrom(dto: BookingDetailDto): { submittedRating?: RatingSelection } {
  if (dto.ratingExceptional === true) return { submittedRating: RATING_EXCEPTIONAL };

  const stars = dto.ratingStars;
  if (typeof stars !== 'number') return {};

  const onScale = RATING_VALUES.find((value) => value === stars);
  return onScale === undefined ? {} : { submittedRating: onScale };
}

export function summaryFrom(input: {
  readonly base: BookingSummaryViewModel;
  readonly dto: BookingDetailDto;
}): BookingSummaryViewModel {
  const recoveryHandoff = input.dto.recovery?.state === 'support_handoff';

  /**
   * A moved booking says so. Both states are confirmed and the page is otherwise identical, so
   * the banner is the only thing that tells a customer the slot they are looking at is the one
   * they changed it to rather than the one they first picked.
   *
   * `=== 1` rather than `>= 1` deliberately: product caps a booking at one move (DEC-070), and it
   * is the same test My bookings uses for its "Rescheduled" pill, so the two screens cannot
   * disagree about whether a booking was moved.
   *
   * Recovery wins where both apply. "This booking needs attention" is a problem the customer has
   * to act on; how the slot was arrived at is history beside it.
   */
  // Any customer reschedule: a booking may be moved up to 10 times (DEC-112).
  const rescheduled = (input.dto.rescheduleCount ?? 0) >= 1;

  /**
   * An unsettled hold is not a confirmation, and this screen is headed "Booking confirmed!".
   *
   * `created` and `assigned` share the `confirmation` VIEW deliberately -- from the customer's
   * side a paid booking is confirmed whether or not a cook has been matched yet -- but they are
   * not the same claim. `created` means the server has not settled the payment, so a booking sat
   * here announcing itself as confirmed, with a tick, a schedule line and Cancel / Reschedule
   * beside it, for something nobody had paid for.
   *
   * REACHED BY a checkout that never reported back: the app killed, or crashing, while Razorpay
   * is open. Dismissing checkout does NOT do this -- the server cancels on dismissal
   * (`cancelledBy: customer`, confirmed against production) -- which is why the state looks
   * unreachable until someone swipes the app away mid-payment, and then is not.
   *
   * The booking is left otherwise intact: the hold is real, the slot is held, and it becomes a
   * genuine booking the moment payment lands. What changes is only that the screen stops calling
   * it confirmed before it is.
   */
  const unsettled = input.dto.status === 'created';

  return {
    ...input.base,
    scheduleLine: scheduleLineFrom(input.dto),
    rows: bookingRowsFrom(input.dto),
    rescheduleAllowed: input.dto.allowedActions.canReschedule,
    ...(rescheduled ? { bannerTitle: 'Booking rescheduled!' } : {}),
    /*
     * After `rescheduled`, before `recoveryHandoff`. A booking can be both moved and unpaid, and
     * "you have not paid" is the more urgent of the two; a handout to support outranks both,
     * because that is a thing the customer has to act on rather than a state to report.
     */
    ...(unsettled
      ? {
          bannerTitle: 'Payment pending!',
          tone: 'warning' as const,
          /*
           * What the screen OFFERS changes with the banner, not only what it says.
           *
           * Cancel and Reschedule are the controls for a booking that exists. On an unpaid hold
           * they are the wrong two: there is nothing to move, and "cancel" walks the customer
           * into the refund flow (`7a`..`7d`, which quotes a notice-period refund band) for money
           * that was never taken. The one thing they can usefully do is pay, so that is the one
           * thing offered — `ConfirmationBody` reads this and draws "Book now" instead of the
           * pair. The hold expires on its own if they do not.
           */
          paymentPending: true,
        }
      : {}),
    ...(recoveryHandoff
      ? { bannerTitle: 'This booking needs attention', tone: 'warning' as const }
      : {}),
  };
}

/**
 * The header address line.
 *
 * `headerSubtitle` is the address the cook is coming to, which the booking payload carries in
 * full — so the header does not have to read the address list.
 */
export function headerSubtitleFrom(dto: BookingDetailDto): string {
  return [dto.address.flat, dto.address.society, dto.address.street, dto.address.city]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join(', ');
}

/**
 * The cook's name as the drawn banner titles carry it.
 *
 * `40:5364` reads "Cook Asha is arriving in", `201:100` "Cook Kavita is arriving" and `3:1658`
 * "Cook Asha has arrived" — three DIFFERENT sentences that share one leading `Cook <name>`. The
 * name in each is sample data; the rest is the design.
 *
 * So the name is substituted and nothing else is: the sentence keeps its own wording, its own
 * "in"/no-"in" ending and its own line breaks, and only the person changes. Rebuilding the titles
 * from a template here would have to pick ONE of the three phrasings and would silently rewrite
 * the other two.
 *
 * A title that does not open with `Cook <word>` is returned untouched, and so is a booking with no
 * cook yet — there is no drawn nameless variant, and inventing one would be a UI change.
 */
function withCookName(title: string, cookName: string | null): string {
  if (cookName === null || cookName.trim().length === 0) return title;
  // The registered name exactly, in place of the design's sample "Cook <name>" (owner, 31 Oct 2026).
  return title.replace(/^Cook\s+\S+/u, () => cookName.trim());
}

/**
 * The assigned-cook card, built ENTIRELY from the payload (DEC-114: the app bundles no cook's
 * photograph or dishes). Every field below is the server's value or honestly absent, and the card
 * degrades as it was built to: initials instead of a photograph, attribute rows dropped, no
 * specialty grid. The redesigned visit screens draw the cook's dishes from her profile instead.
 *
 * Badges render only from the server's attested flags, fail-closed: absent or false is no
 * badge. The whole block is omitted when nothing is attested, which keeps the drawn no-badge
 * degradation reachable.
 */
function cookViewModelFrom(
  cook: NonNullable<BookingDetailDto['cook']> & { readonly name: string },
  bookingId: string,
): CookViewModel {
  const photoUrl = cook.photoUrl;
  const languages = cook.languages ?? [];
  const cuisine = cook.cuisines?.[0];
  const anyBadge =
    cook.spoonTrained === true || cook.backgroundVerified === true || cook.hygieneVerified === true;
  return {
    id: cook.id ?? bookingId,
    displayName: cook.name,
    firstName: cook.name,
    ...(photoUrl === undefined || photoUrl === null ? {} : { photoUrl }),
    ...(cook.gender === null || cook.gender === undefined ? {} : { gender: cook.gender }),
    ...(cuisine === undefined ? {} : { cuisine }),
    ...(cook.region === null || cook.region === undefined ? {} : { homeState: cook.region }),
    // The frames draw the language glyph with no label when there is nothing to say, which is
    // how an empty list renders — by dropping the row, not by inventing a value.
    ...(languages.length === 0 ? {} : { languages }),
    ...(anyBadge
      ? {
          badges: {
            spoonTrained: cook.spoonTrained === true,
            backgroundVerified: cook.backgroundVerified === true,
            hygienic: cook.hygieneVerified === true,
          },
        }
      : {}),
    ...(cook.profileVariant === null || cook.profileVariant === undefined
      ? {}
      : { profileVariant: cook.profileVariant }),
  };
}

/** `veg` draws the card's pure-veg dish list; `mixed` (or absent) the standard one. */
export function cookCardVariantFor(
  profileVariant: CookViewModel['profileVariant'],
): 'standard' | 'pureVeg' {
  return profileVariant === 'veg' ? 'pureVeg' : 'standard';
}

/**
 * `timingVerdict` -> the drawn presentation.
 *
 * `ON_TIME | LATE | UNKNOWN`, measured by the backend against DEC-049's `customer_commitment_at`.
 * The contract is explicit that a client must NOT derive this by comparing an ETA to its own
 * clock, so nothing here does. `UNKNOWN` is not a synonym for on time: it keeps whichever
 * presentation the copy already carried rather than asserting punctuality nobody has established.
 */
export function isLateVerdict(timingVerdict: string | null | undefined): boolean {
  return timingVerdict === 'LATE';
}

/** The absolute instant a service ends, from the SERVER. Never `start + duration`. */
function expectedEndMsFrom(expectedEnd: string | null): number | null {
  if (expectedEnd === null) return null;
  const at = new Date(expectedEnd);
  return Number.isNaN(at.getTime()) ? null : at.getTime();
}

/**
 * `201:278` Page 8e — the refund figure on the auto-cancelled surface.
 *
 * `GET /v1/bookings/:id/refunds` is the authority. The booking detail's `cancellation` block does
 * NOT carry an amount (the backend projects `cancelledAt`, `cancelledBy`, `reasonCode`,
 * `reasonLabel`, `reasonDetail` and stops), so the figure has to come from the refund record —
 * and until it does, the row shows the em dash the rest of this adapter uses for an absent server
 * value rather than the frame's transcribed ₹135.
 *
 * Nothing is summed and nothing is subtracted from the total paid: a refund is a durable record,
 * not `paid − fee` (task §10).
 */
/**
 * The tracker for the booking's latest refund (DEC-090), or nothing from a deployment that
 * predates it — the designed notice with the amount then stands, as before.
 */
function refundTrackerViewFrom(
  refunds: readonly RefundDto[] | null,
  timeZone: string | undefined,
): RefundTrackerView | undefined {
  const refund = refunds?.[0];
  if (refund === undefined || refund.tracker === null || refund.tracker === undefined) {
    return undefined;
  }
  return refundTrackerFrom({ ...refund, tracker: refund.tracker }, { timeZone });
}

function refundAmountLabelFrom(refunds: readonly RefundDto[] | null): string | null {
  if (refunds === null || refunds.length === 0) return null;
  const amountPaise = refunds[0]?.amountPaise;
  return amountPaise === undefined ? null : formatPaise(amountPaise);
}

/**
 * Composes the lifecycle view model from a real booking.
 *
 * `base` is the designed screen for the resolved view: its copy, its notes, its CTA labels. The
 * DTO supplies the facts. Surfaces whose required server field does not exist yet keep the base
 * copy unchanged, which is why this returns the base's own sub-models rather than fabricating
 * them.
 *
 * ## Every figure the frame transcribed is overwritten here
 *
 * The design fixtures carry sample prices, times, ETAs, refund amounts and OTP digits, because
 * they were transcribed from frames that had to draw something. Not one of them may survive into
 * a real booking, so each is replaced by its server field or blanked:
 *
 *   cook name in the banner title  <- `cook.name`
 *   in-service countdown target    <- `timing.expectedEnd`
 *   arrival clock time             <- `timing.arrivedAt`
 *   Start / End OTP digits         <- `tracking.serviceOtp` ONLY (blanked here)
 *   refund amount                  <- `GET /bookings/:id/refunds`
 *   completion headline            <- `scheduledStart` + `durationMinutes`
 *   reassignment notice presence   <- `reassignment.occurred`
 */
export function bookingDetailFrom(input: {
  readonly base: BookingDetailViewModel;
  readonly dto: BookingDetailDto;
  readonly refunds?: readonly RefundDto[] | null;
  /** The service timezone, for the refund tracker's dates. */
  readonly timeZone?: string | undefined;
  readonly onUnknownStatus?: (status: string | null) => void;
}): BookingDetailViewModel {
  const { base, dto } = input;

  /** `reassignment.occurred` is the SERVER's word for it; nothing here infers a reassignment. */
  const reassigned = dto.reassignment?.occurred === true;

  const resolution = viewForBooking({
    status: dto.status,
    cancelledBy: dto.cancellation?.cancelledBy ?? null,
    reassigned,
    ...(input.onUnknownStatus === undefined ? {} : { onUnknown: input.onUnknownStatus }),
  });

  const cookName = dto.cook?.name ?? null;
  const arrivedAtLabel = arrivedAtLabelFrom(dto.timing.arrivedAt);
  const refundAmount = refundAmountLabelFrom(input.refunds ?? null);
  const refundTracker = refundTrackerViewFrom(input.refunds ?? null, input.timeZone);

  /**
   * The en-route / arrived / reassigned banner, with the real cook in it.
   *
   * `rescheduleAllowed` is ruling R-3 — the SERVER decides whether Reschedule is offered — and it
   * is applied to every one of these surfaces rather than only to `tracking`, because 8c/8d draw
   * the same action pair 9a/9b do.
   */
  const trackingLike = <T extends TrackingViewModel>(surface: T): T => ({
    ...surface,
    bannerTitle: withCookName(surface.bannerTitle, cookName),
    rescheduleAllowed: dto.allowedActions.canReschedule,
  });

  /**
   * `292:201` — page 8b's ONE structural difference from 8a.
   *
   * Present only while the server reports a reassignment. Dropped otherwise, so a confirmation
   * rendered from copy that happens to carry the notice cannot apologise for something that
   * never happened.
   */
  const summary =
    base.summary === undefined
      ? undefined
      : reassigned
        ? summaryFrom({ base: base.summary, dto })
        : omitReassignNotice(summaryFrom({ base: base.summary, dto }));

  /**
   * The design fixture's sample cook is STRUCTURALLY excluded, not merely overridden.
   *
   * `base` is a designed screen and some designed screens carry a sample cook. Spreading it
   * whole meant an unassigned or cancelled booking — where the server sends `cook: null` —
   * silently inherited that sample: a real customer shown Asha's card for a booking that has
   * no cook, and a reassigned booking briefly showing the PREVIOUS design sample. Dropping the
   * key before the spread makes "the server sent no cook" render as no cook, always.
   */
  const { cook: _designSampleCook, ...baseWithoutCook } = base;

  return {
    ...baseWithoutCook,
    view: resolution.view,
    headerSubtitle: headerSubtitleFrom(dto),
    ...(summary === undefined ? {} : { summary }),
    ...(base.details === undefined
      ? {}
      : { details: detailsSheetFrom({ base: base.details, dto }) }),
    ...(dto.cook === null || dto.cook.name === undefined
      ? {}
      : { cook: cookViewModelFrom({ ...dto.cook, name: dto.cook.name }, dto.id) }),
    /**
     * The countdown target is `timing.expectedEnd` and nothing else.
     *
     * It moves when a service starts late and when an extension is paid for, which is exactly why
     * `scheduledStart + durationMinutes` is not it. `null` (a status that has no session yet)
     * leaves `useCountdown` with nothing to count, which renders the panel at zero instead of
     * counting down to a moment this client invented.
     *
     * The skew is the offset measured when this very payload arrived (§29), so only the "now" the
     * server's instant is compared against is corrected.
     *
     * The End OTP is BLANKED. It lives on tracking, and `trackingDetailFrom` puts the server's
     * code back; leaving the fixture's `111` here would show the customer a code that ends
     * nothing — and would show it in the one place they are being asked to read digits aloud.
     */
    ...(base.inService === undefined
      ? {}
      : {
          inService: {
            ...base.inService,
            endsAtMs: expectedEndMsFrom(dto.timing.expectedEnd),
            clockSkewMs: currentSkewMs(),
            otpCode: '',
          },
        }),
    // Arrival is backend-confirmed state. The customer message and displayed clock time must not
    // come from the design fixture once the real booking says `cook_arrived`. The Start OTP is
    // blanked for the same reason the End OTP is.
    ...(base.arrived === undefined
      ? {}
      : {
          arrived: {
            ...trackingLike(base.arrived),
            bannerMessage: 'Cook has arrived at your location',
            etaLabel: arrivedAtLabel ?? '—',
            otpCode: '',
          },
        }),
    /**
     * `319:3191` (`14b`) — Completion's SUBMITTED state.
     *
     * `allowedActions.canRate` is the server's answer to "may this booking still be rated", so a
     * completed booking that may NO LONGER be rated is one that already has been. That is the
     * whole derivation: no local "I just pressed Submit" flag, which would show the thank-you
     * state after a request that failed, and would lose it on the next app launch.
     *
     * `bookingHeadline` is the same schedule line the summary draws, so `143:207` names the
     * booking that was actually completed rather than the frame's "12th April • 1:15 PM • 1 hr".
     */
    ...(base.completion === undefined
      ? {}
      : {
          completion: {
            ...base.completion,
            bookingHeadline: scheduleLineFrom(dto),
            submitted: !dto.allowedActions.canRate,
            /*
             * WHAT was rated, and whether anything was written -- both server facts, both absent
             * from the payload today (BACKEND_PENDING, see `bookingRatingSchema`). Omitted rather
             * than defaulted: the screen then falls back to the rating held in memory, and offers
             * the textarea instead of an acknowledgement it cannot justify.
             */
            ...submittedRatingFrom(dto),
            ...(typeof dto.ratingFeedback === 'string' && dto.ratingFeedback.trim() !== ''
              ? { feedbackGiven: true, feedbackText: dto.ratingFeedback.trim() }
              : {}),
          },
        }),
    // Ruling R-3 — the SERVER decides whether Reschedule is offered.
    ...(base.tracking === undefined ? {} : { tracking: trackingLike(base.tracking) }),
    // 8c / 8d. The notice is the design's; the cook in the title and the action gate are the
    // server's, exactly as on 9a / 9b.
    ...(base.reassigned === undefined
      ? {}
      : { reassigned: { ...trackingLike(base.reassigned), notice: base.reassigned.notice } }),
    /**
     * `201:278` — the terminal auto-cancelled surface.
     *
     * The rows are this booking's, and the refund amount is the refund RECORD's. Where the server
     * has published no refund yet the row shows an em dash rather than the frame's ₹135: a figure
     * nobody owes is worse than a figure nobody has stated.
     */
    ...(base.autoCancelled === undefined
      ? {}
      : {
          autoCancelled: {
            ...base.autoCancelled,
            rows: bookingRowsFrom(dto),
            refundAmount: refundAmount ?? '—',
            ...(refundTracker === undefined ? {} : { refundTracker }),
          },
        }),
    /**
     * `606:4895` — the terminal customer-cancelled surface. Same rule as `autoCancelled`
     * immediately above: the rows are this booking's, and an unpublished refund shows the em
     * dash rather than the frame's transcribed ₹135.
     */
    ...(base.customerCancelled === undefined
      ? {}
      : {
          customerCancelled: {
            ...base.customerCancelled,
            rows: bookingRowsFrom(dto),
            refundAmount: refundAmount ?? '—',
            ...(refundTracker === undefined ? {} : { refundTracker }),
          },
        }),
    // The same ruling for Call Cook. Pressing it fetches a cook's personal number from a
    // separate endpoint that enforces this identical eligibility, so offering the control on
    // any other basis would only produce a failed call — and, worse, would imply the customer
    // is entitled to the number at a moment the server says they are not.
    callCookAllowed: dto.allowedActions.canCallCook,
    cancelAllowed: dto.allowedActions.canCancel,
    // §11 — instant draws no Cancel / Reschedule. Passed through verbatim; not interpreted here.
    slotType: dto.slotType,
  };
}

/** Exact-optional-safe removal: the key is dropped, never set to `undefined`. */
function omitReassignNotice(summary: BookingSummaryViewModel): BookingSummaryViewModel {
  if (summary.reassignNotice === undefined) return summary;
  const { reassignNotice: _dropped, ...rest } = summary;
  return rest;
}

/**
 * Tracking DTO -> the live fields of the lifecycle view model.
 *
 * Layered ON TOP of `bookingDetailFrom` rather than folded into it, because the two reads have
 * different lifetimes: the booking detail is stable, tracking polls at the interval the server
 * asks for. Keeping them separate means a tracking refresh does not rebuild the whole screen's
 * copy.
 *
 * ## The service OTP
 *
 * `dto.serviceOtp.start` / `.end` are the codes the customer reads out to the cook. The server
 * decides when each one exists — it returns `null` outside that code's window and once the code
 * has been consumed. So:
 *
 *   - a code the server supplies is shown verbatim;
 *   - a code the server withholds leaves the panel EMPTY. `bookingDetailFrom` has already blanked
 *     the fixture's digits, and `OtpDisplay` renders an empty code as the panel with no tiles —
 *     the designed geometry, no placeholder, and nothing that could be mistaken for a real code.
 *
 * Nothing here derives, caches or remembers a code, and no code is ever logged.
 *
 * ## The ETA and the verdict
 *
 * `eta.estimatedArrivalAt` is the server's arrival instant, and it is drawn TWO ways, because the
 * frames do: the travelling banners count it down ("16 mins", `etaCountdownFrom`) and Arrived
 * shows it as a clock time ("11:55 am", `etaClockLabelFrom`). Both are formatting; neither is
 * compared against the clock to assert lateness — `timingVerdict` is the server's verdict and the
 * only thing allowed to make that claim, which is why `tone` is set from it here and the
 * late/on-time COPY is selected by the caller from the two drawn variants.
 *
 * After arrival the backend nulls the ETA (tracking terminates at the gate), so the en-route
 * label stops updating by construction: there is no ETA left to render and nothing here
 * substitutes one.
 */
export function trackingDetailFrom(input: {
  readonly base: BookingDetailViewModel;
  readonly dto: TrackingDto;
  /** Injectable so a test pins the countdown instead of racing the wall clock. */
  readonly nowMs?: number;
}): BookingDetailViewModel {
  const { base, dto } = input;
  // The SERVER's now, not the handset's: the ETA is a server instant, and a phone clock a few
  // seconds fast reached it early and blanked the panel (2026-09-30). Same store every other
  // countdown in the app reads (§29).
  const nowMs = input.nowMs ?? Date.now() - currentSkewMs();

  const start = dto.serviceOtp?.start;
  const end = dto.serviceOtp?.end;
  const etaCountdownLabel = etaCountdownFrom(dto.eta.estimatedArrivalAt, nowMs);
  const etaClockLabel = etaClockLabelFrom(dto.eta.estimatedArrivalAt);
  const arrivedAtLabel = arrivedAtLabelFrom(dto.arrivedAt);
  const late = isLateVerdict(dto.timingVerdict);
  const knownVerdict = dto.timingVerdict === 'ON_TIME' || dto.timingVerdict === 'LATE';
  const safeEtaLabel = etaCountdownLabel ?? '—';

  /** The server's punctuality answer, applied to whichever travelling surface is drawn. */
  const trackingSurface = <T extends TrackingViewModel>(surface: T): T => ({
    ...surface,
    etaLabel: safeEtaLabel,
    /**
     * The VERDICT decides the tone and the copy; the countdown only decides the number.
     *
     * Gated on `etaClockLabel`, which is non-null whenever the server published a parseable
     * arrival instant -- NOT on `etaCountdownLabel`, which also goes null the moment that instant
     * elapses. Gating on the countdown suppressed `292:469` exactly when it was most warranted: a
     * cook the server had already called LATE, whose ETA had slipped past, lost the amber fill and
     * the "sorry for the delay" line and got a neutral "arrival time is not available yet" -- the
     * screen for a booking with NO ETA, which is a different and much weaker claim.
     *
     * So an elapsed ETA now degrades the panel to "—" and nothing else. The server said late; the
     * screen still says late.
     */
    ...(knownVerdict && etaClockLabel !== null
      ? { tone: late ? ('warning' as const) : ('positive' as const) }
      : {
          tone: 'neutral' as const,
          bannerMessage:
            etaClockLabel === null
              ? 'Cook arrival time is not available yet.'
              : 'Cook arrival status is being updated.',
        }),
  });

  return {
    ...base,
    ...(base.tracking === undefined
      ? {}
      : {
          tracking: {
            ...trackingSurface(base.tracking),
          },
        }),
    ...(base.reassigned === undefined
      ? {}
      : {
          reassigned: {
            ...trackingSurface(base.reassigned),
          },
        }),
    ...(base.arrived === undefined
      ? {}
      : {
          arrived: {
            ...base.arrived,
            etaLabel: arrivedAtLabel ?? etaClockLabel ?? '—',
            ...(start === null || start === undefined ? {} : { otpCode: start }),
          },
        }),
    ...(base.inService === undefined
      ? {}
      : {
          inService: {
            ...base.inService,
            ...(end === null || end === undefined ? {} : { otpCode: end }),
          },
        }),
  };
}

/**
 * The arrival instant as a CLOCK TIME -- the post-arrival treatment only.
 *
 * `99:1620`: once the cook has ARRIVED the panel stops counting down and shows a clock time. This
 * is that label, and `arrivedAtLabelFrom` is preferred over it wherever the backend persisted a
 * real arrival instant; this is the fallback for an arrived booking whose `arrivedAt` is missing.
 *
 * It must NOT reach `3:1381` / `292:469` / `201:100` / `292:657`, whose banners read "Cook is
 * arriving in" and are completed by a duration -- see `etaCountdownFrom`.
 */
function etaClockLabelFrom(estimatedArrivalAt: string | null): string | null {
  if (estimatedArrivalAt === null) return null;
  const at = new Date(estimatedArrivalAt);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * The wait still ahead, in whole minutes -- what the TRAVELLING banners draw.
 *
 * `3:1381` (en route), `292:469` (late), `201:100` / `292:657` (reassigned) all title the banner
 * "Cook is arriving in" and let the panel finish the sentence, which only a duration can do: the
 * frames draw "16 mins" and "21 mins", and the fixtures carry exactly those. The adapter was
 * handing all four the clock-time label instead, so the sentence read "Cook is arriving in
 * 8:45 AM" on device.
 *
 * ## Why a clock comparison is allowed here
 *
 * §18 rule 4 forbids the client deciding a cook is LATE -- that is `timingVerdict`, and it still
 * is: `tone` and the late/on-time copy are untouched by this. Rendering the server's own instant
 * as a duration is presentation, the same act `InServiceBody` already performs on `endsAtMs`.
 * Nothing here advances state, and no ETA is invented: a booking the server gave no ETA for still
 * renders the designed "not available yet" banner.
 *
 * Accuracy: tracking refetches on the server's `refreshAfterSeconds` (30s fallback), so the figure
 * is re-derived at least twice a minute and cannot drift past the minute it names.
 *
 * Once the ETA is reached it reads "0 mins", and past it the minutes past it, as a POSITIVE number
 * that keeps growing -- the same rule the Cook App's "Location ki duri" follows (founder,
 * 2026-09-30). The panel used to degrade to "—" the moment the instant passed, which on the
 * customer's screen read as the app having lost the cook while she was standing at the gate. The
 * banner still carries the server's `timingVerdict`, so a late cook still reads as late.
 */
function etaCountdownFrom(estimatedArrivalAt: string | null, nowMs: number): string | null {
  if (estimatedArrivalAt === null) return null;
  const at = new Date(estimatedArrivalAt);
  if (Number.isNaN(at.getTime())) return null;

  const remainingMs = at.getTime() - nowMs;
  // Reached or passed: how far past it, never negative.
  if (remainingMs <= 0) return formatMinutes(Math.round(-remainingMs / 60_000));

  // Still ahead: floored at one, so a cook 20 seconds away is "1 min" under "arriving in".
  return formatMinutes(Math.max(1, Math.round(remainingMs / 60_000)));
}

/** The persisted backend arrival instant, never a handset detection time or an ETA. */
function arrivedAtLabelFrom(arrivedAt: string | null | undefined): string | null {
  if (arrivedAt === null || arrivedAt === undefined) return null;
  const at = new Date(arrivedAt);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * The tip sheet's amounts (`306:2997`), from the catalogue.
 *
 * Ruling R-1 and task §16: a monetary value is the SERVER's. `catalogue.tips.suggestedAmountsPaise`
 * is what the tip endpoint expects, so the sheet offers exactly those and nothing is computed on
 * the client. The previous build drew the four amounts transcribed from the frame
 * (25/50/100/150) while the catalogue published 20/50/100/150 — so the sheet could offer an
 * amount the customer then did not pay.
 *
 * The id CARRIES the amount (`tip-5000`) for the same reason a duration id carries its minutes:
 * the sheet reports a chosen id, and the caller must be able to turn that back into the paise it
 * sends without a lookup table that could drift.
 */
const TIP_ID_PREFIX = 'tip-';

export function tipIdFor(amountPaise: number): string {
  return `${TIP_ID_PREFIX}${amountPaise}`;
}

export function tipAmountPaiseFrom(optionId: string | null): number | null {
  if (optionId === null || !optionId.startsWith(TIP_ID_PREFIX)) return null;
  const paise = Number.parseInt(optionId.slice(TIP_ID_PREFIX.length), 10);
  return Number.isFinite(paise) && paise > 0 ? paise : null;
}

/**
 * `ext-30` -> 30, the same id-carries-its-value convention as tips and durations.
 *
 * `useExtensionData` mints these from the catalogue's published `minutes`, and
 * `POST /v1/bookings/:id/extensions` takes minutes — so this is a decode of a value the SERVER
 * supplied, never a duration this client chose. `null` for anything else, which the caller reads
 * as "no extension to request" and refuses to send.
 */
const EXTENSION_ID_PREFIX = 'ext-';

/** The inverse. Minted from a length the SERVER published, never from one this client chose. */
export function extensionIdFor(minutes: number): string {
  return `${EXTENSION_ID_PREFIX}${minutes}`;
}

export function extensionMinutesFrom(optionId: string | null): number | null {
  if (optionId === null || !optionId.startsWith(EXTENSION_ID_PREFIX)) return null;
  const minutes = Number.parseInt(optionId.slice(EXTENSION_ID_PREFIX.length), 10);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

/**
 * `306:2885` draws ₹50 preselected and its CTA already reads "Tip • ₹50".
 *
 * The catalogue publishes no default, so the DRAWN one is matched against the published amounts
 * rather than invented: if operations stops offering ₹50 the sheet opens with nothing chosen,
 * which is the designed "omit it" behaviour, not a silently different preselection.
 */
const DRAWN_DEFAULT_TIP_PAISE = 5000;

export function tipSheetFrom(input: {
  readonly base: TipSheetViewModel;
  readonly suggestedAmountsPaise: readonly number[];
  readonly formatAmount: (paise: number) => string;
}): TipSheetViewModel {
  const { base, suggestedAmountsPaise, formatAmount } = input;
  if (suggestedAmountsPaise.length === 0) return base;

  const options = suggestedAmountsPaise.map((paise) => ({
    id: tipIdFor(paise),
    label: formatAmount(paise),
  }));

  const preselected = suggestedAmountsPaise.includes(DRAWN_DEFAULT_TIP_PAISE)
    ? DRAWN_DEFAULT_TIP_PAISE
    : null;

  return {
    ...base,
    options,
    ...(preselected === null ? {} : { defaultOptionId: tipIdFor(preselected) }),
    // `306:3060` — the CTA carries the amount. Recomputed from the SAME server figure the
    // preselection uses, so the button can never name a price the sheet does not offer.
    ...(preselected === null ? {} : { ctaLabel: `Tip • ${formatAmount(preselected)}` }),
  };
}

/**
 * The tip CTA, re-pointed at the option the customer actually chose.
 *
 * `tipSheetFrom` builds `ctaLabel` from the PRESELECTION, which was correct while the default was
 * the only selection that existed -- `TipSheetViewModel.ctaLabel` still documents itself as
 * "consistent with `defaultOptionId`". Once the chips became tappable that stopped being true and
 * nothing re-pointed the label, so the bar read "Tip • ₹50" over every amount on the sheet: a
 * customer selecting ₹100 was asked to confirm a button naming ₹50.
 *
 * The amount is READ OFF the chosen option's own label, never recomputed -- `option.label` is the
 * server's suggested amount formatted once by `tipSheetFrom`. So the bar can still only ever name
 * a price the sheet is offering (ruling R-1), which is the property the preselection wording was
 * protecting in the first place.
 *
 * An id matching no option leaves the model untouched: that is the "nothing chosen" state, where
 * the CTA is disabled anyway and the designed copy is the right thing to keep.
 */
export function tipSheetWithSelection(
  tip: TipSheetViewModel,
  selectedOptionId: string | null,
): TipSheetViewModel {
  const selected = tip.options.find((option) => option.id === selectedOptionId);
  return selected === undefined ? tip : { ...tip, ctaLabel: `Tip • ${selected.label}` };
}
