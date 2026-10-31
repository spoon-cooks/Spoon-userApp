import { formatPaise } from '@core/format';
import { serviceWindowOf } from '@core/time';
import type { BookingSummaryCookDto, BookingSummaryDto } from '@features/booking';
import { formatServiceDate, formatServiceTime, serviceDateIn } from '@features/scheduled';
import type { BookingCardViewModel, StatusTone } from '@ui';

import type { BookingListViewModel } from './types';

/**
 * History adapters.
 *
 * Money is formatted by `@core/format`, which owns the single paise-to-rupees conversion in the
 * app. Nothing here sums, taxes or discounts.
 *
 * ## The five My-bookings states
 *
 * `myBookingPresentationFor` collapses the backend's seven statuses (plus `policyBand` and
 * `rescheduleCount`) into exactly the six states the My-bookings screen draws: Completed,
 * Cancelled, Unfulfilled, Payment pending, Confirmed, Rescheduled. This is a SINGLE function used
 * by BOTH tabs —
 * it does not branch on which tab is rendering it. That's confirmed, not assumed: the same
 * system-cancelled, fully-refunded booking legitimately renders "Unfulfilled" on the Upcoming tab
 * too (it's the live "apology" row there, and history on the Past tab, at the same time), so a
 * tab-aware label would have shown two different words for the identical fact.
 */

/**
 * Status/policy/reschedule -> one of the five drawn states.
 *
 * Order matters: `status` is checked before `rescheduleCount` so a booking that was rescheduled
 * and later completed reads "Completed," not "Rescheduled" — rescheduling is history once the
 * meal happened. `cancelledBy` alone cannot choose between Cancelled and Unfulfilled: `'system'`
 * covers both a genuine platform failure AND an abandoned, never-paid checkout, and `'operations'`
 * covers both an ops-mediated cancellation the customer themselves requested and a genuine
 * post-dispatch failure ops declared. `policyBand` is the one unambiguous field — only
 * `'SERVICE_FAILURE_FULL_REFUND'` means Spoon actually failed to deliver a paid booking.
 */
export function myBookingPresentationFor(
  // `cancelledBy` is accepted but deliberately unread below — see the doc comment above for why
  // it alone can never choose the label. Kept in the parameter type so a caller can pass a real
  // row (or a real example fixture) verbatim rather than stripping a field first.
  dto: Pick<
    BookingSummaryDto,
    'status' | 'cancelledBy' | 'policyBand' | 'rescheduleCount' | 'rescheduledByOps'
  >,
): { readonly label: string; readonly tone: StatusTone } {
  if (dto.status === 'completed') return { label: 'Completed', tone: 'positive' };

  if (dto.status === 'cancelled') {
    // 'warning' matches the existing DEMO_BOOKING_UNFULFILLED fixture's tone — Spoon's own
    // failure is drawn with more weight than a plain customer-initiated cancellation.
    return dto.policyBand === 'SERVICE_FAILURE_FULL_REFUND'
      ? { label: 'Unfulfilled', tone: 'warning' }
      : { label: 'Cancelled', tone: 'neutral' }; // includes CHECKOUT_EXPIRED_NO_PAYMENT
  }

  /**
   * `created` is the ONE live status that is not a booking yet.
   *
   * The server has not settled a payment for it: it is a HOLD, and `GET /v1/me/bookings/active`
   * lists it alongside real bookings. Reading it as "Confirmed" is the same untruth the detail
   * screen used to tell -- and this list is the screen a customer actually arrives through, since
   * Home draws no banner for an unpaid hold. `warning`, not `info`, because it is something they
   * have to act on before the server's abandon window closes and the hold is swept away.
   *
   * Checked before `rescheduleCount` for the same reason the banner is: a hold that was also
   * moved is still, first and foremost, not paid for.
   */
  if (dto.status === 'created') return { label: 'Payment pending', tone: 'warning' };

  // assigned / cook_en_route / cook_arrived / cooking — one pill on this screen.
  // Deliberate: this screen is a flat historical index; Home already owns live-tracking detail
  // (arriving/arrived/in-service), so drawing that granularity again here would duplicate it.
  //
  // `rescheduledByOps` sits beside `rescheduleCount >= 1` rather than replacing it:
  // `rescheduleCount` is the customer's own budget and an admin move deliberately never spends
  // it (`reschedule-service.ts`), so a booking Ops moved would otherwise read as plain
  // "Confirmed" — identical to one that was always at its current time.
  return (dto.rescheduleCount ?? 0) >= 1 || dto.rescheduledByOps === true
    ? { label: 'Rescheduled', tone: 'info' }
    : { label: 'Confirmed', tone: 'info' };
}

/**
 * `6:245` — "12th April • 1 hr".
 *
 * The day is read on the SERVICE clock, not the device's. `scheduledStart` is an instant, and
 * asking a handset what calendar day it falls on is a different question: a booking at
 * 2026-08-26T00:30+05:30 is the 26th in India and the 25th on a UTC phone. The date on a booking
 * card is calendar-day semantics, so it takes the timezone the backend publishes — the same rule
 * the Schedule grid follows, through the same helpers.
 *
 * `timeZone` is threaded in rather than hardcoded because it is the catalogue's
 * `operatingWindow.timeZone`; `undefined` falls back to the device reading, which is what this
 * did everywhere before, so a catalogue that has not loaded degrades instead of blanking a label.
 */
/** The visit's own start: the booked slot until the start OTP, then its (`serviceWindowOf`). */
function shownStartOf(
  dto: Pick<BookingSummaryDto, 'scheduledStart' | 'durationMinutes' | 'timing'>,
): string | null {
  return serviceWindowOf({
    bookedStart: dto.scheduledStart,
    durationMinutes: dto.durationMinutes,
    timing: dto.timing,
  }).start;
}

export function headlineFor(
  dto: Pick<BookingSummaryDto, 'scheduledStart' | 'durationMinutes' | 'timing'>,
  timeZone?: string | undefined,
): string {
  const duration =
    dto.durationMinutes % 60 === 0
      ? `${dto.durationMinutes / 60} hr`
      : `${dto.durationMinutes} mins`;

  const start = shownStartOf(dto);
  if (start === null) return duration;
  const instant = new Date(start);
  if (Number.isNaN(instant.getTime())) return duration;

  const day = formatServiceDate(serviceDateIn(timeZone, instant), {
    day: 'numeric',
    month: 'long',
  });
  return `${day} • ${duration}`;
}

/**
 * The card's cook fields from the summary's remembered cook.
 *
 * The photograph is the backend's `profileImageUrl` (DEC-114); without one the card draws its
 * initials disc. Carries no rating: the cook's own published average (`cook.ratingAverage`) is a
 * different fact from what a booking card should show here, and is never surfaced by this
 * function — see `bookingCardFrom`, which sources a booking's own rating from `ratingStars`.
 */
export function cookFieldsFrom(
  cook: BookingSummaryCookDto | null | undefined,
): Pick<BookingCardViewModel, 'cookName' | 'cookPhotoUrl'> {
  if (cook === null || cook === undefined) return {};
  const photoUrl = cook.profileImageUrl ?? undefined;
  return {
    cookName: cook.displayName,
    ...(photoUrl === undefined ? {} : { cookPhotoUrl: photoUrl }),
  };
}

/**
 * The card's second line — "Scheduled • 4:00 PM" or "Instant". `slotType` decides which; for a
 * scheduled booking the clock half is read on the SERVICE timezone (`formatServiceTime`), the
 * same rule `headlineFor`'s calendar day already follows, so a booking near midnight reads the
 * same time on every handset regardless of the reader's own timezone.
 */
function slotSubtitleFor(
  dto: Pick<BookingSummaryDto, 'slotType' | 'scheduledStart' | 'durationMinutes' | 'timing'>,
  timeZone?: string | undefined,
): string {
  if (dto.slotType === 'instant') return 'Instant';
  const start = shownStartOf(dto);
  if (start === null) return 'Scheduled';
  const instant = new Date(start);
  if (Number.isNaN(instant.getTime())) return 'Scheduled';
  return `Scheduled • ${formatServiceTime(timeZone, instant)}`;
}

export function bookingCardFrom(
  dto: BookingSummaryDto,
  timeZone?: string | undefined,
): BookingCardViewModel {
  const presentation = myBookingPresentationFor(dto);

  return {
    id: dto.id,
    headline: headlineFor(dto, timeZone),
    statusLabel: presentation.label,
    statusTone: presentation.tone,
    amount: formatPaise(dto.price.totalAmountPaise),
    ...cookFieldsFrom(dto.cook),
    // The customer's OWN rating for THIS booking — never the cook's aggregate average.
    ...(dto.ratingStars === null || dto.ratingStars === undefined
      ? {}
      : { rating: dto.ratingStars }),
    subtitle: slotSubtitleFor(dto, timeZone),
  };
}

/**
 * The time a booking is ordered by, or `null` for one with no `scheduledStart` — there is no other
 * timestamp on the summary, so an undated row sorts LAST in either direction rather than floating
 * to the top of a list read as a chronology.
 */
function startOf(booking: BookingSummaryDto): number | null {
  return booking.scheduledStart === null || booking.scheduledStart === undefined
    ? null
    : Date.parse(booking.scheduledStart);
}

/**
 * Most recent first — the Past tab.
 *
 * Neither tab ordered its rows at all — each rendered whatever order its endpoint happened to
 * return, which on a real account interleaved dates (a Sep 13 row above a Sep 12 one above
 * another Sep 12 one). A list of bookings is read by date, so the order is the screen's to decide
 * rather than the endpoint's to leak.
 *
 * `id` breaks ties so the order is stable across refetches rather than reshuffling under the
 * customer.
 */
export function byMostRecentFirst(left: BookingSummaryDto, right: BookingSummaryDto): number {
  const leftStart = startOf(left);
  const rightStart = startOf(right);

  if (leftStart !== rightStart) {
    if (leftStart === null) return 1;
    if (rightStart === null) return -1;
    return rightStart - leftStart;
  }
  return left.id.localeCompare(right.id);
}

/**
 * Soonest first — the Upcoming tab.
 *
 * Upcoming is read from "what is next" outward, and it is also the order the backend pages it in
 * (`/me/bookings/active`, nearest slot first). Showing it the other way up would put every page
 * after the first ABOVE the rows already on screen, which shifts the list under a customer who is
 * scrolling. Sorted this way, each new page lands at the bottom, where the list is being read.
 */
export function bySoonestFirst(left: BookingSummaryDto, right: BookingSummaryDto): number {
  const leftStart = startOf(left);
  const rightStart = startOf(right);

  if (leftStart !== rightStart) {
    if (leftStart === null) return 1;
    if (rightStart === null) return -1;
    return leftStart - rightStart;
  }
  return left.id.localeCompare(right.id);
}

/** Which way a tab reads: Past newest first, Upcoming soonest first. */
export type BookingListOrder = 'most-recent-first' | 'soonest-first';

export function bookingListFrom(input: {
  readonly base: BookingListViewModel;
  readonly bookings: readonly BookingSummaryDto[];
  /** The catalogue's service timezone, so every card's date is read on the same clock. */
  readonly timeZone?: string | undefined;
  /** Defaults to newest first, which is how Past reads. */
  readonly order?: BookingListOrder | undefined;
}): BookingListViewModel {
  return {
    ...input.base,
    // Copied before sorting: the argument belongs to the caller's query cache, and sorting in
    // place would reorder the cached array every render.
    bookings: input.bookings
      .slice()
      .sort(input.order === 'soonest-first' ? bySoonestFirst : byMostRecentFirst)
      .map((dto) => bookingCardFrom(dto, input.timeZone)),
  };
}
