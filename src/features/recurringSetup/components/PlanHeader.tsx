import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@ui';
import { lightTheme } from '@ui/theme/ThemeProvider';
import { innerShadows } from '@ui/tokens/primitives';
import { radialBackground } from '@ui/tokens/semantic';

import { PLUS_ICON } from '../art';

/**
 * Step 1's Plan header — Figma `cCQlzTeiObQkpVBzwI8mZi`: `1366:2936` (Plan 1 alone, `340:6661`),
 * `1366:2925` (Plan 1 and "+", `334:6406`) and `1366:2913` (two plans and "+", `340:6550`).
 *
 * A 56pt row, 12 apart, of Plan tiles and then the "+" that starts the next plan, the full 370pt
 * of the content box. Tiles share the row; once they no longer fit at a readable width the row
 * scrolls, since the frame's note puts no cap on the number of plans.
 *
 * The selected tile is a radial `#FFEF99` → `#FFD600` glow under Bold 16 / SemiBold 12 copy with
 * `Elevation/1`; an unselected one is a white → `#FFF7CC` radial under SemiBold 14 / Regular 12,
 * unlifted. The "+" is a white → `#FFE666` radial. None of them has an edge or an inner shadow.
 */
export interface PlanHeaderPlan {
  readonly id: string;
  readonly label: string;
  readonly dayCount: number;
}

export interface PlanHeaderProps {
  readonly plans: readonly PlanHeaderPlan[];
  readonly activeId: string;
  readonly onSelect: (id: string) => void;
  /** Omit to hide the "+". Step 1 always shows it: there is no cap on plans. */
  readonly onAdd?: (() => void) | undefined;
  /**
   * Shows the "+" but refuses it — while a plan has no day yet, another can't be started. Drawn
   * at 40 % so it reads as unavailable rather than missing.
   */
  readonly addDisabled?: boolean;
  readonly testID: string;
}

export function PlanHeader({
  plans,
  activeId,
  onSelect,
  onAdd,
  addDisabled = false,
  testID,
}: PlanHeaderProps) {
  return (
    <View style={styles.header} testID={testID}>
      <ScrollView
        horizontal
        scrollEnabled={plans.length > 2}
        showsHorizontalScrollIndicator={false}
        style={styles.tiles}
        contentContainerStyle={styles.tilesContent}
      >
        {plans.map((plan) => (
          <PlanTile
            key={plan.id}
            plan={plan}
            active={plan.id === activeId}
            onPress={() => onSelect(plan.id)}
            testID={`${testID}-${plan.id}`}
          />
        ))}
      </ScrollView>
      {onAdd === undefined ? null : (
        <AddButton onPress={onAdd} disabled={addDisabled} testID={`${testID}-add`} />
      )}
    </View>
  );
}

interface PlanTileProps {
  readonly plan: PlanHeaderPlan;
  readonly active: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}

function PlanTile({ plan, active, onPress, testID }: PlanTileProps) {
  const caption = `${plan.dayCount} day${plan.dayCount === 1 ? '' : 's'}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={`${plan.label}, ${caption}`}
      accessibilityState={{ selected: active }}
      style={[
        styles.tile,
        {
          experimental_backgroundImage: radialBackground(
            active ? lightTheme.gradients.planHeaderActive : lightTheme.gradients.planHeaderIdle,
          ),
        },
        active ? styles.tileLift : null,
      ]}
      testID={testID}
    >
      <Text
        variant={active ? 'headingBold' : 'bodyLargeStrong'}
        color="textPrimary"
        numberOfLines={1}
      >
        {plan.label}
      </Text>
      <Text variant={active ? 'bodyStrong' : 'body'} color="textPrimary" numberOfLines={1}>
        {caption}
      </Text>
    </Pressable>
  );
}

/** `1366:2938` — 32 × 56 at an 8pt radius, the 16pt plus centred. */
function AddButton({
  onPress,
  disabled,
  testID,
}: {
  readonly onPress: () => void;
  readonly disabled: boolean;
  readonly testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add another plan"
      hitSlop={ADD_SLOP}
      disabled={disabled}
      accessibilityState={{ disabled }}
      style={[
        styles.add,
        { experimental_backgroundImage: radialBackground(lightTheme.gradients.planHeaderAdd) },
        disabled ? styles.addDisabled : null,
      ]}
      testID={testID}
    >
      <Image source={PLUS_ICON} style={styles.plus} accessibilityElementsHidden />
    </Pressable>
  );
}

/** `1366:2936` — tiles and the "+" are 56 tall. */
const TILE_HEIGHT = 56;
const ADD_WIDTH = 32;
/** The "+" is 32 wide; slop restores a 44pt target without redrawing it. */
const ADD_SLOP = { left: 6, right: 6 };
/** Below this a tile's "Plan N" no longer fits, so the row scrolls instead of shrinking it. */
const MIN_TILE_WIDTH = 120;
/** The selected tile's `Elevation/1` blur, kept inside the row's clip. */
const SHADOW_ROOM = 3;

const styles = StyleSheet.create({
  /** `1366:2936` — a 12pt-gapped row 56 tall, the content box's full width. */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.space.md,
    height: TILE_HEIGHT,
  },
  /**
   * The row clips: with three or more plans it scrolls, and tiles drawn past its edge would sit
   * under the "+" (device test, 30 Oct 2026). It is widened by the shadow's blur on every side and
   * padded back by the same, so the clip edge leaves the selected tile's lift whole while the
   * tiles stay exactly where the frame puts them.
   */
  tiles: { flexGrow: 1, flexShrink: 1, overflow: 'hidden', margin: -SHADOW_ROOM },
  tilesContent: { flexGrow: 1, gap: lightTheme.space.md, padding: SHADOW_ROOM },
  /** `1366:2937` — p 8, 4 between label and caption, a 16pt radius. */
  tile: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: MIN_TILE_WIDTH,
    height: TILE_HEIGHT,
    padding: lightTheme.space.sm,
    gap: lightTheme.space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: lightTheme.radius.md,
  },
  /** `1366:2937` — the selected tile's `Elevation/1`, `0 0 3 rgba(0,0,0,0.08)`. */
  tileLift: { boxShadow: innerShadows.elevation1 },
  add: {
    width: ADD_WIDTH,
    height: TILE_HEIGHT,
    borderRadius: lightTheme.radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addDisabled: { opacity: 0.4 },
  plus: { width: 16, height: 16 },
});
