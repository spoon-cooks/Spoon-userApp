import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@ui';
import { lightTheme } from '@ui/theme/ThemeProvider';

import { visitDemoModel } from '../../data/visit';
import type { VisitPendingData } from '../../data/visit';
import { VISIT_BELL_PENDING } from './assets';

/**
 * `Cook details` · Cook pending — Figma `2165:13862` (component `1466:797`).
 *
 * Flat on the page — no card — with 16 between blocks: the 20pt bell note, the "FROM YOUR COOK
 * POOL" heading (Micro Strong over Title, 4 apart) and the full-width 44pt "View Cook Pool" pill.
 */
export interface CookPendingCardProps {
  /** Defaults to the frame's. */
  readonly pending?: VisitPendingData;
  readonly onViewPool?: (() => void) | undefined;
  readonly testID?: string | undefined;
}

const DEMO = visitDemoModel('pending');

export function CookPendingCard({
  pending = DEMO.pending,
  onViewPool,
  testID = 'visit-cook-pending',
}: CookPendingCardProps) {
  return (
    <View style={styles.section} testID={testID}>
      <View style={styles.note}>
        <Image source={VISIT_BELL_PENDING} style={styles.bell} />
        <Text variant="spoonCaption" color="textSecondarySoft" style={styles.flex}>
          {pending.note}
        </Text>
      </View>

      <View style={styles.heading}>
        <Text variant="spoonMicroStrong" color="textSecondarySoft">
          {pending.eyebrow}
        </Text>
        <Text variant="spoonTitle" color="textPrimary">
          {pending.title}
        </Text>
      </View>

      <Pressable
        onPress={onViewPool}
        accessibilityRole="button"
        style={styles.cta}
        testID={`${testID}-view-pool`}
      >
        {/* One line, `simple` breaking: Android measured it a hair narrow and wrapped "Pool". */}
        <Text
          variant="spoonButton"
          color="textPrimary"
          numberOfLines={1}
          textBreakStrategy="simple"
        >
          {pending.cta}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: lightTheme.space.lg },
  flex: { flex: 1 },
  /** `1466:699` — bell and note, 8 apart. */
  note: { flexDirection: 'row', alignItems: 'center', gap: lightTheme.space.sm },
  bell: { width: 20, height: 20 },
  heading: { gap: lightTheme.space.xs },
  /** `1466:722` — 44 tall, `#FFEF99`, pill. */
  cta: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: lightTheme.space.lg,
    borderRadius: lightTheme.radius.pill,
    backgroundColor: lightTheme.colors.surfaceAccentStrong,
  },
});
