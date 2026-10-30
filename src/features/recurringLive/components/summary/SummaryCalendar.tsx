import { Image, Pressable, StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';

import { Text } from '@ui';
import { lightTheme } from '@ui/theme/ThemeProvider';
import type { TypographyToken } from '@ui/tokens/semantic';

import type { SummaryCalendar as SummaryCalendarData, SummaryDateMark } from '../../data/summary';
import { SUMMARY_EDIT_GLYPH } from './assets';

/**
 * `Selected days` — Figma `1067:2171`: the "Plan N selected dates" heading (Spoon/Heading) with a
 * 48pt edit hit area hanging 12pt past the frame's top-right, over `Calendar/summary` (`1067:2179`,
 * 370 × 255, 8 below the heading).
 *
 * The calendar is a weekday header (40pt rows: py 10 around a 20pt line), then date rows every 44pt
 * on a 7-column grid with 5pt gutters, and a 41.875pt month column at x 323 naming each row's month.
 * Marked dates sit on a 32 × 31 disc 4pt into their cell: the plan's first and last dates on
 * `#FFD600`, the others on `#FFE666`; marked numerals are black, the rest 60 %.
 */
export interface SummaryCalendarProps {
  readonly calendar: SummaryCalendarData;
  readonly onEdit?: (() => void) | undefined;
  readonly testID?: string;
}

/** The Live booking circles (`VisitsCalendar`), as dev notes `2621:3563`… ask: Past filled pale,
 * Today solid yellow, Upcoming a 1.5pt ring with no fill. */
const MARK_STYLE: Record<SummaryDateMark, ViewStyle> = {
  past: { backgroundColor: lightTheme.colors.surfaceAccent },
  today: { backgroundColor: lightTheme.colors.surfaceCta },
  upcoming: { borderWidth: 1.5, borderColor: lightTheme.colors.borderNotice },
};

/** Marked dates read SemiBold except past ones, as on Live booking. */
const MARK_LABEL: Record<SummaryDateMark, TypographyToken> = {
  past: 'spoonBody',
  today: 'spoonBodyStrong',
  upcoming: 'spoonBodyStrong',
};

export function SummaryCalendar({
  calendar,
  onEdit,
  testID = 'summary-calendar',
}: SummaryCalendarProps) {
  return (
    <View style={styles.section} testID={testID}>
      <Text variant="spoonHeading" color="textPrimary">
        {calendar.title}
      </Text>
      {onEdit === undefined ? null : (
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel="Edit selected dates"
          style={styles.editHitArea}
          testID={`${testID}-edit`}
        >
          <View style={styles.editClip}>
            <Image source={SUMMARY_EDIT_GLYPH} style={styles.editGlyph} />
          </View>
        </Pressable>
      )}

      {/* Exactly as tall as its rows: a fixed 255pt box let a sixth row spill over the photo
          tiles and left empty space under a short plan (owner, 2026-10-17). */}
      <View style={[styles.calendar, { height: CELL_HEIGHT + calendar.rows.length * ROW_PITCH }]}>
        <View style={styles.grid}>
          <View style={styles.row}>
            {calendar.weekdays.map((weekday) => (
              <View key={weekday} style={styles.cell}>
                <Text variant="spoonBodyStrong" color="textPrimary">
                  {weekday}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.dates}>
            {calendar.rows.map((row) => (
              <View key={row.id} style={styles.row}>
                {row.cells.map((cell, index) => (
                  <View key={`${row.id}-${index}`} style={styles.cell}>
                    {cell?.mark === undefined ? null : (
                      <View style={[styles.mark, MARK_STYLE[cell.mark]]} />
                    )}
                    {cell === null ? null : (
                      <Text
                        variant={cell.mark === undefined ? 'spoonBody' : MARK_LABEL[cell.mark]}
                        color={cell.mark === undefined ? 'textSecondarySoft' : 'textPrimary'}
                      >
                        {cell.day}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>

        <View style={styles.months}>
          {calendar.rows.map((row) => (
            <View key={row.id} style={styles.cell}>
              <Text variant="spoonBodyStrong" color="textPrimary">
                {row.month}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const CELL_HEIGHT = 40;
/** `1047:6011` / `1047:6054` — date rows and month rows both repeat every 44pt. */
const ROW_GAP = 4;
const ROW_PITCH = CELL_HEIGHT + ROW_GAP;

const styles = StyleSheet.create({
  section: { gap: lightTheme.space.sm, backgroundColor: lightTheme.colors.surface },
  /** `1067:2177` — 48 × 48 at x 334, y −12: the 24pt glyph lines up with the heading. */
  editHitArea: {
    position: 'absolute',
    top: -lightTheme.space.md,
    right: -lightTheme.space.md,
    width: lightTheme.space.xxxl,
    height: lightTheme.space.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** `1067:2178` — a 24pt clip with `Edit_light` placed 1pt high inside it. */
  editClip: { width: 24, height: 24, overflow: 'hidden', borderRadius: lightTheme.radius.pill },
  editGlyph: { position: 'absolute', top: -1, left: 0, width: 24, height: 24 },
  /** `1067:2179` — 370 × 255 at the design width; it takes the column's width elsewhere. */
  calendar: { width: '100%' },
  /** The 7-column grid stops 41.88pt short of the right edge (`1047:6011`). */
  grid: { position: 'absolute', top: 0, left: 0, right: 41.88 },
  dates: { gap: ROW_GAP },
  row: { flexDirection: 'row', gap: 5 },
  cell: { flex: 1, height: CELL_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  /** `1067:2172`–`2175` — 32 × 31, 4pt below the cell's top. */
  mark: {
    position: 'absolute',
    top: 4,
    left: '50%',
    marginLeft: -16,
    width: 32,
    height: 31,
    borderRadius: lightTheme.radius.pill,
  },
  /** `1047:6054` — x 323 of 370 (5.125 from the right), from the first date row down. */
  months: {
    position: 'absolute',
    top: CELL_HEIGHT,
    right: 5.125,
    width: 41.875,
    gap: ROW_GAP,
  },
});
