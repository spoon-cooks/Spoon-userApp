import { DURATION_PHOTOS, START_TIME_PHOTOS, TIME_OF_DAY_PHOTOS } from '@features/recurringSetup';
import type { RecurringBookingDto, VisitSummaryDto } from '@features/recurringSetup';

import { autopayNotApproved, clockText, liveCalendarFrom } from './adapters';
import type {
  PlansSummaryModel,
  SummaryCalendar,
  SummaryDateMark,
  SummaryHistoryRow,
  SummaryVisit,
} from './data/summary';
import { dayLabel } from './visitDetails';

/**
 * The "Manage plans" tab on a real booking (`1017:433`): one tab per plan, the plan's dates on the
 * booking's calendar, and per visit its time of day, duration and start time over its past visits.
 *
 * A Plan whose every visit is cancelled (deleted, DEC-092) is left out while the booking is live:
 * it has nothing left to manage. A closed booking keeps every Plan, as its record.
 */
type Plan = RecurringBookingDto['plans'][number];
type PlanVisit = Plan['visits'][number];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BANDS = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' } as const;

function ordinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  return `${value}${['th', 'st', 'nd', 'rd'][value % 10] ?? 'th'}`;
}

/**
 * `1067:2179` — the booking's weeks with the plan's dates circled as on Live booking (dev notes
 * `2621:3563`…): by the date against today, Past, Today or Upcoming.
 */
function calendarOf(booking: RecurringBookingDto, plan: Plan, todayId: string): SummaryCalendar {
  const days = new Set(plan.days);
  const markOf = (id: string): SummaryDateMark | undefined => {
    if (!days.has(id)) return undefined;
    if (id < todayId) return 'past';
    return id === todayId ? 'today' : 'upcoming';
  };
  return {
    title: `Plan ${plan.planNumber} selected dates`,
    weekdays: WEEKDAYS,
    rows: liveCalendarFrom(booking, todayId).weeks.map((week) => ({
      id: week.id,
      month: week.monthLabel,
      cells: week.days.map((day) => {
        if (day === null) return null;
        const mark = markOf(day.id);
        return mark === undefined ? { day: day.day } : { day: day.day, mark };
      }),
    })),
  };
}

function historyRowOf(
  visit: VisitSummaryDto,
  todayId: string,
  autopayExpired: boolean,
): SummaryHistoryRow | null {
  if (visit.status !== 'completed' && visit.status !== 'cancelled') return null;
  const day =
    visit.date === todayId ? `Today, ${dayLabel(visit.date).split(', ')[1]}` : dayLabel(visit.date);
  const title = `${day} · ${clockText(visit.startTime)}`;
  if (visit.status === 'completed') {
    return {
      id: visit.visitId,
      status: 'done',
      title,
      meta: visit.cook === null ? 'Completed' : `Completed · ${visit.cook.displayName}`,
    };
  }
  const by =
    visit.cancelledBy === 'customer'
      ? 'Cancelled by you'
      : visit.cancelledBy === 'payment_failed'
        ? 'Cancelled · payment didn’t go through'
        : autopayExpired
          ? 'Cancelled · Autopay not approved'
          : 'Cancelled by Spoon';
  return { id: visit.visitId, status: 'cancelled', title, meta: by };
}

/** Every visit of a Plan, upcoming and past, once each. */
function planVisitsOf(booking: RecurringBookingDto, plan: Plan): readonly VisitSummaryDto[] {
  const all = new Map<string, VisitSummaryDto>();
  for (const day of booking.days) {
    for (const visit of day.visits) {
      if (visit.planNumber === plan.planNumber) all.set(visit.visitId, visit);
    }
  }
  for (const visit of plan.history) all.set(visit.visitId, visit);
  return [...all.values()];
}

/** Whether a Plan still has a visit that is not cancelled. A Plan with no visits read yet counts. */
export function planHasLiveVisit(booking: RecurringBookingDto, planNumber: number): boolean {
  const plan = booking.plans.find((candidate) => candidate.planNumber === planNumber);
  if (plan === undefined) return false;
  const visits = planVisitsOf(booking, plan);
  return visits.length === 0 || visits.some((visit) => visit.status !== 'cancelled');
}

/**
 * The duration caption: the visit's own length, or the range its days to come run to once one day's
 * duration was changed (DEC-093), e.g. "60–90 mins": short enough to stay on the one line.
 */
function durationCaption(visit: PlanVisit, days: readonly VisitSummaryDto[]): string {
  // The days still to come: a past visit's length is history, not what the visit runs to now.
  const lengths = days
    .filter((day) => day.status !== 'cancelled' && day.status !== 'completed')
    .map((day) => day.durationMinutes);
  const shortest = Math.min(visit.durationMinutes, ...lengths);
  const longest = Math.max(visit.durationMinutes, ...lengths);
  return shortest === longest ? `${visit.durationMinutes} minutes` : `${shortest}–${longest} mins`;
}

function visitOf(
  plan: Plan,
  visit: PlanVisit,
  days: readonly VisitSummaryDto[],
  todayId: string,
  autopayExpired: boolean,
): SummaryVisit {
  const history = plan.history
    .filter((past) => past.visitNumber === visit.visitNumber)
    .sort((a, b) => b.start.localeCompare(a.start))
    .map((past) => historyRowOf(past, todayId, autopayExpired))
    .filter((row): row is SummaryHistoryRow => row !== null);
  const duration = DURATION_PHOTOS[visit.durationMinutes];
  return {
    id: `visit-${visit.visitNumber}`,
    label: `${ordinal(visit.visitNumber)} Visit`,
    details: [
      {
        key: visit.timeOfDay,
        caption: BANDS[visit.timeOfDay],
        source: TIME_OF_DAY_PHOTOS[visit.timeOfDay],
      },
      {
        key: 'duration',
        caption: durationCaption(
          visit,
          days.filter((day) => day.visitNumber === visit.visitNumber),
        ),
        ...(duration === undefined ? {} : { source: duration }),
      },
      {
        key: 'startTime',
        caption: clockText(visit.startTime),
        source: START_TIME_PHOTOS[visit.timeOfDay],
      },
    ],
    historyCount: `${history.length} past visit${history.length === 1 ? '' : 's'}`,
    history,
  };
}

export function plansSummaryFrom(booking: RecurringBookingDto, todayId: string): PlansSummaryModel {
  const autopayExpired = autopayNotApproved(booking);
  const live = booking.status === 'active' || booking.status === 'pending_mandate';
  const sorted = [...booking.plans].sort((a, b) => a.planNumber - b.planNumber);
  const shown = live ? sorted.filter((plan) => planHasLiveVisit(booking, plan.planNumber)) : sorted;
  const plans = (shown.length === 0 ? sorted : shown).map((plan) => ({
    id: `plan-${plan.planNumber}`,
    label: `Plan ${plan.planNumber}`,
    calendar: calendarOf(booking, plan, todayId),
    visits: [...plan.visits]
      .sort((a, b) => a.visitNumber - b.visitNumber)
      .map((visit) => visitOf(plan, visit, planVisitsOf(booking, plan), todayId, autopayExpired)),
  }));
  return { plans, activePlanId: plans[0]?.id ?? '' };
}
