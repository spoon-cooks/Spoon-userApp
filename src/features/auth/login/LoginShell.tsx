import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Animated,
  Easing,
  Image,
  Keyboard,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { keyframedStyle, useReducedMotion, useTimeline } from '@ui/motion/keyframes';
import type { MotionPart } from '@ui/motion/keyframes';

import { LOGIN_ART } from './art';
import { C, F, SHADOW_PILL } from './theme';

/**
 * The frame every login screen shares — Figma page "Login" (`1873:4879`): the hero photograph with
 * its four badges, a curved white sheet over it, and the keyboard behaviour from dev notes
 * `1949:2258` / `1949:2266`.
 *
 * Geometry is read off the 402 × 874 frames and anchored to the BOTTOM of the screen, so a taller
 * phone gets more photograph rather than a sheet floating mid-screen:
 *
 *   keyboard closed  the content block starts `contentFromBottom` above the bottom edge (Login
 *                    `1923:1307` at y 474 → 400; OTP `1934:1322` at y 500 → 374) and the curve
 *                    starts `curveLead` above the content (`1923:1306` at y 440). The photo runs
 *                    100pt under the curve (540 vs 440), so the curve always has picture behind it.
 *   keyboard open    the sheet rises until its last element sits 16pt above the keyboard; the
 *                    photo becomes whatever band is left above it, and the badges fade out in
 *                    150 ms. On a phone 667pt tall or less the photo is hidden outright, so the
 *                    form can never end up under the keyboard.
 *
 * Tapping the photo band closes the keyboard (tapping the field never does).
 */
export interface LoginShellProps {
  readonly keyboardHeight: number;
  /** Distance from the bottom edge to the top of the content block, keyboard closed. */
  readonly contentFromBottom: number;
  /** How far above the content block the curve starts, keyboard closed. */
  readonly curveLead: number;
  /** Play the one-time intro (Login only); the OTP screens draw the hero at rest. */
  readonly intro?: boolean;
  /** Floating controls over the photo (Back, Skip), positioned by the caller. */
  readonly overlay?: ReactNode;
  readonly children: ReactNode;
  readonly testID?: string;
}

/** Dev note `1949:2258`: "about 667pt screen height or less" counts as a small phone. */
const SMALL_PHONE_HEIGHT = 667;
/** The curve's own height at the 402pt reference width (`M0 48 C… 402 48`). */
const CURVE_HEIGHT = 48;
const REFERENCE_WIDTH = 402;
/**
 * `1928:1076` is 540 tall over a curve at 440 — the photo continues 100pt under the sheet. In the
 * keyboard frames it is the same 402 × 540 photo moved UP (y −172 / −222 / −250) so it runs 110pt
 * under the raised curve: the band is a re-crop that keeps the pan and hands, never a squash.
 */
const PHOTO_UNDER_SHEET = 100;
const PHOTO_UNDER_SHEET_KEYBOARD = 110;
const REFERENCE_PHOTO_HEIGHT = 540;
/** Every keyboard frame puts the content 56pt below the curve (`1945:1380` → `1945:1381`, …). */
const CURVE_LEAD_KEYBOARD = 56;
/** The hero area's height in the reference frame (the curve's y). */
const REFERENCE_HERO = 440;
/** "the bottom of the last element sits 16px above the keyboard". */
const KEYBOARD_GAP = 16;

export function LoginShell({
  keyboardHeight,
  contentFromBottom,
  curveLead,
  intro = false,
  overlay,
  children,
  testID = 'login-shell',
}: LoginShellProps) {
  const { width, height } = useWindowDimensions();
  const keyboardOpen = keyboardHeight > 0;
  const hidePhoto = keyboardOpen && height <= SMALL_PHONE_HEIGHT;
  const [heroHeight, setHeroHeight] = useState(0);

  const curveHeight = (CURVE_HEIGHT * width) / REFERENCE_WIDTH;
  // The photo keeps the height it has with the keyboard closed, so opening it only moves the crop.
  const photoHeight = Math.max(
    (REFERENCE_PHOTO_HEIGHT * width) / REFERENCE_WIDTH,
    height - contentFromBottom - curveLead + PHOTO_UNDER_SHEET,
  );

  /*
   * Dev note `1949:2258`: "tapping the photo band or dragging the sheet down closes the keyboard".
   * A tap anywhere outside the field and its buttons also counts as leaving the field, which is
   * what raises the invalid-number message on Login.
   */
  const [dragToDismiss] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Keyboard.isVisible() && gesture.dy > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderRelease: () => Keyboard.dismiss(),
    }),
  );

  return (
    <View style={styles.screen} testID={testID} {...dragToDismiss.panHandlers}>
      <Pressable
        style={styles.hero}
        onPress={Keyboard.dismiss}
        accessible={false}
        onLayout={(event) => setHeroHeight(event.nativeEvent.layout.height)}
        testID={`${testID}-hero`}
      >
        {hidePhoto ? null : (
          <HeroPhoto
            intro={intro}
            height={photoHeight}
            underSheet={keyboardOpen ? PHOTO_UNDER_SHEET_KEYBOARD : PHOTO_UNDER_SHEET}
          />
        )}
        <LinearGradient
          colors={['rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']}
          style={styles.fade}
          pointerEvents="none"
        />
        {heroHeight > 0 ? (
          <Badges scale={heroHeight / REFERENCE_HERO} intro={intro} hidden={keyboardOpen} />
        ) : null}
      </Pressable>

      <View style={styles.sheet}>
        {/* Everything below the curve is plain white; only the curved edge is an image. */}
        <View style={[styles.sheetFill, { top: curveHeight - 1 }]} />
        <Image
          source={LOGIN_ART.sheetCurve}
          style={[styles.curve, { width, height: curveHeight }]}
          accessibilityIgnoresInvertColors
        />
        <Pressable
          onPress={Keyboard.dismiss}
          accessible={false}
          style={[
            styles.body,
            { marginTop: keyboardOpen ? CURVE_LEAD_KEYBOARD : curveLead },
            keyboardOpen
              ? { paddingBottom: keyboardHeight + KEYBOARD_GAP }
              : { height: contentFromBottom },
          ]}
          testID={`${testID}-sheet`}
        >
          {children}
        </Pressable>
      </View>

      {overlay}
    </View>
  );
}

/**
 * Where floating controls sit over the photo: `1934:1319` Back is at y 62 in a 402 × 874 frame —
 * the iPhone 17 Pro's own size, whose top safe-area inset is 62. Anchoring to the inset puts it
 * exactly there on that phone and clear of the status bar on every other; 28 keeps it off the edge
 * on phones without a notch.
 */
export function useOverlayTop(): number {
  const { top } = useSafeAreaInsets();
  return Math.max(top, 28);
}

/* ---------------------------------------------------------------------------------------------- */

/**
 * `1928:1076` — the photograph, drawn `object-cover` and running 100pt under the curve.
 *
 * Intro (Login only, dev note `1949:2203`): "the photo slowly zooms from 100% to 110% and drifts up
 * 10px over 6 s (ease in-out), then holds". Figma's prototype loops it; the note says once, and the
 * note is the spec. Under Reduce Motion it rests at the end state.
 */
function HeroPhoto({
  intro,
  height,
  underSheet,
}: {
  intro: boolean;
  height: number;
  underSheet: number;
}) {
  const progress = useTimeline({ durationMs: 6000 });
  const motion = intro
    ? keyframedStyle(progress, {
        translateY: [
          [0, 0, 'inOut'],
          [100, -10],
        ],
        scale: [
          [0, 1, 'inOut'],
          [100, 1.1],
        ],
      })
    : null;

  return (
    <Animated.View
      style={[styles.photo, { height, bottom: -underSheet }, motion]}
      pointerEvents="none"
    >
      <Image
        source={LOGIN_ART.hero}
        style={styles.photoImage}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
    </Animated.View>
  );
}

/* ---------------------------------------------------------------------------------------------- */

interface BadgeSpec {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: ImageSourcePropType;
  readonly well: string;
  /** Rotated box position in the reference frame (`left`/`top` of the rotated wrapper). */
  readonly x: number;
  readonly y: number;
  /** Degrees: the left column tilts −3°, the right +3°. */
  readonly tilt: number;
  /** Intro: when the badge starts to appear (% of the 6 s timeline) and when it lands. */
  readonly appearAt: number;
  readonly landAt: number;
  /** The idle float's amplitude, 3 or 4pt. */
  readonly float: number;
}

/**
 * The four badges, in Figma's own order of appearance. Copy is fixed: "Female cooks only" and
 * "Background verified" are promises to customers (dev note `1949:2203`).
 */
const BADGES: readonly BadgeSpec[] = [
  {
    id: 'trained',
    title: 'Trained for all needs',
    subtitle: 'Full-time, in-house cooks',
    icon: LOGIN_ART.done,
    well: C.tint,
    x: 16,
    y: 320.89,
    tilt: -3,
    appearAt: 10,
    landAt: 18.333,
    float: 4,
  },
  {
    id: 'arrival',
    title: '15-min arrival',
    subtitle: 'A cook at your door',
    icon: LOGIN_ART.instant,
    well: C.positive,
    x: 231.7,
    y: 392,
    tilt: 3,
    appearAt: 15,
    landAt: 23.333,
    float: 3,
  },
  {
    id: 'verified',
    title: 'Background verified',
    subtitle: 'Every cook, before hire',
    icon: LOGIN_ART.lock,
    well: C.positiveSubtle,
    x: 207.7,
    y: 138,
    tilt: 3,
    appearAt: 20,
    landAt: 28.333,
    float: 3,
  },
  {
    id: 'female',
    title: 'Female cooks only',
    subtitle: 'For your comfort at home',
    icon: LOGIN_ART.profile,
    well: C.subtle,
    x: 16,
    y: 186.58,
    tilt: -3,
    appearAt: 25,
    landAt: 33.333,
    float: 4,
  },
];

const INTRO_MS = 6000;
/** Figma's idle float: 1.5 s up, 1.5 s down, ease in-out. */
const FLOAT_HALF_MS = 1500;

function Badges({ scale, intro, hidden }: { scale: number; intro: boolean; hidden: boolean }) {
  const progress = useTimeline({ durationMs: INTRO_MS });
  const [opacity] = useState(() => new Animated.Value(hidden ? 0 : 1));

  // Dev note `1949:2258`: "badges fade out in 150 ms and are hidden" while typing.
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: hidden ? 0 : 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [hidden, opacity]);

  // Right-column badges are placed from the frame's right edge, so a wider phone keeps them on it.
  const rightInset = (x: number) => REFERENCE_WIDTH - x;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents="none">
      {BADGES.map((badge) => {
        const entry: MotionPart = {
          opacity: [
            [0, 0],
            [badge.appearAt, 0, 'out'],
            [badge.appearAt + 7.5, 1],
            [100, 1],
          ],
          translateY: [
            [0, 16],
            [badge.appearAt, 16, 'out'],
            [badge.landAt, 0],
            [100, 0],
          ],
        };
        const right = badge.tilt > 0;
        return (
          <Animated.View
            key={badge.id}
            style={[
              styles.badgeSlot,
              { top: badge.y * scale, ...BADGE_BOXES[badge.id]! },
              right
                ? { right: rightInset(badge.x) - BADGE_BOXES[badge.id]!.width }
                : { left: badge.x },
              intro ? keyframedStyle(progress, entry) : null,
            ]}
            testID={`login-badge-${badge.id}`}
          >
            <Float
              amplitude={badge.float}
              delayMs={(badge.landAt / 100) * INTRO_MS}
              enabled={intro}
            >
              <Badge badge={badge} />
            </Float>
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}

/**
 * Each badge's ROTATED bounding box as the frame draws it (`1923:1290`, `1923:1299`, `1931:1104`,
 * `1931:1076`). Figma positions a tilted layer by this box, so the slot takes its exact size and the
 * pill is centred in it — rotating about the centre then keeps the box where Figma has it. Placing
 * the unrotated pill at the box's corner instead sat every badge ~4.6pt too high.
 */
const BADGE_BOXES: Readonly<Record<string, { width: number; height: number }>> = {
  trained: { width: 181.057, height: 53.308 },
  arrival: { width: 154.094, height: 51.895 },
  verified: { width: 178.062, height: 53.151 },
  female: { width: 182.056, height: 53.36 },
};

/** "then float up and down 3 to 4px" — starts once the badge has landed; off under Reduce Motion. */
function Float({
  amplitude,
  delayMs,
  enabled,
  children,
}: {
  amplitude: number;
  delayMs: number;
  enabled: boolean;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const [value] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!enabled || reduce) {
      value.setValue(0);
      return undefined;
    }
    const half = (toValue: number) =>
      Animated.timing(value, {
        toValue,
        duration: FLOAT_HALF_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      });
    const loop = Animated.loop(Animated.sequence([half(1), half(0)]));
    const timer = setTimeout(() => loop.start(), delayMs);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [enabled, reduce, delayMs, value]);

  const translateY = value.interpolate({ inputRange: [0, 1], outputRange: [0, -amplitude] });
  return <Animated.View style={{ transform: [{ translateY }] }}>{children}</Animated.View>;
}

/** `Sticker · …` — white pill, Elevation/2, a 36pt icon well and two lines of copy, tilted ±3°. */
function Badge({ badge }: { badge: BadgeSpec }) {
  return (
    <View
      style={[styles.badge, { transform: [{ rotate: `${badge.tilt}deg` }] }]}
      accessible
      accessibilityLabel={`${badge.title}. ${badge.subtitle}`}
    >
      <View style={[styles.well, { backgroundColor: badge.well }]}>
        <Image source={badge.icon} style={styles.wellIcon} accessibilityIgnoresInvertColors />
      </View>
      {/* Android measures Livvic a hair narrower than it draws it, so a pill sized to its copy
          wrapped the last word onto a hidden line ("Trained for all"). One line, `simple`
          breaking, as on the Account labels. */}
      <View>
        <Text style={styles.badgeTitle} numberOfLines={1} textBreakStrategy="simple">
          {badge.title}
        </Text>
        <Text style={styles.badgeSubtitle} numberOfLines={1} textBreakStrategy="simple">
          {badge.subtitle}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.base, overflow: 'hidden' },
  hero: { flex: 1, overflow: 'visible' },
  photo: { position: 'absolute', left: 0, right: 0 },
  photoImage: { width: '100%', height: '100%' },
  /** `1928:12749` "Hero fade · top" — 150pt, white 85 % → 0, under the status bar. */
  fade: { position: 'absolute', top: 0, left: 0, right: 0, height: 150 },
  sheet: {},
  sheetFill: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.base },
  curve: { position: 'absolute', top: 0, left: 0 },
  body: {
    backgroundColor: 'transparent',
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  badgeSlot: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 4,
    paddingRight: 16,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: C.base,
    ...SHADOW_PILL,
  },
  well: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wellIcon: { width: 20, height: 20 },
  /** Spoon/Caption Strong — SemiBold 12/16. */
  badgeTitle: { fontFamily: F.semibold, fontSize: 12, lineHeight: 16, color: C.text },
  /** Spoon/Micro — Regular 10/14 at 60 %. */
  badgeSubtitle: { fontFamily: F.regular, fontSize: 10, lineHeight: 14, color: C.textSecondary },
});
