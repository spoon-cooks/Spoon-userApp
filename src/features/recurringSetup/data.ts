import type {
  RecurringDurationOption,
  RecurringPlanDraft,
  RecurringTimeOfDay,
  RecurringVisitChoice,
  RecurringWindow,
  RecurringWindowDay,
  RecurringWindowRow,
} from './types';

/** Step 1's header row (`144:2414`), Monday first. The eighth column carries no heading. */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-US', { weekday: 'long' });
const MONTH_DAY_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' });

/**
 * The month column's labels. Figma (`144:2474`) writes September as "Sept"; every other month
 * takes its usual three letters.
 */
const MONTH_LABELS = [
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

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

/** A local calendar date as `yyyy-mm-dd` — not `toISOString`, which shifts IST midnight a day back. */
function toLocalId(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Recurring's window (DEC-084): it opens today + 3 and runs 21 days. */
export const RECURRING_WINDOW_OFFSET_DAYS = 3;
export const RECURRING_WINDOW_LENGTH_DAYS = 21;

/**
 * Step 1 ("Pick your days", `144:2404`): exactly the 21 bookable dates and nothing else.
 *
 * Per the frame's logic note, dates are NOT padded out to fill a week. Rows run Monday to Sunday,
 * and a row also breaks where the month changes, so each row's eighth column can name one month
 * ("Sept", "Oct"). Slots outside the window are `null` and draw nothing.
 */
export function buildRecurringWindow(today: Date): RecurringWindow {
  const first = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const windowStart = addDays(first, RECURRING_WINDOW_OFFSET_DAYS);

  const days: RecurringWindowDay[] = [];
  for (let offset = 0; offset < RECURRING_WINDOW_LENGTH_DAYS; offset += 1) {
    const date = addDays(windowStart, offset);
    days.push({
      id: toLocalId(date),
      dayOfMonth: date.getDate(),
      weekday: (date.getDay() + 6) % 7,
      month: date.getMonth(),
      label: `${WEEKDAY_FORMATTER.format(date)}, ${MONTH_DAY_FORMATTER.format(date)}`,
    });
  }

  const rows: RecurringWindowRow[] = [];
  let slots: (RecurringWindowDay | null)[] = [];
  let rowMonth = days[0]?.month ?? 0;
  const flush = () => {
    if (slots.some((slot) => slot !== null)) {
      rows.push({ monthLabel: MONTH_LABELS[rowMonth] ?? '', days: slots });
    }
    slots = [];
  };
  for (const day of days) {
    // A new Monday, or a new month mid-week, starts a new row.
    if (slots.length > 0 && (day.weekday === 0 || day.month !== rowMonth)) flush();
    if (slots.length === 0) {
      rowMonth = day.month;
      slots = Array.from({ length: 7 }, () => null);
    }
    slots[day.weekday] = day;
  }
  flush();

  return { rows, orderedIds: days.map((day) => day.id) };
}

/**
 * A duration's id names its minutes (`d90`), so a duration the catalogue adds later still reads
 * back everywhere the flow shows one — the Summary, Edit date, the visit line — without a lookup
 * table that would have to know about it first.
 */
export function durationIdFor(minutes: number): string {
  return `d${minutes}`;
}

export function durationMinutes(durationId: string | null): number {
  const minutes = durationId === null ? NaN : Number(durationId.slice(1));
  return Number.isInteger(minutes) && minutes > 0 ? minutes : 0;
}

/** Schedule's own wording (`288:550`): "30 mins", "1 hr", "1.5 hr", "2.5 hr". */
export function durationLabelForMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} mins`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr`;
}

export function durationLabel(durationId: string | null): string {
  const minutes = durationMinutes(durationId);
  return minutes === 0 ? '' : durationLabelForMinutes(minutes);
}

/**
 * Schedule's durations (`288:550`) as the design draws them, used until the catalogue answers —
 * the dev preview, and anywhere the planning reads are not available. Live prices come from
 * `GET /v1/catalogue` (see `planning.tsx`).
 */
export const DURATION_OPTIONS: readonly RecurringDurationOption[] = [
  { minutes: 30, rupees: 69, mrp: 150 },
  { minutes: 45, rupees: 99, mrp: 225 },
  { minutes: 60, rupees: 129, mrp: 300 },
  { minutes: 90, rupees: 189, mrp: 450 },
  { minutes: 120, rupees: 259, mrp: 600 },
  { minutes: 150, rupees: 319, mrp: 750 },
].map(({ minutes, rupees, mrp }) => ({
  minutes,
  price: `₹${String(rupees)}`,
  strikePrice: `₹${String(mrp)}`,
  pricePaise: rupees * 100,
  mrpPaise: mrp * 100,
  id: durationIdFor(minutes),
  label: durationLabelForMinutes(minutes),
}));

/**
 * Schedule (`288:516`) — the three time-of-day bands, read off the start-time artwork's captions
 * (`586:3820`): "5 AM - 11:45 AM", "12 PM to 4:45 PM", "5 PM onwards". The evening band has no
 * stated end; it runs to 9:45 PM here, an assumption until availability says otherwise.
 */
export const TIME_OF_DAY_BANDS: readonly {
  readonly id: RecurringTimeOfDay;
  readonly label: string;
  readonly fromMinutes: number;
  readonly toMinutes: number;
}[] = [
  { id: 'morning', label: 'Morning', fromMinutes: 5 * 60, toMinutes: 11 * 60 + 45 },
  { id: 'afternoon', label: 'Afternoon', fromMinutes: 12 * 60, toMinutes: 16 * 60 + 45 },
  { id: 'evening', label: 'Evening', fromMinutes: 17 * 60, toMinutes: 21 * 60 + 45 },
];

/**
 * Start times every 15 minutes, as one-time Schedule offers them (the backend's
 * `BOOKING_SLOT_INTERVAL_MINUTES`, which the Recurring start-times read checks against). Was 30,
 * from the recurring frames; the owner asked for both flows to match (2026-10-19).
 */
const START_STEP_MINUTES = 15;

/** The start times a band offers, earliest first. */
export function startTimesFor(timeOfDay: RecurringTimeOfDay): readonly number[] {
  const band = TIME_OF_DAY_BANDS.find((entry) => entry.id === timeOfDay);
  if (band === undefined) return [];
  const starts: number[] = [];
  for (let minutes = band.fromMinutes; minutes <= band.toMinutes; minutes += START_STEP_MINUTES) {
    starts.push(minutes);
  }
  return starts;
}

/** "9:00 AM" — the Slot chip's label (`288:585`). */
export function formatStartTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours < 12 ? 'AM' : 'PM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(mins).padStart(2, '0')} ${suffix}`;
}

/** "1st", "2nd", "3rd", "4th", "11th", "21st" … */
export function ordinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

/** "Mon", "Tue", "Wed", "Thurs", "Fri", "Sat", "Sun" — the Selected days labels (`340:7096`). */
const SELECTED_DAY_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thurs', 'Fri', 'Sat', 'Sun'] as const;

/** A picked local date as the Selected days grid shows it. */
export function selectedDayLabel(id: string): { readonly weekday: string; readonly day: number } {
  const [year, month, day] = id.split('-').map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);
  return { weekday: SELECTED_DAY_WEEKDAYS[(date.getDay() + 6) % 7] ?? '', day };
}

/** The days a visit runs on: its own pick, or every plan day for a plan's 1st visit. */
export function visitDays(
  planDayIds: readonly string[],
  visit: Pick<RecurringVisitChoice, 'dayIds'>,
): readonly string[] {
  return visit.dayIds ?? planDayIds;
}

/** "1 hr · 9:00 AM" — a scheduled visit's tab caption (`408:1731`). */
export function visitCaption(visit: RecurringVisitChoice): string {
  return `${durationLabel(visit.durationId)} · ${formatStartTime(visit.startMinutes)}`;
}

/** A booked stretch of the day, in minutes after midnight: `[from, to)`. */
export interface RecurringBusyWindow {
  readonly fromMinutes: number;
  readonly toMinutes: number;
  /**
   * The days this window applies on, when known — what the start-times read is told about the
   * Plan's other visits (`sameDayVisits`). Absent, the window is checked locally only.
   */
  readonly dayIds?: readonly string[] | undefined;
}

/**
 * When the plan's other visits already have the cook on any of `dayIds` (`332:5718`'s note: a
 * 1 hr 9 AM 1st visit greys the 2nd visit out from 9 to 10 AM).
 */
export function busyWindowsFor(
  planDayIds: readonly string[],
  visits: readonly RecurringVisitChoice[],
  dayIds: readonly string[],
): readonly RecurringBusyWindow[] {
  const wanted = new Set(dayIds);
  return visits.flatMap((visit) => {
    const shared = visitDays(planDayIds, visit).filter((id) => wanted.has(id));
    return shared.length === 0
      ? []
      : [
          {
            fromMinutes: visit.startMinutes,
            toMinutes: visit.startMinutes + durationMinutes(visit.durationId),
            dayIds: shared,
          },
        ];
  });
}

/** `510` → `"08:30"`: the backend's Asia/Kolkata `HH:MM` for the flow's minutes-after-midnight. */
export function clockTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** The Plan's other visits on these days, as `POST /v1/recurring/start-times` takes them. */
export function sameDayVisitsFor(
  busy: readonly RecurringBusyWindow[],
): readonly { date: string; startTime: string; durationMinutes: number }[] {
  return busy.flatMap((window) =>
    (window.dayIds ?? []).map((date) => ({
      date,
      startTime: clockTime(window.fromMinutes),
      durationMinutes: window.toMinutes - window.fromMinutes,
    })),
  );
}

/** Whether a visit starting at `startMinutes` for `minutes` would overlap a busy window. */
export function clashes(
  startMinutes: number,
  minutes: number,
  busy: readonly RecurringBusyWindow[],
): boolean {
  const end = startMinutes + minutes;
  return busy.some((window) => startMinutes < window.toMinutes && end > window.fromMinutes);
}

/**
 * `444:10267` — "4 days · 1st Visit": the plan's days and the latest visit it already has. The
 * frames show "1st Visit" while the 2nd is being added.
 */
export function planSubtitle(dayCount: number, bookedCount: number): string {
  return `${dayCount} day${dayCount === 1 ? '' : 's'} · ${ordinal(Math.max(bookedCount, 1))} Visit`;
}

const SHORT_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** "Wed, 7 Oct" — the Edit date heading (`512:1233`). */
export function editDateLabel(id: string): string {
  const [year, month, day] = id.split('-').map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);
  const weekday = SHORT_WEEKDAYS[(date.getDay() + 6) % 7] ?? '';
  return `${weekday}, ${day} ${SHORT_MONTHS[month - 1] ?? ''}`;
}

/**
 * A plan with one date taken off one of its visits — what editing (`494:676`) or deleting
 * (`586:4315`) a date does to the plan it came from.
 *
 * The visit keeps its other days; a visit left with none is dropped. The date stays on the plan
 * while another visit still runs on it. Returns null when the plan has no visit left.
 */
export function withoutVisitDay(
  plan: RecurringPlanDraft,
  visitIndex: number,
  dayId: string,
): RecurringPlanDraft | null {
  const visits = plan.visits.flatMap((visit, index) => {
    if (index !== visitIndex) return [visit];
    const left = visitDays(plan.dayIds, visit).filter((id) => id !== dayId);
    return left.length === 0 ? [] : [{ ...visit, dayIds: left }];
  });
  if (visits.length === 0) return null;
  const stillBooked = visits.some((visit) => visitDays(plan.dayIds, visit).includes(dayId));
  return {
    ...plan,
    dayIds: stillBooked ? plan.dayIds : plan.dayIds.filter((id) => id !== dayId),
    visits,
  };
}

/** The same visit: time of day, duration and start time all equal (the days aside). */
export function sameVisit(a: RecurringVisitChoice, b: RecurringVisitChoice): boolean {
  return (
    a.timeOfDay === b.timeOfDay &&
    a.durationId === b.durationId &&
    a.startMinutes === b.startMinutes
  );
}

/**
 * One date given its own visit, placed where it belongs (owner, 31 Oct 2026): into the plan whose
 * 1st visit is exactly that visit, when one exists, rather than a new plan alongside an identical
 * one. A plan's 1st visit runs on every plan day, so the date simply joins that plan's days.
 * `null` when no plan has that visit; the caller then starts a new plan for the date.
 */
export function withDayInMatchingPlan(
  plans: readonly RecurringPlanDraft[],
  dayId: string,
  choice: RecurringVisitChoice,
): { readonly plans: readonly RecurringPlanDraft[]; readonly planIndex: number } | null {
  const planIndex = plans.findIndex(
    (plan) => plan.visits[0] !== undefined && sameVisit(plan.visits[0], choice),
  );
  const target = plans[planIndex];
  if (target === undefined) return null;
  const dayIds = target.dayIds.includes(dayId) ? target.dayIds : [...target.dayIds, dayId].sort();
  return {
    plans: plans.map((plan, index) => (index === planIndex ? { ...plan, dayIds } : plan)),
    planIndex,
  };
}

/** "Afternoon", "60 minutes", "9:00 AM" — a visit as the dialogs' tags list it (`586:4379`). */
export function visitTags(visit: RecurringVisitChoice): readonly string[] {
  const band = TIME_OF_DAY_BANDS.find((entry) => entry.id === visit.timeOfDay);
  return [
    band?.label ?? '',
    `${durationMinutes(visit.durationId)} minutes`,
    formatStartTime(visit.startMinutes),
  ];
}

/** "Afternoon · 60 minutes · 9:00 AM" — a visit as the Delete plan rows detail it (`542:1681`). */
export function visitDetail(visit: RecurringVisitChoice): string {
  return visitTags(visit).join(' · ');
}

/** "4 days · 2 visits" — a plan as the Start over rows detail it (`542:1757`). */
export function planDetail(plan: RecurringPlanDraft): string {
  const days = plan.dayIds.length;
  const visits = plan.visits.length;
  return `${days} day${days === 1 ? '' : 's'} · ${visits} visit${visits === 1 ? '' : 's'}`;
}

/**
 * A plan with one visit removed (`542:1534`). The plan keeps only the days a remaining visit
 * still runs on. Null when it was the plan's only visit — that is deleting the plan.
 */
export function withoutVisit(
  plan: RecurringPlanDraft,
  visitIndex: number,
): RecurringPlanDraft | null {
  const visits = plan.visits.filter((_, index) => index !== visitIndex);
  if (visits.length === 0) return null;
  const booked = new Set(visits.flatMap((visit) => visitDays(plan.dayIds, visit)));
  return { ...plan, dayIds: plan.dayIds.filter((id) => booked.has(id)), visits };
}
