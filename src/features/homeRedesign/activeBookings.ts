import { serviceWindowOf } from '@core/time';
import type { BookingDetailDto, BookingStatus, BookingSummaryDto } from '@features/booking';
import type { RecurringBookingDto, VisitSummaryDto } from '@features/recurringSetup';
import {
  addServiceDays,
  formatServiceTime,
  localMinuteIn,
  serviceDateAnchor,
  serviceDateIn,
} from '@features/scheduled';

import type { ActiveBookingCard, ActiveBookingState, ActiveBookingTimeOfDay } from './types';

/**
 * `2240:5822` Home banner + `2243:1120` carousel — the active bookings as cards. Pure.
 *
 * Sources:
 *   GET /v1/me/bookings/active   the bookings, already filtered by the server: live ones, plus
 *                                completed ones not yet rated (120 h backstop)
 *   GET /v1/bookings/:id         in progress / completed only — the duration with extensions
 *   GET /v1/recurring/bookings   which bookings are Recurring visits (a visit carries its
 *                                `bookingId` once its T−3h debit succeeded)
 *
 * A Recurring visit shows only once it IS a booking — from its T−3h debit — never earlier from the
 * plan's schedule (product decision, 2026-10-12).
 *
 * State, per the dev note (`2246:2444`): Upcoming = confirmed up to the cook's arrival (before
 * the Start OTP); In progress = Start OTP to End OTP (`cooking`); Completed = End OTP done.
 * `created` is not confirmed yet (payment still settling) and `cancelled` never shows on Home.
 */

export interface ActiveBookingSources {
  readonly bookings: readonly BookingSummaryDto[];
  readonly details: ReadonlyMap<string, BookingDetailDto>;
  readonly recurring: readonly RecurringBookingDto[] | undefined;
  /** The catalogue's `operatingWindow.timeZone`; `undefined` reads the device clock. */
  readonly timeZone: string | undefined;
  readonly now: Date;
}

const STATE_OF: Partial<Record<BookingStatus, ActiveBookingState>> = {
  assigned: 'upcoming',
  cook_en_route: 'upcoming',
  cook_arrived: 'upcoming',
  cooking: 'in_progress',
  completed: 'completed',
};

/** Bookings whose card needs their detail: the bar's window, and an extended duration. */
export function activeBookingIdsNeedingDetail(
  bookings: readonly BookingSummaryDto[],
): readonly string[] {
  return bookings
    .filter((b) => b.status === 'cooking' || b.status === 'completed')
    .map((b) => b.id);
}

/** "2" over "HRS"; minutes under an hour read "45" over "MINS". */
export function bannerDuration(minutes: number): ActiveBookingCard['duration'] {
  if (minutes < 60) return { value: String(minutes), unit: 'MINS' };
  const hours = minutes / 60;
  return {
    value: Number.isInteger(hours) ? String(hours) : hours.toFixed(1),
    unit: hours === 1 ? 'HR' : 'HRS',
  };
}

/** The dev note's proposed bands: Morning before 12:00, Afternoon 12:00–17:00, then evening. */
export function timeOfDayAt(timeZone: string | undefined, start: Date): ActiveBookingTimeOfDay {
  const minute = localMinuteIn(timeZone, start);
  if (minute < 12 * 60) return 'morning';
  if (minute < 17 * 60) return 'afternoon';
  return 'evening';
}

/** "Wed, 14 Oct" — the Figma's day format on every handset, whatever its locale. */
function dayLabel(serviceDate: string): string {
  const anchor = serviceDateAnchor(serviceDate);
  try {
    const part = (options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(anchor);
    return `${part({ weekday: 'short' })}, ${part({ day: 'numeric', month: 'short' })}`;
  } catch {
    return anchor.toDateString();
  }
}

/** "Today · 9:00 AM" / "Tomorrow · 1:00 PM" / "Wed, 14 Oct · 7:00 PM", on the service clock. */
export function bannerWhenLabel(
  start: Date,
  state: ActiveBookingState,
  timeZone: string | undefined,
  now: Date,
): string {
  const time = formatServiceTime(timeZone, start);
  // In progress always reads "Today · start time".
  if (state === 'in_progress') return `Today · ${time}`;
  const date = serviceDateIn(timeZone, start);
  const today = serviceDateIn(timeZone, now);
  if (date === today) return `Today · ${time}`;
  if (date === addServiceDays(today, 1)) return `Tomorrow · ${time}`;
  return `${dayLabel(date)} · ${time}`;
}

function epochOf(iso: string | null | undefined): number | null {
  if (iso === null || iso === undefined) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

interface Ordered {
  readonly card: ActiveBookingCard;
  readonly startMs: number;
}

/** Carousel order (`2246:2459`): In progress first, then Upcoming by start time, then Completed. */
const RANK: Record<ActiveBookingState, number> = { in_progress: 0, upcoming: 1, completed: 2 };

function byCarouselOrder(a: Ordered, b: Ordered): number {
  const rank = RANK[a.card.state] - RANK[b.card.state];
  if (rank !== 0) return rank;
  // The most recently finished completed card first; everything else soonest first.
  const time = a.card.state === 'completed' ? b.startMs - a.startMs : a.startMs - b.startMs;
  return time !== 0 ? time : a.card.key.localeCompare(b.card.key);
}

function visitsOf(plan: RecurringBookingDto): readonly VisitSummaryDto[] {
  return plan.days.flatMap((day) => day.visits);
}

export function activeBookingCardsFrom(sources: ActiveBookingSources): ActiveBookingCard[] {
  const { timeZone, now } = sources;
  const recurringPlans = sources.recurring ?? [];
  const recurringBookingIds = new Set(
    recurringPlans
      .flatMap(visitsOf)
      .map((visit) => visit.bookingId)
      .filter((id): id is string => id !== null),
  );

  const cards: Ordered[] = [];

  for (const booking of sources.bookings) {
    const state = STATE_OF[booking.status];
    const startMs = epochOf(booking.scheduledStart);
    if (state === undefined || startMs === null) continue;
    const detail = sources.details.get(booking.id);
    const minutes =
      detail?.totalDurationMinutes ?? detail?.durationMinutes ?? booking.durationMinutes;
    // The time the card says is the visit's own: the booked slot until the start OTP, then when
    // it was entered (owner, 31 Oct 2026). The carousel still orders by the booked slot.
    const shown = serviceWindowOf({
      bookedStart: booking.scheduledStart,
      durationMinutes: booking.durationMinutes,
      timing: booking.timing ?? detail?.timing,
    }).start;
    const start = new Date(shown === null ? startMs : Date.parse(shown));

    cards.push({
      startMs,
      card: {
        key: `booking:${booking.id}`,
        bookingId: booking.id,
        type: recurringBookingIds.has(booking.id) ? 'recurring' : 'one_time',
        state,
        timeOfDay: timeOfDayAt(timeZone, start),
        whenLabel: bannerWhenLabel(start, state, timeZone, now),
        duration: bannerDuration(minutes),
      },
    });
  }

  return cards.sort(byCarouselOrder).map((entry) => entry.card);
}
