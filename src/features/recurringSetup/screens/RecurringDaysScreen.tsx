import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAndroidBackHandler } from '@core/navigation';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { Screen, ScreenHeader, Text } from '@ui';
import { lightTheme } from '@ui/theme/ThemeProvider';

import { DaysLegend } from '../components/DaysLegend';
import { HelpFab } from '../components/HelpFab';
import { PlanHeader } from '../components/PlanHeader';
import { RecurringFooter } from '../components/RecurringFooter';
import { RECURRING_WINDOW_OFFSET_DAYS, WEEKDAY_LABELS, buildRecurringWindow } from '../data';
import { useRecurringPlanning } from '../planning';
import type { RecurringWindowDay } from '../types';

/**
 * Recurring setup — Step 1 "Pick your days".
 *
 * Source: Figma `cCQlzTeiObQkpVBzwI8mZi` (Spoon — User).
 *
 * "Date selections flows": `144:2404` (unselected), `135:1681` (under 5), `147:1510` (vertical
 * drag), `132:1568` (horizontal drag), `149:1525` (random taps), `154:1583` (max cap error):
 *
 *  - Only the 21 bookable dates (today + 3 onward) are shown; the week is not padded out.
 *  - Days are picked by tapping, or by dragging across them vertically or horizontally.
 *  - In a plan, the earliest picked day is the start and the latest the end; both take the brand
 *    fill, the days between take the tint. Rechecked on every change.
 *  - A 15th pick is refused and "Max 14 days reached…" shows for a moment.
 *
 * "Date selection / Plan creation": `340:6661` (Plan 1), `334:6406` (add plans), `340:6550`
 * (Plan 2):
 *
 *  - Everything picked on the first calendar is Plan 1, and each plan's tile counts its days.
 *  - The "+" is always shown (owner direction, overriding the frame's "appears after one tap"):
 *    it starts the next plan on a blank calendar. There is no cap on plans, but a new plan can
 *    only be started once every plan has at least one day — until then the "+" is dimmed and
 *    does nothing (owner direction).
 *  - Days already in another plan are greyed out and cannot be picked.
 *  - The CTA unlocks once all plans together have 5 days, and until then reads "Pick N more days".
 *
 * Defaults the frames leave open: the 14-day cap counts every plan together (it is the window's
 * cap, not a plan's), and tapping a tile returns to that plan's calendar.
 *
 * The window, the 5-day minimum and the 14-day cap come from `GET /v1/recurring/eligibility` once
 * it answers, and days the calendar says no pool Cook can take are greyed and refused like a day
 * another plan holds (`useRecurringPlanning`). Until then the same values are counted locally.
 */
/** How long the max-cap error stays up — the frame says only "temporarily". */
const CAP_ERROR_MS = 3000;

interface PlanDraft {
  readonly id: string;
  readonly days: ReadonlySet<string>;
}

/** A plan as Step 1 hands it on: its id, label and dates, earliest first. */
export interface RecurringPlanDays {
  readonly id: string;
  readonly label: string;
  readonly dayIds: readonly string[];
}

export interface RecurringDaysScreenProps {
  readonly onBack: () => void;
  /** Left unwired by the route for now. Receives every plan that has at least one day. */
  readonly onContinue?: (plans: readonly RecurringPlanDays[]) => void;
  /** The day the window is counted from. Defaults to now; the dev preview pins Figma's date. */
  readonly today?: Date;
  /**
   * Plans already made, when the flow returns here from the Summary — to edit a plan's days, or
   * (with a trailing blank plan) to add one. Omitted, the screen opens on a blank Plan 1.
   */
  readonly initialPlans?: readonly { readonly id: string; readonly dayIds: readonly string[] }[];
  /** Which of `initialPlans` opens active. Defaults to the last. */
  readonly initialActiveId?: string;
  /** Plans already scheduled: the CTA names the first plan NOT in this set. */
  readonly scheduledPlanIds?: ReadonlySet<string>;
  /** Opens with the "Max 14 days reached" error already up — the dev preview's way to see it. */
  readonly initialCapError?: boolean;
  readonly testID?: string;
}

/**
 * The day the window is counted from. The backend's window start wins when it has answered —
 * `buildRecurringWindow` opens the window `RECURRING_WINDOW_OFFSET_DAYS` after this — so the grid
 * is the server's 21 days even if the device clock disagrees with Asia/Kolkata's date.
 */
function windowOrigin(windowStartId: string | null, todayKey: number | undefined): Date {
  if (windowStartId !== null) {
    const [year = 0, month = 1, day = 1] = windowStartId.split('-').map(Number);
    return new Date(year, month - 1, day - RECURRING_WINDOW_OFFSET_DAYS);
  }
  return todayKey === undefined ? new Date() : new Date(todayKey);
}

function planLabel(index: number): string {
  return `Plan ${index + 1}`;
}

export function RecurringDaysScreen({
  onBack,
  onContinue,
  today,
  initialPlans,
  initialActiveId,
  scheduledPlanIds,
  initialCapError = false,
  testID = 'recurring-days-screen',
}: RecurringDaysScreenProps) {
  // Android back does what the back arrow does, instead of leaving the whole flow.
  useAndroidBackHandler(() => {
    onBack();
    return true;
  });
  const planning = useRecurringPlanning();
  const { minDays, maxDays, unavailableDayIds, windowStartId } = planning;
  const todayKey = today?.getTime();
  const calendar = useMemo(
    () => buildRecurringWindow(windowOrigin(windowStartId, todayKey)),
    [windowStartId, todayKey],
  );
  const [plans, setPlans] = useState<readonly PlanDraft[]>(() =>
    initialPlans === undefined || initialPlans.length === 0
      ? [{ id: 'plan-1', days: new Set() }]
      : initialPlans.map((plan) => ({ id: plan.id, days: new Set(plan.dayIds) })),
  );
  const [activeId, setActiveId] = useState(
    () => initialActiveId ?? initialPlans?.at(-1)?.id ?? 'plan-1',
  );
  const [capError, setCapError] = useState(initialCapError);
  const capTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = plans.find((plan) => plan.id === activeId) ?? plans[0];
  const activeDays = active?.days ?? EMPTY;
  const locked = useMemo(() => {
    const ids = new Set<string>(unavailableDayIds);
    for (const plan of plans) {
      if (plan.id === activeId) continue;
      for (const id of plan.days) ids.add(id);
    }
    return ids;
  }, [plans, activeId, unavailableDayIds]);
  const total = plans.reduce((sum, plan) => sum + plan.days.size, 0);
  const firstToSchedule = Math.max(
    0,
    plans.findIndex((plan) => plan.days.size > 0 && scheduledPlanIds?.has(plan.id) !== true),
  );
  const complete = total >= minDays;
  const picked = calendar.orderedIds.filter((id) => activeDays.has(id));
  const startId = picked[0];
  const endId = picked.at(-1);

  const showCapError = useCallback(() => {
    setCapError(true);
    if (capTimer.current !== null) clearTimeout(capTimer.current);
    capTimer.current = setTimeout(() => setCapError(false), CAP_ERROR_MS);
  }, []);

  useEffect(
    () => () => {
      if (capTimer.current !== null) clearTimeout(capTimer.current);
    },
    [],
  );

  /**
   * Adds or removes one day in the active plan. A drag applies several in one burst, so the next
   * state is computed from refs kept in step with every change rather than from a state updater,
   * which React runs later. Returns null for a day another plan holds.
   */
  const plansRef = useRef(plans);
  const activeRef = useRef(activeId);
  // Kept in a ref like the plans, so `apply` stays stable for the grid's gesture.
  const limitsRef = useRef({ maxDays, unavailableDayIds });
  useEffect(() => {
    limitsRef.current = { maxDays, unavailableDayIds };
  }, [maxDays, unavailableDayIds]);
  const commit = useCallback((next: readonly PlanDraft[]) => {
    plansRef.current = next;
    setPlans(next);
  }, []);

  const apply = useCallback(
    (id: string, intent: SweepIntent): 'add' | 'remove' | null => {
      const all = plansRef.current;
      const current = all.find((plan) => plan.id === activeRef.current);
      if (current === undefined) return null;
      if (all.some((plan) => plan !== current && plan.days.has(id))) return null;
      if (limitsRef.current.unavailableDayIds.has(id) && !current.days.has(id)) return null;
      const mode = intent === 'toggle' ? (current.days.has(id) ? 'remove' : 'add') : intent;
      if (mode === 'remove') {
        if (!current.days.has(id)) return mode;
        const days = new Set(current.days);
        days.delete(id);
        commit(all.map((plan) => (plan === current ? { ...plan, days } : plan)));
        setCapError(false);
        return mode;
      }
      if (current.days.has(id)) return mode;
      if (all.reduce((sum, plan) => sum + plan.days.size, 0) >= limitsRef.current.maxDays) {
        showCapError();
        return mode;
      }
      const days = new Set(current.days);
      days.add(id);
      commit(all.map((plan) => (plan === current ? { ...plan, days } : plan)));
      return mode;
    },
    [commit, showCapError],
  );

  /** Whether the active plan holds a day right now, read live for a sweep in progress. */
  const isPicked = useCallback(
    (id: string) =>
      plansRef.current.find((plan) => plan.id === activeRef.current)?.days.has(id) ?? false,
    [],
  );

  const select = (id: string) => {
    activeRef.current = id;
    setActiveId(id);
  };

  const canAddPlan = plans.every((plan) => plan.days.size > 0);

  const addPlan = () => {
    if (plansRef.current.some((plan) => plan.days.size === 0)) return;
    // Ids never repeat, even after a plan is deleted on the Summary and the numbering closes up.
    const taken = new Set(plansRef.current.map((plan) => plan.id));
    let serial = plansRef.current.length + 1;
    while (taken.has(`plan-${serial}`)) serial += 1;
    const id = `plan-${serial}`;
    commit([...plansRef.current, { id, days: new Set() }]);
    select(id);
  };

  const continueWith = () => {
    if (!complete) return;
    onContinue?.(
      plans
        .map((plan, index) => ({
          id: plan.id,
          label: planLabel(index),
          dayIds: calendar.orderedIds.filter((id) => plan.days.has(id)),
        }))
        .filter((plan) => plan.dayIds.length > 0),
    );
  };

  return (
    <Screen
      tone="plain"
      padded={false}
      testID={testID}
      header={
        <ScreenHeader
          density="nav"
          title="Pick your days"
          onBack={onBack}
          testID={`${testID}-header`}
        />
      }
      footer={
        <RecurringFooter
          label={
            complete
              ? `Schedule ${planLabel(firstToSchedule)}`
              : `Pick ${minDays - total} more day${minDays - total === 1 ? '' : 's'}`
          }
          onPress={continueWith}
          disabled={!complete}
          testID={`${testID}-continue`}
        />
      }
    >
      <View style={styles.content}>
        <PlanHeader
          plans={plans.map((plan, index) => ({
            id: plan.id,
            label: planLabel(index),
            dayCount: plan.days.size,
          }))}
          activeId={activeId}
          onSelect={select}
          onAdd={addPlan}
          addDisabled={!canAddPlan}
          testID={`${testID}-plans`}
        />

        <View style={styles.calendar}>
          <View style={styles.weekdays}>
            {WEEKDAY_LABELS.map((label) => (
              <View key={label} style={[styles.column, styles.weekday]}>
                <Text variant="bodyLargeStrong" color="textPrimary" align="center">
                  {label}
                </Text>
              </View>
            ))}
          </View>

          <DayGrid
            rows={calendar.rows}
            selected={activeDays}
            locked={locked}
            startId={startId}
            endId={endId}
            onApply={apply}
            isPicked={isPicked}
          />
        </View>

        <DaysLegend />

        {capError ? (
          <View
            style={styles.error}
            accessibilityLiveRegion="polite"
            testID={`${testID}-cap-error`}
          >
            <View style={styles.errorDot}>
              <Text variant="captionBold" color="textInverse" style={styles.errorMark}>
                !
              </Text>
            </View>
            <Text variant="captionError" color="textError">
              Max {maxDays} days reached, deselect a day to pick another
            </Text>
          </View>
        ) : null}

        <HelpFab />
      </View>
    </Screen>
  );
}

const EMPTY: ReadonlySet<string> = new Set();

interface DayGridProps {
  readonly rows: ReturnType<typeof buildRecurringWindow>['rows'];
  /** The active plan's days. */
  readonly selected: ReadonlySet<string>;
  /** Days another plan holds: greyed out and not pickable. */
  readonly locked: ReadonlySet<string>;
  readonly startId: string | undefined;
  readonly endId: string | undefined;
  /**
   * `toggle` for the first day of a sweep — the screen decides from its live selection whether
   * that makes it an add or a remove sweep, and returns which — then that mode for every day after.
   */
  readonly onApply: (id: string, intent: SweepIntent) => 'add' | 'remove' | null;
  /** Whether the active plan holds a day at this moment (not as of the last render). */
  readonly isPicked: (id: string) => boolean;
}

type SweepIntent = 'add' | 'remove' | 'toggle';

/**
 * The date rows, with tap and drag selection.
 *
 * One pan gesture owns the whole grid. The first day touched is the sweep's anchor and decides
 * it: an unpicked day starts an add sweep, a picked one a remove sweep. From then on every day
 * BETWEEN the anchor and the finger, in date order, gets that treatment, so a drag down a column
 * takes in the whole weeks in between rather than one weekday (owner, 2026-10-16). Sliding back
 * shrinks the range and hands the days it leaves back their state from before the sweep. Days
 * another plan holds or the server greys out are skipped; with the 14-day cap, the days nearest
 * the anchor fill first. A tap is the same gesture with no movement.
 */
function DayGrid({ rows, selected, locked, startId, endId, onApply, isPicked }: DayGridProps) {
  // Lazily created and stable for the component's life — the same pattern `BottomSheet` uses for
  // its `Animated.Value` — so the gesture can track a sweep without reading a ref during render.
  const [tracker] = useState(() => new SweepTracker());

  // Built once per grid, not per render: a sweep's first day re-renders the screen, and handing
  // the detector a new gesture mid-sweep can reset the one in progress. Everything it reads —
  // the tracker, the rows, `onApply` and `isPicked` — is stable across renders.
  const sweep = useMemo(() => {
    const order = rows.flatMap((row) => row.days.filter((day) => day !== null).map((d) => d.id));
    const visit = (x: number, y: number) => {
      const id = tracker.dayAt(x, y, rows);
      if (id !== null) tracker.sweepTo(order.indexOf(id), order, onApply, isPicked);
    };
    // `minDistance(0)`: a tap is a pan that never moves, so taps and sweeps share one path.
    return Gesture.Pan()
      .minDistance(0)
      .runOnJS(true)
      .onBegin((event) => {
        tracker.reset();
        visit(event.x, event.y);
      })
      .onUpdate((event) => visit(event.x, event.y))
      .onFinalize(() => tracker.reset());
  }, [tracker, rows, onApply, isPicked]);

  return (
    <GestureDetector gesture={sweep}>
      <View
        style={styles.grid}
        onLayout={(event) => tracker.setWidth(event.nativeEvent.layout.width)}
      >
        {rows.map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} style={styles.row}>
            <View style={styles.days}>
              {row.days.map((day, column) =>
                day === null ? (
                  <View key={`empty-${rowIndex}-${column}`} style={styles.column} />
                ) : (
                  <DayCell
                    key={day.id}
                    day={day}
                    selected={selected.has(day.id)}
                    locked={locked.has(day.id)}
                    edge={day.id === startId || day.id === endId}
                    onToggle={() => onApply(day.id, 'toggle')}
                  />
                ),
              )}
            </View>
            <Text variant="bodyLargeStrong" color="textPrimary" align="center" style={styles.month}>
              {row.monthLabel}
            </Text>
          </View>
        ))}
      </View>
    </GestureDetector>
  );
}

/**
 * One sweep across the grid: its anchor (the first day, as an index in date order), whether it
 * adds or removes, the day the finger was last over, and the days this sweep actually changed, so
 * shrinking the range can hand exactly those back.
 */
export class SweepTracker {
  private width = 0;
  private session: {
    readonly anchor: number;
    readonly mode: 'add' | 'remove';
    last: number;
    readonly changed: Set<string>;
  } | null = null;

  setWidth(width: number): void {
    this.width = width;
  }

  reset(): void {
    this.session = null;
  }

  /**
   * The finger is over the day at `index` (date order). The first call anchors the sweep and
   * toggles that day; later ones hand back days the range has left, then apply the sweep's mode
   * from the anchor out to `index`, nearest first so the cap keeps the days closest to it.
   */
  sweepTo(
    index: number,
    order: readonly string[],
    apply: DayGridProps['onApply'],
    isPicked: DayGridProps['isPicked'],
  ): void {
    const id = order[index];
    if (id === undefined) return;
    if (this.session === null) {
      const before = isPicked(id);
      const mode = apply(id, 'toggle');
      if (mode === null) return;
      this.session = {
        anchor: index,
        mode,
        last: index,
        changed: new Set(isPicked(id) !== before ? [id] : []),
      };
      return;
    }
    const session = this.session;
    if (index === session.last) return;
    session.last = index;
    const low = Math.min(session.anchor, index);
    const high = Math.max(session.anchor, index);
    const undo = session.mode === 'add' ? 'remove' : 'add';
    for (const changed of [...session.changed]) {
      const at = order.indexOf(changed);
      if (at >= low && at <= high) continue;
      apply(changed, undo);
      session.changed.delete(changed);
    }
    const step = index >= session.anchor ? 1 : -1;
    for (let at = session.anchor; at !== index + step; at += step) {
      const dayId = order[at];
      if (dayId === undefined || session.changed.has(dayId)) continue;
      const before = isPicked(dayId);
      if (before === (session.mode === 'add')) continue;
      apply(dayId, session.mode);
      if (isPicked(dayId) !== before) session.changed.add(dayId);
    }
  }

  /** The day under a grid-relative point, or null for a gap, the month column or outside. */
  dayAt(x: number, y: number, rows: DayGridProps['rows']): string | null {
    if (this.width === 0) return null;
    // Seven date columns `CELL_GAP` apart across the width the month column leaves free, so a
    // date column and its gap step by one column's width plus `CELL_GAP`.
    const pitch =
      (this.width - DATES_INSET_RIGHT - (DAY_COLUMNS - 1) * CELL_GAP) / DAY_COLUMNS + CELL_GAP;
    const column = Math.floor(x / pitch);
    const row = Math.floor(y / (ROW_HEIGHT + CELL_GAP));
    if (column < 0 || column >= DAY_COLUMNS || row < 0) return null;
    return rows[row]?.days[column]?.id ?? null;
  }
}

interface DayCellProps {
  readonly day: RecurringWindowDay;
  readonly selected: boolean;
  /** Held by another plan (`340:6559`): a faint disc under faint ink. */
  readonly locked: boolean;
  /** The earliest or latest picked day: brand fill rather than tint. */
  readonly edge: boolean;
  /** Screen-reader activation; touch goes through the grid's responder. */
  readonly onToggle: () => void;
}

function DayCell({ day, selected, locked, edge, onToggle }: DayCellProps) {
  return (
    <View
      style={styles.column}
      accessible
      accessibilityRole="button"
      accessibilityLabel={day.label}
      accessibilityState={{ selected, disabled: locked }}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={onToggle}
      testID={`recurring-day-${day.id}`}
    >
      {/*
       * Never flattened: an unpicked disc has no background, so Android's renderer folded it into
       * its column, and the view rebuilt when a pick gave it a fill came back without its radius.
       * Picked days drew as squares on the vivo I2302 (owner, 2026-10-16).
       */}
      <View
        collapsable={false}
        style={[
          styles.disc,
          locked
            ? styles.discLocked
            : selected
              ? edge
                ? styles.discEdge
                : styles.discPicked
              : null,
        ]}
      >
        <Text
          variant="bodyLarge"
          color={locked ? 'textDisabledSoft' : 'textPrimary'}
          align="center"
        >
          {day.dayOfMonth}
        </Text>
      </View>
    </View>
  );
}

/**
 * `Calendar/Variant2` (`1047:6167`, 370 × 255): a 40pt weekday row, then the date rows. The seven
 * date columns share the width the month column leaves free — `1047:6170` stops 41.88 short of the
 * right edge — and sit 5 apart; the month sits in its own 41.875pt column at `left: 323`
 * (`1047:6213`), which is 5.125 short of the edge and tucks 5pt under the last date column.
 */
const DAY_COLUMNS = 7;
const CELL_GAP = 5;
const DATES_INSET_RIGHT = 41.875;
const MONTH_WIDTH = 41.875;
const MONTH_RIGHT = 5.125;
/** `1047:6222` — the weekday row is a 20pt line with py 10 either side. */
const WEEKDAY_HEIGHT = 40;
/** `1047:6170` — each date row is 39 tall, 5 apart. */
const ROW_HEIGHT = 39;
/**
 * `1047:6170` — the grid always holds five rows (215): a 21-day window split at a month change can
 * need five, and keeping the room means nothing below the calendar moves when it does.
 */
const MAX_ROWS = 5;
/**
 * `334:6411` — the 32pt selection disc, 4 below the row top so the number sits 10 down. (`340:6550`
 * draws the same discs 8 lower; that frame's loose layers are the ones out of line, since
 * `334:6406`, the older `149:1807` and the numeral's own 10pt padding all agree on 4.)
 */
const DISC = 32;
const DISC_TOP = 4;

const styles = StyleSheet.create({
  /** `340:6553` — p 16 all round, 24 between the plan header, the calendar, the legend and the error. */
  content: { flex: 1, padding: lightTheme.space.lg, gap: lightTheme.space.xl },
  /** `1047:6167` — the weekday row, then the date rows straight under it. */
  calendar: {},
  weekdays: { flexDirection: 'row', marginRight: DATES_INSET_RIGHT, gap: CELL_GAP },
  grid: { gap: CELL_GAP, minHeight: MAX_ROWS * ROW_HEIGHT + (MAX_ROWS - 1) * CELL_GAP },
  row: { flexDirection: 'row' },
  /** `1047:6170` — the seven date columns and their six gaps, short of the month column. */
  days: { flex: 1, flexDirection: 'row', gap: CELL_GAP, marginRight: DATES_INSET_RIGHT },
  column: { flex: 1, alignItems: 'center' },
  weekday: { height: WEEKDAY_HEIGHT, justifyContent: 'center' },
  /** `1047:6213` — the month sits on the dates' text line: 10 down a 39 row. */
  month: {
    position: 'absolute',
    right: MONTH_RIGHT,
    width: MONTH_WIDTH,
    height: ROW_HEIGHT,
    paddingTop: 10,
  },
  disc: {
    width: DISC,
    height: DISC,
    marginTop: DISC_TOP,
    marginBottom: ROW_HEIGHT - DISC - DISC_TOP,
    borderRadius: DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discPicked: { backgroundColor: lightTheme.colors.surfaceBrandTint },
  discEdge: { backgroundColor: lightTheme.colors.surfaceBrand },
  discLocked: { backgroundColor: lightTheme.colors.surfaceDisabledSoft },
  /** `158:1588` — a 16pt dot and the copy, 6 apart, centred. */
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: lightTheme.space.s6,
  },
  /** `158:1586` — a 16pt `#E53935` circle with a white Bold 11 "!" centred in it. */
  errorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: lightTheme.colors.surfaceError,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorMark: { fontSize: 11, lineHeight: 16 },
});
