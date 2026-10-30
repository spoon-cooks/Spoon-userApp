import type { ImageSourcePropType } from 'react-native';

import { POOL_COOK_PHOTOS, UP_NEXT_COOK_PHOTO } from '../components/calendar/assets';

/**
 * Fixture data for the Live booking calendar — Figma `cCQlzTeiObQkpVBzwI8mZi`, frames `1005:132`
 * (calendar), `1354:1543` (calendar with a pop-up open) and the pop-ups `1006:323` (past),
 * `1006:527` (today) and `1006:727` (upcoming).
 *
 * STATIC ONLY: nothing here is read from the backend. The calendar is transcribed cell for cell
 * from `1286:6575`; "today" is Thu 8 Oct, as the frame draws it.
 *
 * The three pop-up frames are drawn for dates the calendar frame does not agree with ("Today,
 * 14 Oct" while the calendar's today is the 8th; "Wed, 21 Oct", which is off the calendar). Their
 * visit rows, plan lines and actions are transcribed verbatim; the HEADING is built from the date
 * the pop-up is opened on, so the screen never contradicts itself. Visit dates without a pop-up
 * frame of their own reuse the rows of the frame for their kind.
 */

/** How a calendar date is marked (`1286:6647` past, `1286:6653` today, `1286:6644` upcoming). */
export type CalendarDayKind = 'past' | 'today' | 'upcoming' | 'none';

export interface CalendarDay {
  /** ISO date, e.g. `2026-10-02` — also what `initialSelectedDate` takes. */
  readonly id: string;
  readonly day: number;
  /** Short month as the pop-up heading spells it ("Sept", "Oct"). */
  readonly month: string;
  /** Short weekday ("Fri"). */
  readonly weekday: string;
  readonly kind: CalendarDayKind;
}

export interface CalendarWeek {
  readonly id: string;
  /** The right-hand month column (`1047:6213`). */
  readonly monthLabel: string;
  /** Mon → Sun; `null` is a blank cell. */
  readonly days: readonly (CalendarDay | null)[];
}

/** `assigned` is an upcoming visit whose cook is confirmed (`1735:2654`). */
export type VisitStatus = 'completed' | 'cancelled' | 'assigned' | 'unassigned';

export interface DayVisit {
  readonly id: string;
  readonly status: VisitStatus;
  /** "1st Visit · 5:30 AM · 1hr". */
  readonly title: string;
  /** "Completed · Cook Rani". */
  readonly meta: string;
  /** Assigned visits only — the cook's face in the `Glyph/cook` ring; absent without a photo. */
  readonly photo?: ImageSourcePropType;
  /** Unassigned visits only — the `1006:740` "Cook pending" card. */
  readonly pool?: {
    readonly title: string;
    readonly subtitle: string;
    /** The overlapped faces. Omitted where there are no real cooks to show. */
    readonly photos?: readonly ImageSourcePropType[];
  };
}

export interface DayVisits {
  /** "Plan 2 · 3 visits". */
  readonly planLabel: string;
  readonly visits: readonly DayVisit[];
}

export interface UpNextFixture {
  readonly label: string;
  readonly title: string;
  readonly meta: string;
  /** The visit's cook; absent while none is named. */
  readonly photo?: ImageSourcePropType;
}

export interface CalendarFixture {
  readonly upNext: UpNextFixture;
  /** `1005:170`. */
  readonly progressLabel: string;
  /** `1005:175` — the Done fill: 154 of the 370pt track. */
  readonly progressFraction: number;
  readonly weekdays: readonly string[];
  readonly weeks: readonly CalendarWeek[];
  readonly hint: string;
}

/** The dates the dev route opens to show each pop-up state. */
export const CALENDAR_DEMO_DATES = {
  past: '2026-10-02',
  today: '2026-10-08',
  upcoming: '2026-10-14',
  /** `1735:2630` — an upcoming visit whose cook is confirmed. */
  assigned: '2026-10-15',
} as const;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function week(
  id: string,
  monthLabel: string,
  monthNumber: string,
  month: string,
  cells: readonly ([number, CalendarDayKind] | null)[],
): CalendarWeek {
  return {
    id,
    monthLabel,
    days: cells.map((cell, index) =>
      cell === null
        ? null
        : {
            id: `2026-${monthNumber}-${String(cell[0]).padStart(2, '0')}`,
            day: cell[0],
            month,
            weekday: WEEKDAYS[index] ?? '',
            kind: cell[1],
          },
    ),
  };
}

export const CALENDAR_FIXTURE: CalendarFixture = {
  // `1461:6324` — Up next banner / recurring / assigned, "Late evening".
  upNext: {
    label: 'UP NEXT · TODAY',
    // Today's 2nd visit in the pop-up (`1006:527`), so the preview tells one story.
    title: '2nd Visit, 8:00 PM',
    meta: '2.5 hrs • Cook Rani',
    photo: UP_NEXT_COOK_PHOTO,
  },
  progressLabel: '3 done · 1 cancelled · 3 to go',
  progressFraction: 154 / 370,
  weekdays: WEEKDAYS,
  weeks: [
    week('w1', 'Sept', '09', 'Sept', [
      [28, 'past'],
      [29, 'past'],
      [30, 'none'],
      null,
      null,
      null,
      null,
    ]),
    week('w2', 'Oct', '10', 'Oct', [
      null,
      null,
      null,
      [1, 'none'],
      [2, 'past'],
      [3, 'none'],
      [4, 'none'],
    ]),
    week('w3', 'Oct', '10', 'Oct', [
      [5, 'none'],
      [6, 'past'],
      [7, 'none'],
      [8, 'today'],
      [9, 'none'],
      [10, 'none'],
      [11, 'upcoming'],
    ]),
    week('w4', 'Oct', '10', 'Oct', [
      [12, 'none'],
      [13, 'none'],
      [14, 'upcoming'],
      [15, 'upcoming'],
      [16, 'none'],
      [17, 'upcoming'],
      [18, 'none'],
    ]),
  ],
  hint: 'Tap a date to check its details',
};

const POOL = {
  title: 'Cook confirmed by 5 PM',
  subtitle: 'Familiar cooks from your Pool',
  photos: POOL_COOK_PHOTOS,
} as const;

/** `1006:323` — Date pop-up / past. */
const PAST_VISITS: DayVisits = {
  planLabel: 'Plan 2 · 3 visits',
  visits: [
    {
      id: 'v1',
      status: 'completed',
      title: '1st Visit · 5:30 AM · 1hr',
      meta: 'Completed · Cook Rani',
    },
    {
      id: 'v2',
      status: 'completed',
      title: '2nd Visit · 4:30 PM · 30 mins',
      meta: 'Completed · Cook Rani',
    },
    {
      id: 'v3',
      status: 'cancelled',
      title: '3rd Visit · 8:00 PM · 45 mins',
      meta: 'Cancelled by you',
    },
  ],
};

/** `1006:527` — Date pop-up / today. */
const TODAY_VISITS: DayVisits = {
  planLabel: 'Plan 1 · 2 visits',
  visits: [
    {
      id: 'v1',
      status: 'completed',
      title: '1st Visit · 3:30 PM · 1 hr',
      meta: 'Completed · Cook Rani',
    },
    {
      id: 'v2',
      status: 'unassigned',
      title: '2nd Visit · 8:00 PM · 2.5 hrs',
      meta: 'Upcoming · 1.5 hrs',
      pool: POOL,
    },
  ],
};

/** `1006:727` — Date pop-up / upcoming. */
const UPCOMING_VISITS: DayVisits = {
  planLabel: 'Plan 1 · 1 visit',
  visits: [
    {
      id: 'v1',
      status: 'unassigned',
      title: '1st Visit · 8:00 PM · 2.5 hrs',
      meta: 'Upcoming · 1.5 hrs',
      pool: POOL,
    },
  ],
};

/** `1735:2630` — Date pop-up / upcoming, assigned (Thu, 15 Oct in the fixture). */
const UPCOMING_ASSIGNED_DAY_ID = CALENDAR_DEMO_DATES.assigned;
const UPCOMING_ASSIGNED_VISITS: DayVisits = {
  planLabel: 'Plan 1 · 1 visit',
  visits: [
    {
      id: 'v1',
      status: 'assigned',
      title: '1st Visit · 9:00 AM · 1 hr',
      meta: 'Upcoming · Cook Rani',
      photo: UP_NEXT_COOK_PHOTO,
    },
  ],
};

const VISITS_BY_KIND: Record<Exclude<CalendarDayKind, 'none'>, DayVisits> = {
  past: PAST_VISITS,
  today: TODAY_VISITS,
  upcoming: UPCOMING_VISITS,
};

/** Every date in the fixture, by id. */
export function findCalendarDay(id: string): CalendarDay | undefined {
  for (const row of CALENDAR_FIXTURE.weeks) {
    for (const day of row.days) {
      if (day?.id === id) return day;
    }
  }
  return undefined;
}

/** The visits listed in a date's pop-up, or `undefined` for a date with none. */
export function visitsForDay(day: CalendarDay): DayVisits | undefined {
  if (day.id === UPCOMING_ASSIGNED_DAY_ID) return UPCOMING_ASSIGNED_VISITS;
  return day.kind === 'none' ? undefined : VISITS_BY_KIND[day.kind];
}

/** The pop-up heading: "Fri, 2 Oct", or "Today, 8 Oct" on today. */
export function dayHeading(day: CalendarDay): string {
  return `${day.kind === 'today' ? 'Today' : day.weekday}, ${day.day} ${day.month}`;
}

/**
 * Everything the Live booking tab draws: the fixture's shape, with the visits of each date keyed by
 * its id and an Up-next card that may be absent (nothing left to run). The dev preview renders
 * `CALENDAR_DEMO_MODEL`; the real route builds one from the booking (`liveCalendarFrom`).
 */
export interface LiveCalendarModel {
  readonly upNext: UpNextFixture | null;
  readonly progressLabel: string;
  readonly progressFraction: number;
  readonly weekdays: readonly string[];
  readonly weeks: readonly CalendarWeek[];
  readonly hint: string;
  readonly visitsByDay: Readonly<Record<string, DayVisits>>;
}

/** A date of `weeks` by id. */
export function findDayIn(weeks: readonly CalendarWeek[], id: string): CalendarDay | undefined {
  for (const row of weeks) {
    for (const day of row.days) {
      if (day?.id === id) return day;
    }
  }
  return undefined;
}

/** The fixture as a model: each marked date lists the rows of its kind's pop-up frame. */
export const CALENDAR_DEMO_MODEL: LiveCalendarModel = {
  ...CALENDAR_FIXTURE,
  visitsByDay: Object.fromEntries(
    CALENDAR_FIXTURE.weeks.flatMap((row) =>
      row.days.flatMap((day) => {
        const visits = day === null ? undefined : visitsForDay(day);
        return day === null || visits === undefined ? [] : [[day.id, visits] as const];
      }),
    ),
  ),
};
