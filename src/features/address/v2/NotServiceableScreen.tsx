import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ADDRESS_ART } from './art';
import { PrimaryButton } from './components';
import type { NotServiceablePlace } from './notServiceableStore';
import { C, SHADOW_1, SHADOW_2, T } from './theme';

/** Dev note `2214:4364`: "Auto-redirect … after 3s; the bar fills over the 3s." */
export const NOT_SERVICEABLE_REDIRECT_MS = 3000;

/**
 * Address · Not serviceable — Figma `2214:4260`, dev note `2214:4364`.
 *
 * Shown after Confirm location when the server answers `outside_service_area`. Nothing is saved as
 * an address; the server has already remembered the place as demand. The hero map is static art
 * (its pins are not tappable) with the live areas and the customer's locality written onto it.
 *
 * The bar fills over 3s and then `onTimeout` takes the customer Home; "Go to home now" skips the
 * wait. Back and "Try a different location" cancel the redirect and return to the map, pin kept.
 */
export interface NotServiceableScreenProps {
  readonly place: NotServiceablePlace;
  readonly onBack: () => void;
  readonly onGoHome: () => void;
  readonly onTimeout: () => void;
  readonly testID?: string;
}

export function NotServiceableScreen({
  place,
  onBack,
  onGoHome,
  onTimeout,
  testID = 'not-serviceable',
}: NotServiceableScreenProps) {
  const { top, bottom } = useSafeAreaInsets();
  const [progress] = useState(() => new Animated.Value(0));
  const [secondsLeft, setSecondsLeft] = useState(NOT_SERVICEABLE_REDIRECT_MS / 1000);
  const locality = place.locality ?? 'your area';

  useEffect(() => {
    const fill = Animated.timing(progress, {
      toValue: 1,
      duration: NOT_SERVICEABLE_REDIRECT_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    fill.start();
    const tick = setInterval(() => setSecondsLeft((left) => Math.max(1, left - 1)), 1000);
    const done = setTimeout(onTimeout, NOT_SERVICEABLE_REDIRECT_MS);
    return () => {
      fill.stop();
      clearInterval(tick);
      clearTimeout(done);
    };
  }, [onTimeout, progress]);

  const [first, second] = place.liveAreas;
  /**
   * The scene is drawn at the frame's 370 × 188. A card narrower than that (a 360pt phone) scales
   * the whole drawing down to fit rather than cutting its right side off ("You · Indiranag").
   */
  const [heroWidth, setHeroWidth] = useState(SCENE_WIDTH);
  const sceneScale = Math.min(1, heroWidth / SCENE_WIDTH);

  return (
    <View style={styles.screen} testID={testID}>
      <LinearGradient colors={['#FFF4BF', '#FFFFFF']} style={styles.backdrop} />
      <Image source={ADDRESS_ART.nsHaloA} style={styles.haloA} />
      <Image source={ADDRESS_ART.nsHaloB} style={styles.haloB} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: top }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.back, SHADOW_2, pressed && styles.pressed]}
            testID={`${testID}-back`}
          >
            <Image source={ADDRESS_ART.chevronLeft} style={styles.icon24} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <View
            style={[styles.hero, { height: SCENE_HEIGHT * sceneScale }, SHADOW_1]}
            pointerEvents="none"
            onLayout={(event) => setHeroWidth(event.nativeEvent.layout.width)}
          >
            <View
              style={[
                styles.scene,
                {
                  // A transform scales about the centre: shift so the top-left stays put.
                  left: -1 - (SCENE_WIDTH * (1 - sceneScale)) / 2,
                  top: -1 - (SCENE_HEIGHT * (1 - sceneScale)) / 2,
                  transform: [{ scale: sceneScale }],
                },
              ]}
            >
              <Image source={ADDRESS_ART.nsMapArt} style={styles.mapArt} />
              {first === undefined ? null : (
                <>
                  <Image source={ADDRESS_ART.nsHubPin} style={[styles.hubPin, styles.pinA]} />
                  <LiveLabel name={first} style={styles.labelA} />
                </>
              )}
              {second === undefined ? null : (
                <>
                  <Image source={ADDRESS_ART.nsHubPin} style={[styles.hubPin, styles.pinB]} />
                  <LiveLabel name={second} style={styles.labelB} />
                </>
              )}
              <View style={[styles.youPin, SHADOW_2]}>
                <Image source={ADDRESS_ART.locationFill} style={styles.icon24} />
              </View>
              <View style={[styles.youLabel, SHADOW_2]}>
                <Text style={styles.youText} numberOfLines={1}>
                  You · {locality}
                </Text>
              </View>
              <View style={[styles.cook, SHADOW_2]}>
                <Image source={ADDRESS_ART.nsCookVisit} style={styles.icon20} />
              </View>
              <View style={styles.sticker}>
                <Text style={styles.stickerText}>Not here yet!</Text>
              </View>
            </View>
          </View>

          <View style={styles.titles}>
            <Text style={styles.overline}>LOCATION NOT SERVICEABLE</Text>
            <Text style={styles.title} accessibilityRole="header">
              We’re not in {locality} yet
            </Text>
            <Text style={styles.bodyText}>
              {place.liveAreas.length === 0
                ? 'Spoon isn’t live near you yet.'
                : `Spoon is live in ${joinAreas(place.liveAreas)} right now.`}{' '}
              Your location is saved and counts towards where we launch next.
            </Text>
          </View>

          <View style={[styles.saved, SHADOW_1]} testID={`${testID}-place`}>
            <Image source={ADDRESS_ART.placeBadge} style={styles.badge48} />
            <View style={styles.savedText}>
              <Text style={styles.bodyStrong} numberOfLines={1}>
                {place.title}
              </Text>
              {place.line === '' ? null : (
                <Text style={styles.caption} numberOfLines={1}>
                  {place.line}
                </Text>
              )}
            </View>
            <View style={styles.savedBadge}>
              <Image source={ADDRESS_ART.nsDone} style={styles.icon14} />
              <Text style={styles.captionStrong}>Saved</Text>
            </View>
          </View>

          <View style={styles.demand} testID={`${testID}-demand`}>
            <View style={styles.avatars}>
              {AVATARS.map((avatar, index) => (
                <View
                  key={avatar.letter}
                  style={[
                    styles.avatar,
                    { backgroundColor: avatar.color },
                    index < AVATARS.length - 1 && styles.avatarOverlap,
                  ]}
                >
                  <Text style={styles.microStrong}>{avatar.letter}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.bodyStrong, styles.flex]}>
              {place.neighbours === 0
                ? `You’re the first to ask for Spoon in ${locality}`
                : `You + ${String(place.neighbours)} ${
                    place.neighbours === 1 ? 'neighbour wants' : 'neighbours want'
                  } Spoon in ${locality}`}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 8 + bottom }]}>
        <View style={styles.redirect}>
          <View style={styles.track}>
            <Animated.View
              style={[
                styles.fill,
                {
                  width: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
              testID={`${testID}-progress`}
            />
          </View>
          <Text style={[styles.caption, styles.center]}>
            Taking you to Spoon home in {String(secondsLeft)}s…
          </Text>
        </View>
        <PrimaryButton label="Go to home now" onPress={onGoHome} testID={`${testID}-home`} />
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.retry}
          testID={`${testID}-retry`}
        >
          <Text style={styles.link}>Try a different location</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** `2214:4260` — the hero drawing's size in the frame. */
const SCENE_WIDTH = 370;
const SCENE_HEIGHT = 188;

/** "A", "A & B", "A, B & C" — the frame's "HSR Layout & Haralur". */
export function joinAreas(areas: readonly string[]): string {
  if (areas.length <= 1) return areas[0] ?? '';
  return `${areas.slice(0, -1).join(', ')} & ${areas[areas.length - 1] ?? ''}`;
}

/** Decorative, as drawn: three initials standing in for the waiting neighbours. */
const AVATARS = [
  { letter: 'A', color: '#FFD6DB' },
  { letter: 'R', color: '#D4F5E3' },
  { letter: 'S', color: '#D6EDFF' },
] as const;

function LiveLabel({ name, style }: { name: string; style: object }) {
  return (
    <View style={[styles.liveLabel, SHADOW_2, style]}>
      <Image source={ADDRESS_ART.nsLiveDot} style={styles.liveDot} />
      <Text style={styles.microStrong} numberOfLines={1}>
        {name} · Live
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.base },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, height: 470 },
  haloA: { position: 'absolute', left: -90, top: -60, width: 260, height: 260 },
  haloB: { position: 'absolute', left: 260, top: 120, width: 180, height: 180 },
  scroll: { paddingBottom: 24 },
  /** `2214:4260` — a 44pt bar: the Back disc with no vertical padding. */
  topBar: { paddingHorizontal: 16 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.base,
  },
  body: { paddingTop: 8, paddingHorizontal: 16, gap: 16 },
  hero: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.base,
    overflow: 'hidden',
  },
  scene: {
    position: 'absolute',
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    backgroundColor: C.subtle,
  },
  mapArt: { position: 'absolute', left: 0, top: 0, width: 370, height: 188 },
  hubPin: { position: 'absolute', width: 20, height: 20 },
  pinA: { left: 82, top: 86 },
  pinB: { left: 166, top: 140 },
  liveLabel: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: C.base,
  },
  labelA: { left: 39, top: 64 },
  labelB: { left: 135, top: 118 },
  liveDot: { width: 6, height: 6 },
  youPin: {
    position: 'absolute',
    left: 282,
    top: 70,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.base,
  },
  youLabel: {
    position: 'absolute',
    /** `2214:4260` — x 264, 96 wide in the 370 hero: 10pt from its right edge. */
    right: 10,
    top: 114,
    maxWidth: 160,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: C.text,
  },
  youText: { ...T.microStrong, color: C.base },
  cook: {
    position: 'absolute',
    left: 176,
    top: 35,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: C.base,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.brand,
  },
  /**
   * `2214:4260` "Sticker · Coming soon" — 125 × 36, rotated 6° about its top-left corner, so its
   * rotated box starts at (14, 6.4). React Native rotates about the centre, so the unrotated box
   * sits where that centre lands: (78, 30.8) less half its size.
   */
  sticker: {
    position: 'absolute',
    left: 15.5,
    top: 12.8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: C.text,
    transform: [{ rotate: '-6deg' }],
  },
  stickerText: { ...T.button, color: C.brand },
  titles: { gap: 8 },
  overline: { ...T.microStrong, letterSpacing: 0.6, color: C.textSecondary },
  title: { ...T.title, color: C.text },
  bodyText: { ...T.body, color: C.textSecondary },
  saved: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.base,
  },
  badge48: { width: 48, height: 48 },
  savedText: { flex: 1, minWidth: 0, gap: 2 },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 8,
    paddingRight: 10,
    paddingVertical: 4,
    borderRadius: 999,
    // `color/status/positive-subtle`.
    backgroundColor: '#ECFF9B',
  },
  demand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: C.subtle,
  },
  avatars: { flexDirection: 'row' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: C.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOverlap: { marginRight: -8 },
  footer: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  redirect: { gap: 8 },
  retry: { alignSelf: 'center' },
  track: { height: 6, borderRadius: 999, backgroundColor: C.subtle, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 999, backgroundColor: C.brand },
  link: {
    ...T.button,
    color: C.textSecondary,
    textDecorationLine: 'underline',
  },
  bodyStrong: { ...T.bodyStrong, color: C.text },
  caption: { ...T.caption, color: C.textSecondary },
  captionStrong: { ...T.captionStrong, color: C.text },
  microStrong: { ...T.microStrong, color: C.text },
  icon14: { width: 14, height: 14 },
  icon20: { width: 20, height: 20 },
  icon24: { width: 24, height: 24 },
  pressed: { opacity: 0.85 },
});
