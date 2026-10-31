import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import { ART } from '../assets';
import { DISH_TYPES } from '../content';
import { DISH_LIMITS, PEOPLE_LIMITS } from '../state/bookingDraft';
import type { DialInputs, DishComplexity } from '../state/recommendDuration';
import type { DurationOption } from '../types';
import { C, F, SHADOW_SOFT } from '../theme';

const SEGMENT_BOX = 240;

/**
 * The six arc segments, shortest duration first. Each is a crop of a 240pt square; `inset` is
 * [top, right, bottom, left] in percent. The artwork is a flat fill, so the recommended segment
 * is tinted `#FFD600` and the rest `#FFF7CC` — exactly the two fills the frame uses.
 */
const SEGMENTS: readonly {
  source: ImageSourcePropType;
  inset: readonly [number, number, number, number];
  label: { left: number; top: number };
}[] = [
  { source: ART.seg30m, inset: [52.27, 77.58, 14.64, 0], label: { left: 2.49, top: 183.68 } },
  { source: ART.seg45m, inset: [16.33, 78.83, 50.45, 0], label: { left: 0, top: 76.61 } },
  { source: ART.seg1h, inset: [0, 51.36, 78.21, 15.48], label: { left: 80.35, top: 0 } },
  { source: ART.seg15h, inset: [0, 15.48, 78.21, 51.36], label: { left: 182.45, top: 0 } },
  { source: ART.seg2h, inset: [16.33, 0, 50.45, 78.83], label: { left: 262.3, top: 76.61 } },
  { source: ART.seg25h, inset: [52.27, 0, 14.64, 77.58], label: { left: 255.3, top: 183.68 } },
];

/** `30` → "30m", `90` → "1.5h". */
const shortLabel = (minutes: number) => (minutes < 60 ? `${minutes}m` : `${minutes / 60}h`);

export interface DurationDialProps {
  readonly durations: readonly DurationOption[];
  readonly recommended: DurationOption | null;
  readonly inputs: DialInputs;
  /**
   * Absent on the not-live Home (`1302:3779`, read-only): "Pay only for the time you utilize",
   * a 16pt-padded card with the dial and the extension note only. Present elsewhere
   * (`1255:3217` / `1290:1829`): an unpadded card adding the meal-type switch and both counters.
   */
  readonly onChangeInputs?: (next: DialInputs) => void;
  /**
   * `1622:2011` "Select duration" — drawn under the card wherever the dial is editable: takes the
   * recommended duration. Absent (no button) on the read-only dial.
   */
  readonly onSelectDuration?: () => void;
}

/** `784:4072` "Duration · Dial". Changing an input re-recommends; the screen selects that tile. */
export function DurationDial({
  durations,
  recommended,
  inputs,
  onChangeInputs,
  onSelectDuration,
}: DurationDialProps) {
  const editable = onChangeInputs !== undefined;
  const arc = durations
    .slice()
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, SEGMENTS.length);

  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>DURATION</Text>
      <Text style={styles.title}>
        {editable ? 'How long do you need the cook to stay?' : 'Pay only for the time you utilize'}
      </Text>

      <View style={[styles.card, editable ? null : styles.cardPadded]}>
        <View style={styles.dial}>
          <Image source={ART.dialEllipse} style={styles.ellipse} />
          {SEGMENTS.map(({ source, inset: [t, r, b, l] }, i) => {
            const active = arc[i] !== undefined && arc[i]!.id === recommended?.id;
            return (
              <View key={i} style={styles.segmentBox} pointerEvents="none">
                <Image
                  source={source}
                  resizeMode="stretch"
                  // Percent insets are resolved here: `Image` sizes itself from its source and
                  // ignores percentage left/right/top/bottom.
                  style={{
                    position: 'absolute',
                    left: (l / 100) * SEGMENT_BOX,
                    top: (t / 100) * SEGMENT_BOX,
                    width: ((100 - l - r) / 100) * SEGMENT_BOX,
                    height: ((100 - t - b) / 100) * SEGMENT_BOX,
                    tintColor: active ? C.brand : C.softer,
                  }}
                />
              </View>
            );
          })}
          {SEGMENTS.map(({ label }, i) => {
            const option = arc[i];
            if (option === undefined) return null;
            return (
              <Text
                key={option.id}
                style={[
                  styles.dialLabel,
                  label,
                  option.id === recommended?.id ? styles.dialLabelActive : null,
                ]}
              >
                {shortLabel(option.minutes)}
              </Text>
            );
          })}
          {recommended === null ? null : <Text style={styles.centre}>{recommended.label}</Text>}
          {/* `784:4089` — under the duration, centred on the same axis as it (device test, 31 Oct
              2026: placed from the card's edge, it drifted left of centre on a full-width card). */}
          {recommended === null ? null : (
            <View
              style={[styles.tagRow, { top: TAG_TOP - (editable ? 0 : CARD_PADDING) }]}
              pointerEvents="none"
            >
              <View style={styles.tag}>
                <Text style={styles.tagText}>Recommended</Text>
              </View>
            </View>
          )}
        </View>

        {editable ? (
          <>
            <DishToggle
              value={inputs.complexity}
              onChange={(complexity) => onChangeInputs({ ...inputs, complexity })}
            />
            <Stepper
              label="No. of dishes"
              value={inputs.dishes}
              limits={DISH_LIMITS}
              onChange={(dishes) => onChangeInputs({ ...inputs, dishes })}
            />
            <Stepper
              label="No. of people"
              value={inputs.people}
              limits={PEOPLE_LIMITS}
              onChange={(people) => onChangeInputs({ ...inputs, people })}
            />
          </>
        ) : null}

        <View style={styles.extension}>
          <Image source={ART.timeExtension} style={styles.extensionIcon} />
          <Text style={styles.extensionText}>
            Worried service might run longer than recommended? Don’t fret, you can Extend from the
            app anytime!
          </Text>
        </View>
      </View>

      {editable && onSelectDuration !== undefined ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: recommended === null }}
          disabled={recommended === null}
          onPress={onSelectDuration}
          style={[styles.select, SHADOW_SOFT]}
        >
          <Text style={styles.selectLabel}>Select duration</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * `1290:1222` "Toggle/ dish" — 44 tall, 1pt `#FFD600` border, the active half filled `#FFD600`.
 * The frame places a fixed 175 × 36 fill at y 3 (5pt under it) and its labels on a space-between
 * row; here the two halves are equal, each fill inset an even 3pt inside the border, and each
 * label centred in its half — SemiBold black when active, Regular secondary when not.
 */
function DishToggle({
  value,
  onChange,
}: {
  value: DishComplexity;
  onChange: (next: DishComplexity) => void;
}) {
  return (
    <View style={styles.dishType}>
      {DISH_TYPES.map((type) => {
        const active = value === type.id;
        return (
          <Pressable
            key={type.id}
            accessibilityRole="button"
            accessibilityLabel={type.label}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(type.id)}
            style={[styles.dishHalf, active ? styles.dishHalfActive : null]}
          >
            <Text style={active ? styles.dishLabelActive : styles.dishLabel} numberOfLines={1}>
              {type.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Stepper({
  label,
  value,
  limits: { min, max },
  onChange,
}: {
  label: string;
  value: number;
  limits: { min: number; max: number };
  onChange: (next: number) => void;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Fewer ${label}`}
          disabled={value <= min}
          onPress={() => onChange(value - 1)}
          style={[styles.stepButton, styles.stepMinus, SHADOW_SOFT]}
        >
          <View style={styles.bar} />
        </Pressable>
        <Text style={styles.stepValue}>{value}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More ${label}`}
          disabled={value >= max}
          onPress={() => onChange(value + 1)}
          style={[styles.stepButton, styles.stepPlus, SHADOW_SOFT]}
        >
          <View style={styles.bar} />
          <View style={[styles.bar, styles.barVertical]} />
        </Pressable>
      </View>
    </View>
  );
}

const CARD_PADDING = 16;
/** `784:4089` — the tag's top, 172 from the card's edge in every frame. */
const TAG_TOP = 172;

const styles = StyleSheet.create({
  section: { gap: 12, paddingHorizontal: 16, paddingBottom: 8, width: '100%' },
  eyebrow: {
    fontFamily: F.semibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.44,
    color: C.textSecondary,
  },
  title: { fontFamily: F.bold, fontSize: 20, lineHeight: 28, color: C.text },
  card: { alignItems: 'center', gap: 16, borderRadius: 24, width: '100%' },
  cardPadded: { padding: CARD_PADDING },
  dial: { width: 280, height: 235 },
  ellipse: { position: 'absolute', left: 41.4, top: 35.19, width: 200, height: 200 },
  segmentBox: {
    position: 'absolute',
    left: 21.4,
    top: 15.19,
    width: SEGMENT_BOX,
    height: SEGMENT_BOX,
  },
  dialLabel: {
    position: 'absolute',
    fontFamily: F.regular,
    fontSize: 12,
    lineHeight: 16,
    color: C.textSecondary,
  },
  dialLabelActive: { fontFamily: F.semibold, color: C.text },
  /** `784:4087` — centred on x 139.9 (79pt wide at x 100.4 for "1.5 hrs"). */
  centre: {
    position: 'absolute',
    left: 60.4,
    top: 111.19,
    width: 159,
    textAlign: 'center',
    fontFamily: F.bold,
    fontSize: 24,
    lineHeight: 32,
    color: C.text,
  },
  /** The duration's own box (`centre`), so the tag shares its axis. */
  tagRow: { position: 'absolute', left: 60.4, width: 159, alignItems: 'center' },
  tag: {
    backgroundColor: C.limeSoft,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  tagText: { fontFamily: F.semibold, fontSize: 10, lineHeight: 14, color: C.text },
  /** `1622:2011` — 370 wide, min 48, `#FFE666` pill, Elevation/1, "Select duration" in Button. */
  select: {
    width: '100%',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: C.tint,
  },
  selectLabel: { fontFamily: F.bold, fontSize: 16, lineHeight: 24, color: C.text },
  /** The 44pt track: 1pt border, its halves inset 3pt on every side. */
  dishType: {
    width: '100%',
    height: 44,
    flexDirection: 'row',
    padding: 3,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: C.brand,
  },
  dishHalf: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 9999,
  },
  dishHalfActive: { backgroundColor: C.brand },
  dishLabel: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.textSecondary },
  dishLabelActive: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
  stepperRow: {
    width: '100%',
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperLabel: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 4,
    borderRadius: 9999,
    backgroundColor: C.softer,
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepMinus: { backgroundColor: C.base },
  stepPlus: { backgroundColor: C.brand },
  stepValue: {
    width: 44,
    textAlign: 'center',
    fontFamily: F.semibold,
    fontSize: 16,
    lineHeight: 24,
    color: C.text,
  },
  bar: { position: 'absolute', width: 16, height: 2, borderRadius: 1, backgroundColor: C.text },
  barVertical: { width: 2, height: 16 },
  extension: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' },
  extensionIcon: { width: 32, height: 32 },
  extensionText: {
    flex: 1,
    fontFamily: F.regular,
    fontSize: 12,
    lineHeight: 16,
    color: C.textSecondary,
  },
});
