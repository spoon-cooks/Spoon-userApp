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
  return (
    <View style={styles.section}>
      <Image source={ART.thread} style={styles.thread} resizeMode="stretch" />

      <View style={styles.header}>
        <Text style={styles.title}>Book for multiple days at once!</Text>

        <Pressable
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

const styles = StyleSheet.create({
  section: { height: 283, width: '100%', paddingHorizontal: 16, overflow: 'hidden' },
  /** `1256:1013` — 432 × 199 at (−14, 45), its image inset −1.51 % top and bottom. */
  thread: { position: 'absolute', left: -14, top: 45 - 3, width: 432, height: 205 },
  /**
   * The headline and the recurring chip share one row that wraps (device test, 31 Oct 2026). Figma
   * draws a 180pt headline with the chip 16 from the right, which on a 360dp phone (the S21) put
   * the chip over "days". Now the headline needs at least 170pt beside the chip (Figma's 4pt gap,
   * so a 393pt iPhone still fits): where it has that, the row reads as Figma (chip on the right,
   * centred on the headline, ~23pt down); where it does not, the headline takes the full width
   * (two lines) and the chip sits below it, still above the beads at 134.
   */
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 4,
    rowGap: 8,
  },
  title: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 170,
    maxWidth: '100%',
    fontFamily: F.bold,
    fontSize: 24,
    lineHeight: 32,
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
   * A longer label ("Check Recurring", "Recurring · Live") takes room from the headline, or moves
   * the chip under it, instead of running off-screen.
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
