import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Image, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lightTheme } from '@ui';
import { PrimaryButton } from '@ui/v2/Buttons';
import { C, SHADOW_1, T } from '@ui/v2/theme';

import { FOOD_PROFILE_ART } from '../art';
import type { FoodProfileArtKey } from '../art';
import { WIZARD_STEPS } from '../fields';
import type { ListOption, OilStop, TileOption, WizardStepId } from '../fields';

/**
 * The pieces the four taste-profile steps share (Figma page `1405:448`). Values are the frames':
 * `C`/`T` are the design system's `color/*` and `Spoon/*` styles (`@ui/v2/theme`).
 */

/* -------------------------------------------------------------------------------- header */

/**
 * `1548:3677` — a `#FFF7CC` header, 24pt bottom radius: the nav row (36pt white Back disc and the
 * Title, 8pt apart; no disc on a step that cannot go back) over the progress thali, 16pt apart.
 */
export function WizardHeader({
  step,
  onBack,
  testID,
}: {
  step: WizardStepId;
  onBack?: (() => void) | undefined;
  testID: string;
}) {
  const { top } = useSafeAreaInsets();
  const index = WIZARD_STEPS.findIndex((entry) => entry.id === step);
  const title = WIZARD_STEPS[index]?.title ?? '';
  return (
    <View style={[styles.header, { paddingTop: Math.max(top, 20) + 8 }]} testID={testID}>
      <View style={styles.nav}>
        {onBack === undefined ? null : (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={6}
            style={({ pressed }) => [styles.backDisc, pressed && styles.pressed]}
            testID={`${testID}-back`}
          >
            <Image source={FOOD_PROFILE_ART.chevronLeft} style={styles.icon24} />
          </Pressable>
        )}
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
      </View>
      <ProgressThali current={index} />
    </View>
  );
}

/**
 * `1548:3685` — four bowls: done (filled, steaming), current (outlined, half full) and to come
 * (pale). A short rule follows each of the first three, gold once that step is done. Display
 * only (dev note `2505:4912`): customers move with Continue and Back.
 */
function ProgressThali({ current }: { current: number }) {
  return (
    <View
      style={styles.thali}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current + 1} of ${WIZARD_STEPS.length}`}
    >
      {WIZARD_STEPS.map((entry, index) => {
        const done = index < current;
        const reached = index <= current;
        return (
          <View key={entry.id} style={styles.bowlColumn}>
            <View style={styles.bowlBox}>
              {done ? (
                <Image source={FOOD_PROFILE_ART.bowlDone} style={styles.bowlDone} />
              ) : (
                <Image
                  source={reached ? FOOD_PROFILE_ART.bowlCurrent : FOOD_PROFILE_ART.bowlPending}
                  style={styles.bowl}
                />
              )}
              {index < WIZARD_STEPS.length - 1 ? (
                <View style={[styles.bowlRule, done && styles.bowlRuleDone]} />
              ) : null}
            </View>
            <Text style={[styles.bowlLabel, !reached && styles.textSecondary]}>{entry.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/* -------------------------------------------------------------------------------- footer */

/** `1548:3782` — white, 12pt over the 52pt Button, the home indicator below. */
export function WizardFooter({
  label,
  onPress,
  disabled,
  loading,
  errorMessage,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  loading: boolean;
  errorMessage?: string | undefined;
  testID: string;
}) {
  const { bottom } = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: Math.max(bottom, 12) }]}>
      {/* Dev note `2505:4937`: a failed save keeps every answer and says why, inline. */}
      {errorMessage === undefined ? null : (
        <Text style={styles.error} accessibilityRole="alert" testID={`${testID}-error`}>
          {errorMessage}
        </Text>
      )}
      <PrimaryButton
        label={label}
        onPress={onPress}
        disabled={disabled}
        loading={loading}
        style={styles.cta}
        testID={testID}
      />
    </View>
  );
}

/* ------------------------------------------------------------------------------ question */

export function Question({
  children,
  trailing,
  size = 'heading',
}: {
  children: string;
  trailing?: string;
  size?: 'heading' | 'emphasis';
}) {
  return (
    <View style={styles.question}>
      <Text
        style={size === 'heading' ? styles.heading : styles.emphasis}
        accessibilityRole="header"
      >
        {children}
      </Text>
      {trailing === undefined ? null : <Text style={styles.optional}>{trailing}</Text>}
    </View>
  );
}

/* ---------------------------------------------------------------------------------- tile */

function TileIcon({ icon }: { icon: TileOption['icon'] }) {
  if (icon === 'mixed') {
    // `1548:3857` — the veg mark with the non-veg mark overlapping it, down and to the right.
    return (
      <View style={styles.tileIcon}>
        <Image source={FOOD_PROFILE_ART.markVeg} style={[styles.mark, styles.markBack]} />
        <Image source={FOOD_PROFILE_ART.markNonVeg} style={[styles.mark, styles.markFront]} />
      </View>
    );
  }
  const source = FOOD_PROFILE_ART[icon];
  const size = ICON_SIZES[icon] ?? { width: 24, height: 24 };
  return (
    <View style={styles.tileIcon}>
      <Image source={source} style={size} />
    </View>
  );
}

/** Tile glyphs that are not a plain 24pt icon. */
const ICON_SIZES: Partial<Record<FoodProfileArtKey, { width: number; height: number }>> = {
  markVeg: { width: 22, height: 22 },
  markEgg: { width: 22, height: 22 },
  markNonVeg: { width: 22, height: 22 },
  dietJain: { width: 28, height: 28 },
  dietVegan: { width: 28, height: 24 },
  genderFemale: { width: 28, height: 24 },
  genderMale: { width: 28, height: 24 },
  regionSouth: { width: 26, height: 26 },
};

/**
 * `1548:3826` — the option tile: white with a 1.5pt `#FFEF99` edge, 16pt radius; selected fills
 * `#FFE666` and shows the white check disc in its corner. `compact` is the Cook step's (px 12,
 * py 10, 4pt gap) against the Diet step's 12/8.
 */
export function OptionTile({
  option,
  selected,
  onPress,
  compact = false,
  testID,
}: {
  option: TileOption;
  selected: boolean;
  onPress: () => void;
  compact?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={
        option.hint === undefined ? option.label : `${option.label}, ${option.hint}`
      }
      style={({ pressed }) => [
        styles.tile,
        compact && styles.tileCompact,
        selected && styles.tileSelected,
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      <TileIcon icon={option.icon} />
      {/* A third of a 360pt phone is narrower than Figma's 402pt frame: the label shrinks a step
          rather than wrapping ("No / preference"), as the Account screen's tile labels do. */}
      <Text
        style={styles.bodyStrong}
        numberOfLines={1}
        textBreakStrategy="simple"
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {option.label}
      </Text>
      {option.hint === undefined ? null : (
        <Text style={[styles.micro, styles.textSecondary]} numberOfLines={2}>
          {option.hint}
        </Text>
      )}
      {selected ? (
        <View style={styles.tileCheck}>
          <Image source={FOOD_PROFILE_ART.tileCheck} style={styles.icon16} />
        </View>
      ) : null}
    </Pressable>
  );
}

/* ---------------------------------------------------------------------------------- chip */

/**
 * `2475:19481` — selected: `#FFE666` with the check after the label (or the remove cross, on the
 * cuisine row `1548:3972`); unselected: white with a 1.5pt `#FFEF99` edge.
 */
export function Chip({
  label,
  selected,
  onPress,
  mark = 'check',
  disabled = false,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  mark?: 'check' | 'remove';
  disabled?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={selected && mark === 'remove' ? `Remove ${label}` : label}
      style={({ pressed }) => [
        styles.chip,
        selected ? (mark === 'remove' ? styles.chipRemovable : styles.chipSelected) : null,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      <Text style={styles.captionStrong}>{label}</Text>
      {selected ? (
        <Image
          source={mark === 'remove' ? FOOD_PROFILE_ART.chipRemove : FOOD_PROFILE_ART.chipCheck}
          style={mark === 'remove' ? styles.icon14 : styles.icon16}
        />
      ) : null}
    </Pressable>
  );
}

/** A chip row that scrolls sideways, bleeding to the screen edge as the frames draw it. */
export function ChipScroller({ children, testID }: { children: ReactNode; testID: string }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipScroller}
      contentContainerStyle={styles.chipScrollerContent}
      keyboardShouldPersistTaps="handled"
      testID={testID}
    >
      {children}
    </ScrollView>
  );
}

/* ------------------------------------------------------------------------------- stepper */

const WELLS = { subtle: C.subtle, positive: '#ECFF9B', tint: C.tint } as const;

/**
 * `1548:3719` — one household row: a 40pt icon well, the label over its age band, and the
 * stepper (a `#FFF7CC` pill: white −, the count, gold +). − dims at its floor.
 */
export function CounterRow({
  label,
  hint,
  well,
  iconSize,
  value,
  canDecrement,
  canIncrement,
  onDecrement,
  onIncrement,
  last,
  testID,
}: {
  label: string;
  hint: string;
  well: keyof typeof WELLS;
  iconSize: number;
  value: number;
  canDecrement: boolean;
  canIncrement: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
  last: boolean;
  testID: string;
}) {
  return (
    <View style={[styles.counterRow, !last && styles.rowRule]} testID={testID}>
      <View style={[styles.counterWell, { backgroundColor: WELLS[well] }]}>
        <Image source={FOOD_PROFILE_ART.profile} style={{ width: iconSize, height: iconSize }} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.bodyStrong}>{label}</Text>
        <Text style={[styles.micro, styles.textSecondary]}>{hint}</Text>
      </View>
      <View style={styles.stepper}>
        <Pressable
          onPress={onDecrement}
          disabled={!canDecrement}
          accessibilityRole="button"
          accessibilityLabel={`Fewer ${label.toLowerCase()}`}
          accessibilityState={{ disabled: !canDecrement }}
          hitSlop={4}
          style={({ pressed }) => [!canDecrement && styles.disabled, pressed && styles.pressed]}
          testID={`${testID}-minus`}
        >
          <Image source={FOOD_PROFILE_ART.stepperMinus} style={styles.icon32} />
        </Pressable>
        <Text style={styles.count} accessibilityLabel={`${value} ${label.toLowerCase()}`}>
          {value}
        </Text>
        <Pressable
          onPress={onIncrement}
          disabled={!canIncrement}
          accessibilityRole="button"
          accessibilityLabel={`More ${label.toLowerCase()}`}
          accessibilityState={{ disabled: !canIncrement }}
          hitSlop={4}
          style={({ pressed }) => [!canIncrement && styles.disabled, pressed && styles.pressed]}
          testID={`${testID}-plus`}
        >
          <Image source={FOOD_PROFILE_ART.stepperPlus} style={styles.icon32} />
        </Pressable>
      </View>
    </View>
  );
}

/* --------------------------------------------------------------------------- grouped list */

/** `2522:960` / `2522:1173` — the grouped list card: 1.5pt `#FFEF99` edge, 20pt radius. */
export function ListCard({ children, testID }: { children: ReactNode; testID: string }) {
  return (
    <View style={styles.listCard} testID={testID}>
      {children}
    </View>
  );
}

/**
 * One row of a grouped list. `radio` is the meal setup (`2522:961`: 36pt well, title over a
 * caption, the ring/dot); `checkbox` is a hassle (`2522:1174`: 32pt well, one line, the box).
 * Selected turns the well `#FFE666`, and a ticked hassle's label bold.
 */
export function ListRow({
  option,
  kind,
  selected,
  onPress,
  last,
  testID,
}: {
  option: ListOption;
  kind: 'radio' | 'checkbox';
  selected: boolean;
  onPress: () => void;
  last: boolean;
  testID: string;
}) {
  const radio = kind === 'radio';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={radio ? 'radio' : 'checkbox'}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={
        option.hint === undefined ? option.label : `${option.label}, ${option.hint}`
      }
      style={({ pressed }) => [
        styles.listRow,
        radio ? styles.listRowRadio : styles.listRowCheck,
        !last && styles.rowRule,
        pressed && styles.rowPressed,
      ]}
      testID={testID}
    >
      <View
        style={[
          radio ? styles.wellRadio : styles.wellCheck,
          { backgroundColor: selected ? C.tint : C.subtle },
        ]}
      >
        <Image
          source={FOOD_PROFILE_ART[option.icon]}
          style={radio ? styles.icon22 : styles.icon18}
        />
      </View>
      <View style={[styles.flex, styles.listText]}>
        <Text style={radio || selected ? styles.bodyStrong : styles.body}>{option.label}</Text>
        {option.hint === undefined ? null : (
          <Text style={[styles.caption, styles.textSecondary]}>{option.hint}</Text>
        )}
      </View>
      {radio ? <Radio selected={selected} /> : <Checkbox selected={selected} />}
    </Pressable>
  );
}

/** `2522:976` off — a 20pt `#FFEF99` ring; `2526:15527` on — a 24pt `#FFE666` ring and dot. */
function Radio({ selected }: { selected: boolean }) {
  if (!selected) return <View style={styles.radioOff} />;
  return (
    <View style={styles.radioOnBox}>
      <View style={styles.radioOnRing}>
        <View style={styles.radioOnDot} />
      </View>
    </View>
  );
}

/** `2522:1193` off — a 20pt box, 6pt radius, `#FFEF99` edge; `2522:1179` on — filled with a check. */
function Checkbox({ selected }: { selected: boolean }) {
  if (!selected) return <View style={styles.checkboxOff} />;
  return (
    <View style={styles.checkboxOn}>
      <Image source={FOOD_PROFILE_ART.checkboxCheck} style={styles.icon14} />
    </View>
  );
}

/* ---------------------------------------------------------------------------- oil slider */

/**
 * `2486:896` — three drops over a track over three labels. Dev note `2505:4927`: tap a stop or
 * drag the thumb; it snaps to the nearest stop on release, the gold rail fills up to it, and the
 * chosen label turns bold.
 */
export function OilSlider({
  stops,
  value,
  onChange,
  testID,
}: {
  stops: readonly OilStop[];
  value: string;
  onChange: (id: OilStop['id']) => void;
  testID: string;
}) {
  const [width, setWidth] = useState(0);
  const [dragX, setDragX] = useState<number | null>(null);
  const index = Math.max(
    0,
    stops.findIndex((stop) => stop.id === value),
  );
  // Each stop sits at the centre of its third, as the drops and labels above and below it do.
  const column = width / stops.length;
  const centre = (at: number) => column * at + column / 2;
  const nearest = useCallback(
    (x: number) => Math.min(stops.length - 1, Math.max(0, Math.round((x - column / 2) / column))),
    [column, stops.length],
  );
  const first = centre(0);
  const last = centre(stops.length - 1);
  const thumbX = dragX ?? centre(index);

  const responder = useMemo(() => {
    const clampX = (x: number) => Math.min(last, Math.max(first, x));
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // A horizontal drag inside a vertical ScrollView: keep it once it is ours.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => setDragX(clampX(event.nativeEvent.locationX)),
      onPanResponderMove: (event) => setDragX(clampX(event.nativeEvent.locationX)),
      onPanResponderRelease: (event) => {
        const stop = stops[nearest(event.nativeEvent.locationX)];
        setDragX(null);
        if (stop !== undefined) onChange(stop.id);
      },
      onPanResponderTerminate: () => setDragX(null),
    });
  }, [first, last, nearest, onChange, stops]);

  return (
    <View style={styles.slider} testID={testID}>
      <View style={styles.sliderRow}>
        {stops.map((stop) => (
          <View key={stop.id} style={styles.sliderCell}>
            <Image source={FOOD_PROFILE_ART[stop.drop]} style={styles.drop} />
          </View>
        ))}
      </View>
      <View
        style={styles.track}
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        accessibilityRole="adjustable"
        accessibilityLabel="Oil"
        accessibilityValue={{ text: stops[index]?.label ?? '' }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          const step = event.nativeEvent.actionName === 'increment' ? 1 : -1;
          const stop = stops[Math.min(stops.length - 1, Math.max(0, index + step))];
          if (stop !== undefined) onChange(stop.id);
        }}
        {...responder.panHandlers}
        testID={`${testID}-track`}
      >
        {width === 0 ? null : (
          <>
            <View style={[styles.rail, { left: first, width: last - first }]} />
            <View
              style={[styles.rail, styles.railActive, { left: first, width: thumbX - first }]}
            />
            <View style={[styles.stop, styles.stopActive, { left: first - 5 }]} />
            <View
              style={[styles.stop, thumbX >= last ? styles.stopActive : null, { left: last - 5 }]}
            />
            <View style={[styles.thumb, SHADOW_1, { left: thumbX - 14 }]} pointerEvents="none">
              <View style={styles.thumbCore} />
            </View>
          </>
        )}
      </View>
      <View style={styles.sliderRow}>
        {stops.map((stop, at) => (
          <Pressable
            key={stop.id}
            onPress={() => onChange(stop.id)}
            accessibilityRole="button"
            accessibilityLabel={stop.label}
            accessibilityState={{ selected: at === index }}
            style={styles.sliderCell}
            testID={`${testID}-${stop.id}`}
          >
            <Text
              style={[
                at === index ? styles.bodyStrong : styles.body,
                at === index ? null : styles.textSecondary,
                styles.centre,
              ]}
            >
              {stop.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------------- switch */

/**
 * `2485:914` — the ghee row: `#FFF7CC`, 16pt radius, the label over its hint and the 44 × 26
 * switch (off: grey track, knob left; on: gold track, knob right). The whole row toggles.
 */
export function SwitchRow({
  label,
  hint,
  value,
  onChange,
  testID,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (next: boolean) => void;
  testID: string;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.switchRow, pressed && styles.pressed]}
      testID={testID}
    >
      <View style={[styles.flex, styles.switchText]}>
        <Text style={styles.bodyStrong}>{label}</Text>
        <Text style={[styles.caption, styles.textSecondary]}>{hint}</Text>
      </View>
      <View style={[styles.switchTrack, value && styles.switchTrackOn]}>
        <View style={[styles.switchKnob, value && styles.switchKnobOn]} />
      </View>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------------- shared */

/**
 * Tiles in rows of `columns`, 8pt apart both ways (`1548:3825` is 3 × 2, `2527:14278` is 2 × 1).
 * Each row stretches its tiles to the tallest, so a two-line hint never leaves a short neighbour.
 */
export function TileRows<T>({
  items,
  columns,
  render,
}: {
  items: readonly T[];
  columns: number;
  render: (item: T) => ReactNode;
}) {
  const rows: T[][] = [];
  items.forEach((item, at) => {
    if (at % columns === 0) rows.push([]);
    rows[rows.length - 1]?.push(item);
  });
  return (
    <View style={styles.tileRows}>
      {rows.map((row, at) => (
        <View key={at} style={styles.tileRow}>
          {row.map(render)}
        </View>
      ))}
    </View>
  );
}

const TILE_EDGE = 1.5;

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.4 },
  centre: { textAlign: 'center' },
  icon14: { width: 14, height: 14 },
  icon16: { width: 16, height: 16 },
  icon18: { width: 18, height: 18 },
  icon22: { width: 22, height: 22 },
  icon24: { width: 24, height: 24 },
  icon32: { width: 32, height: 32 },
  textSecondary: { color: C.textSecondary },
  body: { ...T.body, color: C.text },
  bodyStrong: { ...T.bodyStrong, color: C.text },
  caption: { ...T.caption, color: C.text },
  captionStrong: { ...T.captionStrong, color: C.text },
  micro: { ...T.micro, color: C.text },
  heading: { ...T.heading, color: C.text, flexShrink: 1 },
  emphasis: { ...T.emphasis, color: C.text, flexShrink: 1 },
  optional: { ...T.caption, color: C.textSecondary },

  header: {
    backgroundColor: C.subtle,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 16,
  },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  backDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...T.title, color: C.text, flexShrink: 1 },
  thali: { flexDirection: 'row', justifyContent: 'space-between' },
  bowlColumn: { alignItems: 'center', gap: 8 },
  bowlBox: { width: 72, height: 30 },
  bowl: { width: 72, height: 30 },
  // `bowl-done` carries its steam above the rim: 33pt tall, drawn 3pt higher (`inset -9.17%`).
  bowlDone: { width: 72, height: 33, marginTop: -3 },
  bowlRule: {
    position: 'absolute',
    left: 62,
    top: 16,
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: C.border,
  },
  bowlRuleDone: { backgroundColor: C.brand },
  bowlLabel: { ...T.microStrong, color: C.text },

  footer: { backgroundColor: C.base, paddingTop: 12, paddingHorizontal: 16, gap: 8 },
  cta: { minHeight: 52 },
  error: { ...T.caption, color: lightTheme.colors.textDestructive, textAlign: 'center' },

  question: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },

  tileRows: { gap: 8 },
  tileRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  tile: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    // Figma draws the 1.5pt edge INSIDE the 12pt padding; React Native adds it on top, so the
    // padding gives it back. Without this "No preference" no longer fits its 118pt tile.
    padding: 12 - TILE_EDGE,
    gap: 8,
    borderRadius: 16,
    borderWidth: TILE_EDGE,
    borderColor: C.border,
    backgroundColor: C.base,
    overflow: 'hidden',
  },
  tileCompact: { paddingVertical: 10 - TILE_EDGE, gap: 4 },
  // Selected tiles draw no edge; keeping it in the fill's colour holds the layout still.
  tileSelected: { backgroundColor: C.tint, borderColor: C.tint },
  tileIcon: { height: 24, minWidth: 28, justifyContent: 'center' },
  mark: { position: 'absolute', width: 22, height: 22 },
  markBack: { left: 0, top: -2 },
  markFront: { left: 12, top: 4 },
  tileCheck: {
    position: 'absolute',
    top: 10 - TILE_EDGE,
    right: 10 - TILE_EDGE,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.base,
    alignItems: 'center',
    justifyContent: 'center',
  },

  chipScroller: { marginHorizontal: -16, flexGrow: 0 },
  chipScrollerContent: { paddingHorizontal: 16, gap: 8, alignItems: 'flex-start' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.base,
  },
  chipSelected: { backgroundColor: C.tint, borderColor: C.tint, paddingLeft: 12 },
  chipRemovable: { backgroundColor: C.tint, borderColor: C.tint, paddingRight: 12 },

  counterRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowRule: { borderBottomWidth: 1, borderBottomColor: C.border },
  counterWell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
    borderRadius: 9999,
    backgroundColor: C.subtle,
  },
  count: { ...T.emphasis, color: C.text, width: 28, textAlign: 'center' },

  listCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.base,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 12,
    paddingRight: 14,
  },
  listRowRadio: { paddingVertical: 6 },
  listRowCheck: { paddingVertical: 8 },
  rowPressed: { backgroundColor: C.subtle },
  listText: { gap: 1 },
  wellRadio: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wellCheck: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOff: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: C.border },
  radioOnBox: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  radioOnRing: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: C.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOnDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: C.tint },
  checkboxOff: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: C.border },
  checkboxOn: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: C.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },

  slider: { gap: 6 },
  sliderRow: { flexDirection: 'row' },
  sliderCell: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  drop: { width: 22, height: 26 },
  track: { height: 28 },
  rail: { position: 'absolute', top: 11, height: 6, borderRadius: 3, backgroundColor: C.subtle },
  railActive: { backgroundColor: C.brand },
  stop: {
    position: 'absolute',
    top: 9,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.base,
  },
  stopActive: { backgroundColor: C.brand, borderColor: C.brand },
  thumb: {
    position: 'absolute',
    top: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbCore: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.brand },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: C.subtle,
  },
  switchText: { gap: 2 },
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.textDisabled,
    justifyContent: 'center',
  },
  switchTrackOn: { backgroundColor: C.brand },
  switchKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: 3,
    backgroundColor: C.base,
    boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 2, color: 'rgba(0,0,0,0.15)' }],
  },
  switchKnobOn: { marginLeft: 21 },
});
