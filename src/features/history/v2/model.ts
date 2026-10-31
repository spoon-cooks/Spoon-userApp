import { formatPaise } from '@core/format';
import type { BookingSummaryDto } from '@features/booking';

import { myBookingPresentationFor } from '../adapters';

/**
 * My bookings (Figma `2192:4371` Upcoming, `2192:4430` Past, `2192:4504` / `2192:4534` Empty) —
 * the booking summaries as the cards draw them. Dev notes `2192:4489` / `2192:4497`:
 *
 *   - Line 1 is "date · start time · duration"; line 2 is "status · amount paid" (tax included —
 *     the summary's `totalAmountPaise`).
 *   - The well and the top-right tag say the booking type: a visit of a recurring plan
 *     (`recurringBookingId`) is Recurring, everything else One-time.
 *   - Cancelled and Unfulfilled cards sit at 70% opacity. A cancelled booking is always on Past,
 *     whatever its date (31 Oct 2026; the dev note had it on Upcoming until its date).
 *   - "Next visit" is the nearest upcoming booking that isn't cancelled.
 *   - Past is grouped under month headers, newest first.
 *
 * Dates and times are read on the service clock (IST), like every other booking surface.
 */
const TIME_ZONE = 'Asia/Kolkata';

export type BookingKind = 'one-time' | 'recurring';

export interface BookingRow {
  readonly id: string;
  /** "12 Nov · 11:30 AM · 1.5 hrs". */
  readonly when: string;
  readonly kind: BookingKind;
  /** "Confirmed", "Rescheduled", "Cancelled", "Completed", "Unfulfilled", "Payment pending". */
  readonly status: string;
  /** "Confirmed · ₹188 paid". */
  readonly statusLine: string;
  readonly dimmed: boolean;
  readonly cancelled: boolean;
  /** "APRIL" — the Past tab's month header; the year is added outside the current one. */
  readonly month: string | null;
}

export interface NextVisit {
  readonly id: string;
  /** "Sun, 12 Apr". */
  readonly date: string;
  /** "5:00 PM · 1 hr" — start and duration, as the frame draws it. */
  readonly slot: string;
  /** "CONFIRMED". */
  readonly badge: string;
  readonly statusLine: string;
  readonly kind: BookingKind;
}

export interface MonthGroup {
  readonly month: string;
  readonly rows: readonly BookingRow[];
}

function parts(instant: Date, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-IN', {
    timeZone: TIME_ZONE,
    ...options,
  }).formatToParts(instant)) {
    out[part.type] = part.value;
  }
  return out;
}

/** "9:00 AM". */
export function clockOf(instant: Date): string {
  const p = parts(instant, { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${p.hour ?? ''}:${p.minute ?? ''} ${(p.dayPeriod ?? '').toUpperCase()}`;
}

/** "1 hr", "1.5 hrs", "45 mins". */
export function durationOf(minutes: number): string {
  if (minutes < 60) return `${String(minutes)} mins`;
  const hours = minutes / 60;
  const text = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(/\.0$/, '');
  return `${text} ${hours === 1 ? 'hr' : 'hrs'}`;
}

function startOf(dto: Pick<BookingSummaryDto, 'scheduledStart'>): Date | null {
  if (dto.scheduledStart === null) return null;
  const instant = new Date(dto.scheduledStart);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

function monthOf(instant: Date, now: Date): string {
  const p = parts(instant, { month: 'long', year: 'numeric' });
  const thisYear = parts(now, { year: 'numeric' }).year;
  const month = (p.month ?? '').toUpperCase();
  return p.year === thisYear ? month : `${month} ${p.year ?? ''}`;
}

export function kindOf(dto: Pick<BookingSummaryDto, 'recurringBookingId'>): BookingKind {
  return typeof dto.recurringBookingId === 'string' && dto.recurringBookingId.length > 0
    ? 'recurring'
    : 'one-time';
}

function statusLineOf(status: string, totalPaise: number): string {
  const amount = formatPaise(totalPaise);
  // An unpaid hold has paid nothing yet: the amount is still owed, not "paid".
  return status === 'Payment pending' ? `${status} · ${amount}` : `${status} · ${amount} paid`;
}

export function bookingRowFrom(dto: BookingSummaryDto, now: Date): BookingRow {
  const { label } = myBookingPresentationFor(dto);
  const start = startOf(dto);
  const p = start === null ? null : parts(start, { day: 'numeric', month: 'short' });
  const when = [
    p === null ? null : `${p.day ?? ''} ${p.month ?? ''}`,
    start === null ? null : clockOf(start),
    durationOf(dto.durationMinutes),
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
  return {
    id: dto.id,
    when,
    kind: kindOf(dto),
    status: label,
    statusLine: statusLineOf(label, dto.price.totalAmountPaise),
    dimmed: label === 'Cancelled' || label === 'Unfulfilled',
    cancelled: dto.status === 'cancelled',
    month: start === null ? null : monthOf(start, now),
  };
}

export function nextVisitFrom(dto: BookingSummaryDto): NextVisit {
  const { label } = myBookingPresentationFor(dto);
  const start = startOf(dto);
  const duration = durationOf(dto.durationMinutes);
  let date = 'Instant';
  let slot = duration;
  if (start !== null) {
    const p = parts(start, { weekday: 'short', day: 'numeric', month: 'short' });
    date = `${p.weekday ?? ''}, ${p.day ?? ''} ${p.month ?? ''}`;
    slot = `${clockOf(start)} · ${duration}`;
  }
  return {
    id: dto.id,
    date,
    slot,
    badge: label.toUpperCase(),
    statusLine: statusLineOf(label, dto.price.totalAmountPaise),
    kind: kindOf(dto),
  };
}

/**
 * The Upcoming tab: the nearest booking that isn't cancelled is lifted into "Next visit"; every
 * other row stays in "Later" in the order given (soonest first). The tab's rows no longer include
 * cancelled bookings (`upcomingBookingsFrom`); the guard stays for any caller that passes one.
 */
export function upcomingFrom(
  bookings: readonly BookingSummaryDto[],
  now: Date,
): { readonly next: NextVisit | null; readonly later: readonly BookingRow[] } {
  const nextDto = bookings.find((dto) => dto.status !== 'cancelled') ?? null;
  return {
    next: nextDto === null ? null : nextVisitFrom(nextDto),
    later: bookings.filter((dto) => dto !== nextDto).map((dto) => bookingRowFrom(dto, now)),
  };
}

/** The Past tab: rows grouped under month headers, in the order given (newest first). */
export function monthGroupsFrom(rows: readonly BookingRow[]): readonly MonthGroup[] {
  const groups: { month: string; rows: BookingRow[] }[] = [];
  for (const row of rows) {
    const month = row.month ?? 'UNDATED';
    const last = groups[groups.length - 1];
    if (last !== undefined && last.month === month) last.rows.push(row);
    else groups.push({ month, rows: [row] });
  }
  return groups;
}

/** The tab's count badge: the rows loaded, with "+" while older pages remain on the server. */
export function countLabel(count: number, hasMore: boolean): string {
  return hasMore ? `${String(count)}+` : String(count);
}
