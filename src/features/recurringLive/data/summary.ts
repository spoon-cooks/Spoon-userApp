import type { ImageSourcePropType } from 'react-native';

/**
 * The recurring live booking "Manage plans" tab (Summary): its model, and the frames' own copy
 * read verbatim off Figma `cCQlzTeiObQkpVBzwI8mZi` page `1005:131` — `1017:433` (1st Visit),
 * `1017:5997` (2nd Visit) and `1017:6054` (edited, unsaved) — which the dev preview draws. A real
 * booking's model comes from `plansSummaryFrom`.
 */

/** How a date is marked on the summary calendar (`1067:2171`). */
/**
 * Dev notes `2621:3563`…: the Live booking circles — before today Past, today Today, after today
 * Upcoming. A date not in the plan carries no mark.
 */
export type SummaryDateMark = 'past' | 'today' | 'upcoming';

export interface SummaryDateCell {
  readonly day: number;
  readonly mark?: SummaryDateMark;
}

/** One calendar row: seven weekday slots (null = blank) and the month named at its right. */
export interface SummaryCalendarRow {
  readonly id: string;
  readonly cells: readonly (SummaryDateCell | null)[];
  readonly month: string;
}

export interface SummaryCalendar {
  readonly title: string;
  readonly weekdays: readonly string[];
  readonly rows: readonly SummaryCalendarRow[];
}

export type SummaryTileKey = 'morning' | 'afternoon' | 'evening' | 'duration' | 'startTime';

/** One captioned photo tile in "Booking details" (`1017:439`). */
export interface SummaryDetailTile {
  readonly key: SummaryTileKey;
  readonly caption: string;
  /** The tile's photo when it isn't the frames' own (e.g. a real visit's 90-minute timer). */
  readonly source?: ImageSourcePropType;
}

export type SummaryHistoryStatus = 'done' | 'cancelled';

export interface SummaryHistoryRow {
  readonly id: string;
  readonly status: SummaryHistoryStatus;
  readonly title: string;
  readonly meta: string;
}

export interface SummaryVisit {
  readonly id: string;
  readonly label: string;
  readonly details: readonly SummaryDetailTile[];
  readonly historyCount: string;
  readonly history: readonly SummaryHistoryRow[];
}

export interface SummaryPlan {
  readonly id: string;
  readonly label: string;
}

/** One plan as the tab draws it: its tab, its dates and its visits. */
export interface SummaryPlanModel extends SummaryPlan {
  readonly calendar: SummaryCalendar;
  readonly visits: readonly SummaryVisit[];
}

export interface PlansSummaryModel {
  readonly plans: readonly SummaryPlanModel[];
  readonly activePlanId: string;
}

const COMPLETED_BY_RANI = 'Completed · Cook Rani';

/** `1017:436` — the plan tabs. Plan 2 is the one open in every frame. */
export const SUMMARY_PLANS: readonly SummaryPlan[] = [
  { id: 'plan-1', label: 'Plan 1' },
  { id: 'plan-2', label: 'Plan 2' },
];

export const SUMMARY_ACTIVE_PLAN_ID = 'plan-2';

/** `1067:2179` — identical across the three frames. */
export const SUMMARY_CALENDAR: SummaryCalendar = {
  title: 'Plan 2 selected dates',
  weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  rows: [
    {
      id: 'r1',
      month: 'Sept',
      cells: [{ day: 28 }, { day: 29 }, { day: 30 }, null, null, null, null],
    },
    {
      id: 'r2',
      month: 'Oct',
      cells: [null, null, null, { day: 1 }, { day: 2, mark: 'past' }, { day: 3 }, { day: 4 }],
    },
    {
      id: 'r3',
      month: 'Oct',
      cells: [
        { day: 5 },
        { day: 6 },
        { day: 7, mark: 'today' },
        { day: 8 },
        { day: 9 },
        { day: 10 },
        { day: 11 },
      ],
    },
    {
      id: 'r4',
      month: 'Oct',
      cells: [
        { day: 12 },
        { day: 13 },
        { day: 14 },
        { day: 15 },
        { day: 16 },
        { day: 17, mark: 'upcoming' },
        { day: 18, mark: 'upcoming' },
      ],
    },
  ],
};

/** `1017:433` / `1017:5997` — the plan's two visits. */
const FIRST_VISIT: SummaryVisit = {
  id: 'visit-1',
  label: '1st Visit',
  details: [
    { key: 'morning', caption: 'Morning' },
    { key: 'duration', caption: '60 minutes' },
    { key: 'startTime', caption: '9:00 AM' },
  ],
  historyCount: '2 past visits',
  history: [
    { id: 'h1', status: 'done', title: 'Today, 7 Oct · 9:00 AM', meta: COMPLETED_BY_RANI },
    { id: 'h2', status: 'done', title: 'Fri, 2 Oct · 9:00 AM', meta: COMPLETED_BY_RANI },
  ],
};

const SECOND_VISIT: SummaryVisit = {
  id: 'visit-2',
  label: '2nd Visit',
  details: [
    { key: 'evening', caption: 'Evening' },
    { key: 'duration', caption: '60 minutes' },
    { key: 'startTime', caption: '7:00 PM' },
  ],
  historyCount: '1 past visit',
  history: [
    {
      id: 'h1',
      status: 'cancelled',
      title: 'Fri, 2 Oct · 7:00 PM',
      meta: 'Cancelled by you · No charge',
    },
  ],
};

export const SUMMARY_VISITS: readonly SummaryVisit[] = [FIRST_VISIT, SECOND_VISIT];

/**
 * `1017:6054` — the 1st Visit with an unsaved edit: its start time reads 10:00 AM (`1017:6089`)
 * while the history is unchanged.
 */
export const SUMMARY_EDITED_FIRST_VISIT: SummaryVisit = {
  ...FIRST_VISIT,
  details: [
    { key: 'morning', caption: 'Morning' },
    { key: 'duration', caption: '60 minutes' },
    { key: 'startTime', caption: '10:00 AM' },
  ],
};

/** The frames as drawn: two plan tabs over Plan 2's dates and visits. */
export function plansDemoModel(edited = false): PlansSummaryModel {
  const visits = edited
    ? SUMMARY_VISITS.map((visit) =>
        visit.id === SUMMARY_EDITED_FIRST_VISIT.id ? SUMMARY_EDITED_FIRST_VISIT : visit,
      )
    : SUMMARY_VISITS;
  return {
    plans: SUMMARY_PLANS.map((plan) => ({ ...plan, calendar: SUMMARY_CALENDAR, visits })),
    activePlanId: SUMMARY_ACTIVE_PLAN_ID,
  };
}
