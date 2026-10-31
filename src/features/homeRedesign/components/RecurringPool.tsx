import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ART } from '../assets';
import type { RecurringChip } from '../state/recurring';
import type { PoolCook } from '../types';
import { C, F, SHADOW_PILL } from '../theme';

export interface RecurringPoolProps {
  /** Real cooks only (`poolBeads`) — never placeholder faces. */
  readonly beads: readonly PoolCook[];
  readonly chip: RecurringChip;
  readonly onPressChip: () => void;
  readonly onPressCookPool: () => void;
  readonly onPressCook: (cook: PoolCook) => void;
}

/**
 * `Pool → Recurring/active` (`1256:1011` / `1290:1780`) — a 283pt block: the static headline, a
 * decorative thread looping through the cook beads, the recurring chip and "My Cook Pool".
 * Beads scroll sideways; the cut-off at the screen edge says there are more.
 */
export function RecurringPool({
  beads,
  chip,
  onPressChip,
  onPressCookPool,
  onPressCook,
}: RecurringPoolProps) {
  const [rowWidth, setRowWidth] = useState(0);
  const [chipWidth, setChipWidth] = useState(0);
  const headline = headlineFit(rowWidth, chipWidth);
  return (
    <View style={styles.section}>
      <Image source={ART.thread} style={styles.thread} resizeMode="stretch" />

      <View style={styles.header} onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}>
        <Text
          style={[
            styles.title,
            { width: headline.width, fontSize: headline.fontSize, lineHeight: headline.lineHeight },
          ]}
        >
          Book for multiple days at once!
        </Text>

        <Pressable
          onLayout={(event) => setChipWidth(event.nativeEvent.layout.width)}
          accessibilityRole="button"
          onPress={onPressChip}
          style={[
            styles.pill,
            styles.recurring,
            chip.tone === 'outline' ? styles.recurringOutline : null,
            SHADOW_PILL,
          ]}
        >
          <Image source={ART.restart} style={styles.pillIcon} />
          <Text style={styles.pillLabel}>{chip.label}</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.beads}
        contentContainerStyle={styles.beadsContent}
      >
        {beads.map((cook) =>
          cook.photo === null ? null : (
            <Pressable
              key={cook.id}
              accessibilityRole="button"
              accessibilityLabel={cook.name}
              onPress={() => onPressCook(cook)}
              style={styles.bead}
            >
              <Image source={cook.photo} style={styles.beadImage} resizeMode="contain" />
            </Pressable>
          ),
        )}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        onPress={onPressCookPool}
        style={[styles.pill, styles.pool, SHADOW_PILL]}
      >
        <Image source={ART.cookVisit} style={styles.pillIcon} />
        <Text style={styles.pillLabel}>My Cook Pool</Text>
      </Pressable>
    </View>
  );
}

/** `1256:1012` — the headline: 180pt wide, Bold 24/32, three lines. */
const TITLE_WIDTH = 180;
const TITLE_SIZE = 24;
const TITLE_LINE = 32;
/** Figma's 4pt between the headline and the chip (x 196 → 200). */
const TITLE_GAP = 4;

/**
 * The headline beside the chip, as Figma draws it, on any width (device test, 31 Oct 2026).
 *
 * Figma's row is 180 + 4 + the chip, about 370pt; a 360dp phone (the S21) has 328 inside its
 * gutters, and the chip was drawn over "days". The chip keeps its size and its place on the right;
 * the headline takes what is left beside it and its type scales by the same ratio, so it breaks
 * into Figma's three lines ("Book for / multiple days / at once!"), smaller. Where Figma's row fits
 * it is Figma's exactly.
 */
function headlineFit(rowWidth: number, chipWidth: number) {
  const room = rowWidth === 0 || chipWidth === 0 ? TITLE_WIDTH : rowWidth - chipWidth - TITLE_GAP;
  const scale = Math.max(0.7, Math.min(1, room / TITLE_WIDTH));
  return {
    width: Math.min(TITLE_WIDTH, room),
    fontSize: Math.round(TITLE_SIZE * scale * 10) / 10,
    lineHeight: Math.round(TITLE_LINE * scale * 10) / 10,
  };
}

const styles = StyleSheet.create({
  section: { height: 283, width: '100%', paddingHorizontal: 16, overflow: 'hidden' },
  /** `1256:1013` — 432 × 199 at (−14, 45), its image inset −1.51 % top and bottom. */
  thread: { position: 'absolute', left: -14, top: 45 - 3, width: 432, height: 205 },
  /** `1256:1011` — the headline and, centred on it, the chip on the right (`headlineFit`). */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: F.bold,
    fontSize: TITLE_SIZE,
    lineHeight: TITLE_LINE,
    color: C.text,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 20,
    paddingVertical: 10,
    borderRadius: 999,
  },
  /**
   * `1257:1016` sits at x 200, 186 wide — i.e. 16 from the right edge, in the header row above.
   * A longer label ("Check Recurring", "Recurring · Live") takes room from the headline, whose type
   * then scales down (`headlineFit`), instead of running off-screen or over it.
   */
  recurring: { flexShrink: 0, backgroundColor: C.lime },
  /** `1290:1183` — 'Check Recurring': white with a 1pt `#FFD600` hairline. */
  recurringOutline: { backgroundColor: C.base, borderWidth: 1, borderColor: C.brand },
  pool: { position: 'absolute', left: 14, top: 222, backgroundColor: C.brand },
  pillIcon: { width: 24, height: 24 },
  pillLabel: { fontFamily: F.bold, fontSize: 16, lineHeight: 24, color: C.text },
  beads: { position: 'absolute', left: 0, right: 0, top: 134, height: 56 },
  beadsContent: { gap: 12, paddingLeft: 14, paddingRight: 14 },
  /** `1260:27818` — a 56pt `#FFF7CC` disc; the photo is `object-contain`, never cropped. */
  bead: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.softer, overflow: 'hidden' },
  beadImage: { width: 56, height: 56 },
});
