import { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { Text } from '@ui';
import { lightTheme } from '@ui/theme/ThemeProvider';

import { EDIT_ICON } from '../art';
import {
  RECURRING_WINDOW_OFFSET_DAYS,
  WEEKDAY_LABELS,
  buildRecurringWindow,
  selectedDayLabel,
} from '../data';
import type { RecurringWindow, RecurringWindowDay } from '../types';

/**
 * "Selected days" on the Summary — Figma `1079:3207` (view) and `494:1039` (edit), the
 * `Calendar/summary` component (`1079:3220`, 370 × 255).
 *
 * A title ("Plan 2 selected dates") with the pencil at its right, then the plan's 21-day window as
 * a month calendar: a Monday-first weekday row, the date rows (39 tall, 5 apart, the way Step 1
 * draws them) and, down the right, the month each row belongs to. The visit's dates sit on 32pt
 * discs — the first and the last date on brand gold, those between on the tint.
 *
 * Edit mode (`494:1039`, the note on `513:1288`): the pencil sits on a gold disc, the discs become
 * buttons that jiggle in step (`1054:202`, "Calendar/Selected date": ±10° every 0.1 s at 112 %),
 * and tapping one reports that date. One date is edited at a time, so the screen leaves edit mode
 * on the tap.
 */
export interface SummaryCalendarProps {
  /** The dates the calendar is drawn over — see `summaryWindow`. */
  readonly range: RecurringWindow;
  /** The visit's dates: highlighted, and the only ones a tap reaches in edit mode. */
  readonly selectedIds: readonly string[];
  /** "Plan 2 selected dates". */
  readonly title: string;
  /** Shows the pencil in its 48pt hit area (`1079:3218`). */
  readonly onEdit?: (() => void) | undefined;
  /** Edit mode: the discs are buttons that report the date tapped. */
  readonly onPickDay?: ((dayId: string) => void) | undefined;
  readonly testID?: string;
}

/**
 * The window the Summary draws: the server's (`windowStartId`) when it has answered, else the one
 * counted from `today` — the same rule as Step 1, so the calendar matches the one the dates were
 * picked on. A plan whose dates have since fallen out of that window (the clock moved on) is drawn
 * over a window opening on its earliest date instead, so no picked date goes missing.
 */
export function summaryWindow(
  planDayIds: readonly string[],
  windowStartId: string | null,
  today: Date = new Date(),
): RecurringWindow {
  const originOf = (startId: string): Date => {
    const [year = 0, month = 1, day = 1] = startId.split('-').map(Number);
    return new Date(year, month - 1, day - RECURRING_WINDOW_OFFSET_DAYS);
  };
  const range = buildRecurringWindow(windowStartId === null ? today : originOf(windowStartId));
  const known = new Set(range.orderedIds);
  if (planDayIds.every((id) => known.has(id))) return range;
  const earliest = [...planDayIds].sort()[0];
  return earliest === undefined ? range : buildRecurringWindow(originOf(earliest));
}

export function SummaryCalendar({
  range,
  selectedIds,
  title,
  onEdit,
  onPickDay,
  testID,
}: SummaryCalendarProps) {
  const editing = onPickDay !== undefined;
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const picked = range.orderedIds.filter((id) => selected.has(id));
  const startId = picked[0];
  const endId = picked.at(-1);
  const jiggle = useJiggle(editing);
  // Exactly the plan's rows: five fixed rows left empty space under a short plan (2026-10-17).
  const rows = range.rows.length;

  return (
    <View style={styles.section} testID={testID}>
      <Text variant="headingSection" color="textPrimary" accessibilityRole="header">
        {title}
      </Text>
      {onEdit === undefined ? null : (
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Stop editing dates' : 'Edit a date'}
          accessibilityState={{ selected: editing }}
          style={styles.edit}
          testID={testID === undefined ? undefined : `${testID}-edit`}
        >
          {/* `1079:3219` — the plain pencil, in edit mode too: no gold disc behind it (owner,
              2026-10-30, overriding `1051:2730`). */}
          <Image source={EDIT_ICON} style={styles.editIcon} />
        </Pressable>
      )}
      <View style={styles.calendar}>
        <View style={styles.weekdays}>
          {WEEKDAY_LABELS.map((label) => (
            <View key={label} style={styles.column}>
              <Text variant="bodyLargeStrong" color="textPrimary" align="center">
                {label}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.dates}>
          {Array.from({ length: rows }, (_, rowIndex) => {
            const row = range.rows[rowIndex];
            return (
              <View key={`row-${rowIndex}`} style={styles.row}>
                {Array.from({ length: COLUMNS }, (__, column) => {
                  const day = row?.days[column] ?? null;
                  return day === null ? (
                    <View key={`empty-${column}`} style={styles.column} />
                  ) : (
                    <DateCell
                      key={day.id}
                      day={day}
                      selected={selected.has(day.id)}
                      edge={day.id === startId || day.id === endId}
                      editing={editing}
                      jiggle={jiggle}
                      onPick={onPickDay === undefined ? undefined : () => onPickDay(day.id)}
                      testID={testID === undefined ? undefined : `${testID}-${day.id}`}
                    />
                  );
                })}
              </View>
            );
          })}
        </View>
        <View style={styles.months} pointerEvents="none">
          {range.rows.map((row, rowIndex) => (
            <View key={`month-${rowIndex}`} style={styles.month}>
              <Text variant="bodyLargeStrong" color="textPrimary" align="center">
                {row.monthLabel}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

interface DateCellProps {
  readonly day: RecurringWindowDay;
  readonly selected: boolean;
  /** The first or last date: brand gold rather than the tint. */
  readonly edge: boolean;
  readonly editing: boolean;
  readonly jiggle: Jiggle;
  readonly onPick: (() => void) | undefined;
  readonly testID: string | undefined;
}

function DateCell({ day, selected, edge, editing, jiggle, onPick, testID }: DateCellProps) {
  if (!selected) {
    return (
      <View style={styles.column}>
        <Text variant="bodyLarge" color="textSubdued" align="center" style={styles.number}>
          {day.dayOfMonth}
        </Text>
      </View>
    );
  }
  const fill = edge ? styles.discEdge : styles.discPicked;
  if (!editing) {
    return (
      <View
        style={styles.column}
        accessible
        accessibilityLabel={day.label}
        accessibilityState={{ selected: true }}
      >
        <View style={[styles.disc, fill]} />
        <Text variant="bodyLarge" color="textPrimary" align="center" style={styles.number}>
          {day.dayOfMonth}
        </Text>
      </View>
    );
  }
  const { weekday, day: date } = selectedDayLabel(day.id);
  return (
    <Pressable
      onPress={onPick}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${weekday} ${date}`}
      style={styles.column}
      testID={testID}
    >
      {/* `1054:197` / `1054:200` — a 32pt disc that jiggles with its number inside it. */}
      <Animated.View
        style={[
          styles.discEditing,
          fill,
          { transform: [{ rotate: jiggle.rotate }, { scale: jiggle.scale }] },
        ]}
      >
        <Text variant="bodyLarge" color="textPrimary" align="center">
          {day.dayOfMonth}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

interface Jiggle {
  readonly rotate: Animated.AnimatedInterpolation<string>;
  readonly scale: Animated.AnimatedInterpolation<number>;
}

/** One 0.2 s cycle: +10° at 0.05 s, −10° at 0.15 s (`1054:199`'s keyframes), sampled as a sine. */
const JIGGLE_CYCLE_MS = 200;
const JIGGLE_DEGREES = 10;
const JIGGLE_SCALE = 1.12;
const JIGGLE_POP_MS = 50;
const SAMPLES = 16;

/**
 * The discs' shared jiggle (`1054:202`): every selected date turns in step, so one pair of
 * interpolations drives them all. Held still under the system's reduce-motion setting, and while
 * not editing.
 */
function useJiggle(active: boolean): Jiggle {
  const [phase] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const running = active && !reduceMotion;
  useEffect(() => {
    if (!running) {
      phase.setValue(0);
      pop.setValue(0);
      return undefined;
    }
    const turning = Animated.loop(
      Animated.timing(phase, {
        toValue: 1,
        duration: JIGGLE_CYCLE_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const growing = Animated.timing(pop, {
      toValue: 1,
      duration: JIGGLE_POP_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    });
    turning.start();
    growing.start();
    return () => {
      turning.stop();
      growing.stop();
    };
  }, [running, phase, pop]);

  return useMemo(() => {
    const inputRange = Array.from({ length: SAMPLES + 1 }, (_, step) => step / SAMPLES);
    const outputRange = inputRange.map(
      (point) => `${(JIGGLE_DEGREES * Math.sin(2 * Math.PI * point)).toFixed(3)}deg`,
    );
    return {
      rotate: phase.interpolate({ inputRange, outputRange }),
      scale: pop.interpolate({ inputRange: [0, 1], outputRange: [1, JIGGLE_SCALE] }),
    };
  }, [phase, pop]);
}

const COLUMNS = 7;
const GAP = 5;
/** `I1079:3220;1047:6012` — a date row is 39 tall (the text sits 10 down), 5 apart. */
const ROW_HEIGHT = 39;
/** `I1079:3220;1047:6064` — the weekday row: 20 of text with py 10 around it. */
const WEEKDAY_HEIGHT = 40;
/** `I1079:3220;1047:6054` — the month column, 41.875 wide, 5.125 in from the calendar's right. */
const MONTH_WIDTH = 41.875;
const MONTH_RIGHT = 5.125;
const DISC = 32;

const styles = StyleSheet.create({
  /** `1079:3212` — 8 between the title and the calendar. */
  section: { gap: lightTheme.space.sm },
  /** `1079:3218` — a 48pt hit area 12 above the title's top and 12 past the content's right. */
  edit: {
    position: 'absolute',
    top: -12,
    right: -12,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editIcon: { width: 24, height: 24 },
  /** `1079:3220` — the weekday row (40), then the dates; the months stand at the right. */
  calendar: { position: 'relative' },
  /** The seven columns end 41.875 short of the right edge, where the months begin. */
  weekdays: {
    flexDirection: 'row',
    gap: GAP,
    marginRight: MONTH_WIDTH,
    height: WEEKDAY_HEIGHT,
    alignItems: 'center',
  },
  dates: { gap: GAP, marginRight: MONTH_WIDTH },
  row: { flexDirection: 'row', gap: GAP, height: ROW_HEIGHT },
  column: { flex: 1, alignItems: 'center' },
  /** `I1079:3220;1047:6012` — the number sits 10 down its row. */
  number: { marginTop: 10 },
  /** `1079:3213` — a 32 × 31 disc 4 below the row's top. */
  disc: {
    position: 'absolute',
    top: 4,
    width: DISC,
    height: 31,
    borderRadius: DISC / 2,
  },
  /** `1051:2732` — the editing disc is 32 × 32, 3.5 down (the same centre). */
  discEditing: {
    marginTop: 3.5,
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discPicked: { backgroundColor: lightTheme.colors.surfaceBrandTint },
  discEdge: { backgroundColor: lightTheme.colors.surfaceBrand },
  /** `I1079:3220;1047:6054` — one 40 tall row per date row, 4 apart, level with the dates. */
  months: {
    position: 'absolute',
    top: WEEKDAY_HEIGHT,
    right: MONTH_RIGHT,
    width: MONTH_WIDTH,
    gap: 4,
  },
  month: { height: 40, paddingVertical: 10, alignItems: 'center' },
});
