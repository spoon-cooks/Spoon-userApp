import type { RecurringBookingDto, VisitSummaryDto } from '@features/recurringSetup';

import type {
  CalendarDay,
  CalendarDayKind,
  CalendarWeek,
  DayVisit,
  DayVisits,
  LiveCalendarModel,
  UpNextFixture,
} from './data/calendar';

/**
 * The booking (`GET /v1/me/recurring-bookings/{id}`, DEC-086) → what the Live booking tab draws.
 * Pure, so every rule is testable without a network.
 *
 *   calendar      every month the booking's window and visit dates touch, one Mon → Sun row per
 *                 week, split at month ends as `1286:6575` draws it; a date is past / today /
 *                 upcoming by the backend's own `days[].group`, and unmarked without visits
 *   pop-up        that date's visits, in start order: "1st Visit · 7:00 PM · 1 hr" over
 *                 "Completed · Cook Meera", "Cancelled by you", or the cook — and, while no
 *                 cook is named yet, the "Cook confirmed by …" card (no faces: the backend names
 *                 nobody before the T−3h debit, so none are invented)
 *   Up next       the backend's `upNext`; absent when nothing is left to run. Its photo is the
 *                 assigned cook's own, and there is none while the cook is not yet named
 *   progress      "3 done · 1 cancelled · 3 to go", the thread filled by done of all visits
 *
 * `todayId` is the Asia/Kolkata date (`todayInKolkata`), only for the Up-next "TODAY" wording.
 */
export function liveCalendarFrom(booking: RecurringBookingDto, todayId: string): LiveCalendarModel {
  const daysByDate = new Map(booking.days.map((day) => [day.date, day]));

  /*
   * From the week of the first visit to the week of the last (`1746:3304` starts on the week of
   * 28 Sept), not whole months: from the 1st, a plan starting on the 20th drew three greyed weeks
   * before its first visit (owner, 2026-10-17). The booking's window is the fallback.
   */
  const visitDates = booking.days
    .filter((day) => kindOf(day) !== 'none')
    .map((day) => day.date)
    .sort();
  const dates =
    visitDates.length > 0 ? visitDates : [booking.window.startDate, booking.window.endDate].sort();
  const first = dates[0] ?? todayId;
  const last = dates[dates.length - 1] ?? todayId;

  const { done, cancelled, toGo } = booking.counts;
  const total = done + cancelled + toGo;

  return {
    upNext: booking.upNext === null ? null : upNextOf(booking.upNext, todayId),
    progressLabel: `${done} done · ${cancelled} cancelled · ${toGo} to go`,
    progressFraction: total === 0 ? 0 : done / total,
    weekdays: WEEKDAYS,
    weeks: weeksBetween(first, last, (id) => {
      const day = daysByDate.get(id);
      return day === undefined ? 'none' : kindOf(day);
    }),
    hint: 'Tap a date to check its details',
    visitsByDay: Object.fromEntries(
      booking.days
        .filter((day) => kindOf(day) !== 'none')
        .map((day) => [day.date, dayVisitsOf(day.visits, autopayNotApproved(booking))]),
    ),
  };
}

/**
 * How a date is drawn: by the server's group, except a day still to come whose every visit is
 * cancelled (one cancelled, or its Plan deleted, DEC-092), which has nothing left to come and is
 * drawn as a plain date, not an Upcoming ring (owner's device test, 2026-10-17). A past or today's
 * cancelled visit keeps its mark, so its record can still be opened.
 */
function kindOf(day: RecurringBookingDto['days'][number]): CalendarDayKind {
  if (day.visits.length === 0) return 'none';
  if (day.group === 'upcoming' && day.visits.every((visit) => visit.status === 'cancelled')) {
    return 'none';
  }
  return day.group;
}

/**
 * Whether the booking ended because Autopay was never approved (`expireUnapprovedBookings`): closed
 * by `system` with no bank-confirmed mandate. Its visits then read "Autopay not approved" rather
 * than "Cancelled by Spoon", which sounds like Spoon's doing. A booking that closed because its
 * last visit or Plan was cancelled is `system` too, but its mandate was confirmed (a masked handle).
 */
export function autopayNotApproved(booking: RecurringBookingDto): boolean {
  return (
    booking.status === 'cancelled' &&
    booking.cancelledBy === 'system' &&
    (booking.mandate === null || booking.mandate.handleMasked === null)
  );
}

/** Asia/Kolkata's calendar date now — a fixed UTC+5:30, no daylight saving. */
export function todayInKolkata(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
/** The calendar's own month spelling (`1047:6213`): "Sept", not "Sep". */
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sept',
  'Oct',
  'Nov',
  'Dec',
] as const;

function parts(id: string): { year: number; month: number; day: number } {
  const [year, month, day] = id.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

function idOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 0 = Monday … 6 = Sunday, from the calendar date alone (no time zone involved). */
function weekdayIndex(year: number, month: number, day: number): number {
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The weeks from `first`'s to `last`'s, one row per Mon → Sun week, a month's rows never holding
 * another month's dates (blank cells instead), as `1286:6575` draws Sept → Oct.
 */
function weeksBetween(
  first: string,
  last: string,
  kindOf: (id: string) => CalendarDayKind,
): CalendarWeek[] {
  const end = parts(last);
  let { year, month } = parts(first);
  const weeks: CalendarWeek[] = [];

  while (year < end.year || (year === end.year && month <= end.month)) {
    const label = MONTHS[month - 1] ?? '';
    let row: (CalendarDay | null)[] = Array.from(
      { length: weekdayIndex(year, month, 1) },
      () => null,
    );
    for (let day = 1; day <= daysInMonth(year, month); day += 1) {
      const index = weekdayIndex(year, month, day);
      const id = idOf(year, month, day);
      row.push({ id, day, month: label, weekday: WEEKDAYS[index] ?? '', kind: kindOf(id) });
      if (index === 6) {
        weeks.push({ id: `w-${id}`, monthLabel: label, days: row });
        row = [];
      }
    }
    if (row.length > 0) {
      const id = row.find((cell) => cell !== null)?.id ?? idOf(year, month, 1);
      weeks.push({
        id: `w-${id}`,
        monthLabel: label,
        days: [...row, ...Array.from({ length: 7 - row.length }, () => null)],
      });
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  // Only the weeks from `first`'s to `last`'s: a row is kept when it holds a date in that range.
  return weeks.filter((week) => {
    const ids = week.days.filter((cell) => cell !== null).map((cell) => cell.id);
    const start = ids[0];
    const end = ids[ids.length - 1];
    return start !== undefined && end !== undefined && end >= weekStart(first) && start <= last;
  });
}

/** The Monday of `id`'s week, so a row is kept whole even when `first` falls mid-week. */
function weekStart(id: string): string {
  const { year, month, day } = parts(id);
  const date = new Date(Date.UTC(year, month - 1, day - weekdayIndex(year, month, day)));
  return date.toISOString().slice(0, 10);
}

function ordinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][value % 10] ?? 'th';
  return `${value}${value % 10 > 3 ? 'th' : suffix}`;
}

/** "30 mins", "1 hr", "1.5 hrs", "2 hrs" — the Live booking file's own wording. */
export function durationText(minutes: number): string {
  if (minutes < 60) return `${minutes} mins`;
  const hours = minutes / 60;
  const value = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${value} ${hours === 1 ? 'hr' : 'hrs'}`;
}

/** `"19:00"` → `"7:00 PM"`. */
export function clockText(hhmm: string): string {
  const [hours, minutes] = hhmm.split(':').map(Number) as [number, number];
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/** An instant as its Asia/Kolkata wall clock, `"5 PM"` on the hour, else `"5:30 PM"`. */
function kolkataClock(instant: string): string {
  const local = new Date(new Date(instant).getTime() + 330 * 60_000);
  const text = clockText(
    `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`,
  );
  return text.replace(':00 ', ' ');
}

function cookName(visit: VisitSummaryDto): string | null {
  return visit.cook?.displayName ?? null;
}

function dayVisitOf(visit: VisitSummaryDto, autopayExpired: boolean): DayVisit {
  const title = `${ordinal(visit.visitNumber)} Visit · ${clockText(visit.startTime)} · ${durationText(visit.durationMinutes)}`;
  const cook = cookName(visit);

  if (visit.displayState === 'completed') {
    return {
      id: visit.visitId,
      status: 'completed',
      title,
      meta: cook === null ? 'Completed' : `Completed · ${cook}`,
    };
  }
  if (visit.displayState === 'cancelled') {
    return {
      id: visit.visitId,
      status: 'cancelled',
      title,
      meta:
        visit.cancelledBy === 'customer'
          ? 'Cancelled by you'
          : visit.cancelledBy === 'payment_failed'
            ? 'Cancelled · payment failed'
            : autopayExpired
              ? 'Cancelled · Autopay not approved'
              : 'Cancelled by Spoon',
    };
  }
  if (cook !== null) {
    const photoUrl = visit.cook?.profileImageUrl ?? null;
    return {
      id: visit.visitId,
      status: 'assigned',
      title,
      meta: `Upcoming · ${cook}`,
      ...(photoUrl === null ? {} : { photo: { uri: photoUrl } }),
    };
  }
  return {
    id: visit.visitId,
    status: 'unassigned',
    title,
    // "Upcoming · …" like an assigned visit (`1006:527`); no cook to name yet.
    meta: 'Upcoming · Cook pending',
    pool: {
      title: `Cook confirmed by ${kolkataClock(visit.cookConfirmBy)}`,
      subtitle: 'Familiar cooks from your Pool',
    },
  };
}

function dayVisitsOf(visits: readonly VisitSummaryDto[], autopayExpired: boolean): DayVisits {
  const ordered = [...visits].sort((a, b) => a.start.localeCompare(b.start));
  const plans = [...new Set(ordered.map((visit) => visit.planNumber))].sort((a, b) => a - b);
  const count = `${ordered.length} ${ordered.length === 1 ? 'visit' : 'visits'}`;
  const planLabel =
    plans.length === 1 ? `Plan ${plans[0]} · ${count}` : `Plans ${plans.join(' & ')} · ${count}`;
  return { planLabel, visits: ordered.map((visit) => dayVisitOf(visit, autopayExpired)) };
}

function upNextOf(visit: VisitSummaryDto, todayId: string): UpNextFixture {
  const today = parts(todayId);
  const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1))
    .toISOString()
    .slice(0, 10);
  const { month, day, year } = parts(visit.date);
  const when =
    visit.date === todayId
      ? 'TODAY'
      : visit.date === tomorrow
        ? 'TOMORROW'
        : `${WEEKDAYS[weekdayIndex(year, month, day)]}, ${day} ${MONTHS[month - 1]}`.toUpperCase();
  const cook = cookName(visit);
  const photoUrl = visit.cook?.profileImageUrl ?? null;
  return {
    label: `UP NEXT · ${when}`,
    title: `${ordinal(visit.visitNumber)} Visit, ${clockText(visit.startTime)}`,
    meta: `${durationText(visit.durationMinutes)} • ${cook ?? 'Cook pending'}`,
    ...(photoUrl === null ? {} : { photo: { uri: photoUrl } }),
  };
}
