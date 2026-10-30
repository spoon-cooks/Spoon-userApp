import { useMemo } from 'react';
import { Animated, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { keyframedStyle, useTimeline } from '@ui/motion/keyframes';

import type { FeaturedCookDto } from '../api/featuredCooksApi';
import { ART } from '../assets';
import { TRUST_POINTS } from '../content';
import { C, F, SHADOW_CARD } from '../theme';
import {
  COOKS_CARD_COUNT,
  COOKS_LOOP_MS,
  COOKS_REST_PROGRESS,
  cookCardTracks,
} from './cooksTimeline';

/** `1170:609` — 368 × 305 inside a 368 × 335 stack that leaves 30pt of air above it. */
const CARD = { width: 368, height: 305 };
const STACK_AIR = 30;
/** `inset-[calc(42.62%-0.15px)_-1px_-1px_-1px]` — the band's top, measured inside the border. */
const BAND_TOP = 0.4262 * CARD.height - 0.15 - 1;

/**
 * `1134:604` "Cooks · Meet your cook", animated as `1290:1280`: the cards rise into one spot in
 * turn, each new cook landing in front and pushing the earlier ones up and back into the 30pt of
 * air above the stack, then the stack fades and the loop starts again (`cooksTimeline`). With
 * Reduce Motion on, it holds them all stacked, the last in front.
 *
 * The cooks are the backend's (`GET /v1/cooks/featured`, DEC-114), in its order, read with the
 * rest of Home's data. Until they load, or if there are none, the section is not drawn: the app
 * shows no cook of its own.
 */
export function CooksTrust({ cooks }: { readonly cooks: readonly FeaturedCookDto[] }) {
  const shown = cooks.slice(0, COOKS_CARD_COUNT);
  return shown.length === 0 ? null : <CooksStack cooks={shown} />;
}

function CooksStack({ cooks }: { readonly cooks: readonly FeaturedCookDto[] }) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(CARD.width, width - 32);
  const progress = useTimeline({
    durationMs: COOKS_LOOP_MS,
    loop: true,
    restAt: COOKS_REST_PROGRESS,
  });
  const motion = useMemo(
    () => cooks.map((_, index) => keyframedStyle(progress, cookCardTracks(index, cooks.length))),
    [progress, cooks],
  );

  return (
    <View style={styles.section}>
      <View style={styles.titles}>
        <Text style={styles.eyebrow}>YOUR COOK</Text>
        <Text style={styles.title}>Cooks you can trust</Text>
        <Text style={styles.sub}>
          Every Spoon cook is trained, verified and rated before they reach your kitchen.
        </Text>
      </View>

      {/* The cards come and go on a loop, so a screen reader hears the cooks once, here. */}
      <View
        style={styles.stack}
        accessible
        accessibilityLabel={`Spoon cooks: ${cooks.map(spokenCook).join('; ')}. ${TRUST_POINTS.map((p) => p.title).join(', ')}.`}
      >
        {cooks.map((cook, index) => (
          <Animated.View
            key={cook.displayName}
            style={[styles.slot, { width: cardWidth }, motion[index]]}
            importantForAccessibility="no-hide-descendants"
          >
            <CookCard cook={cook} />
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

function spokenCook(cook: FeaturedCookDto): string {
  return [
    cook.displayName,
    cook.region,
    cook.rating === null ? null : `rated ${cook.rating.toFixed(1)}`,
  ]
    .filter((part): part is string => part !== null)
    .join(', ');
}

function CookCard({ cook }: { readonly cook: FeaturedCookDto }) {
  return (
    <View style={[styles.card, SHADOW_CARD]}>
      <View style={styles.cardHeader}>
        <View style={styles.description}>
          <View style={styles.nameBlock}>
            <Text style={styles.name}>{cook.displayName}</Text>
            {cook.region === null ? null : (
              <Text style={styles.region}>{`Region: ${cook.region}`}</Text>
            )}
          </View>
          {cook.rating === null ? null : (
            <View style={styles.rating}>
              <Text style={styles.ratingText}>{`Rating: ${cook.rating.toFixed(1)}`}</Text>
              <Image source={ART.star} style={styles.star} />
            </View>
          )}
        </View>
        <View style={styles.photoFrame}>
          {cook.photoUrl === null ? null : (
            <Image source={{ uri: cook.photoUrl }} style={styles.photo} resizeMode="contain" />
          )}
        </View>
      </View>

      <View style={styles.band}>
        <Image source={ART.bandCurve} style={styles.curve} resizeMode="stretch" />
        <LinearGradient colors={[C.softer, C.tint]} style={styles.bandBody}>
          {TRUST_POINTS.map((point) => (
            <View key={point.title} style={styles.point}>
              <Image source={ART.check} style={styles.check} />
              <View>
                <Text style={styles.pointTitle}>{point.title}</Text>
                <Text style={styles.pointBody}>{point.body}</Text>
              </View>
            </View>
          ))}
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 16, width: '100%' },
  titles: { gap: 4, paddingHorizontal: 16 },
  eyebrow: {
    fontFamily: F.semibold,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1,
    color: C.textSecondary,
  },
  title: { fontFamily: F.bold, fontSize: 20, lineHeight: 28, color: C.text },
  sub: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.textSecondary },
  /** The 335pt stack; the cards share one spot, 30pt down, the air the earlier cooks rise into. */
  /** 8pt below for the card's shadow, as the old pager left. */
  stack: { height: STACK_AIR + CARD.height, marginHorizontal: 16, marginBottom: 8 },
  slot: { position: 'absolute', top: STACK_AIR, left: 0, height: CARD.height },
  card: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.brand,
    backgroundColor: C.base,
  },
  cardHeader: { padding: 15 },
  description: { width: 231, gap: 8, paddingRight: 8 },
  nameBlock: { gap: 4 },
  name: { fontFamily: F.semibold, fontSize: 18, lineHeight: 26, color: C.text },
  region: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.text },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
  star: { width: 12, height: 12 },
  /** `Header image` — right 16 / top 16 of the header, which is itself inset −1 over the border. */
  photoFrame: {
    position: 'absolute',
    right: 15,
    top: 15,
    width: 100,
    height: 100,
    borderRadius: 16,
    backgroundColor: C.softer,
    overflow: 'hidden',
  },
  photo: { width: 100, height: 100 },
  band: {
    position: 'absolute',
    left: -1,
    right: -1,
    bottom: -1,
    top: BAND_TOP,
    overflow: 'hidden',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  curve: { width: '100%', height: 35 },
  bandBody: { flex: 1, gap: 8, paddingHorizontal: 16, paddingBottom: 16 },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  check: { width: 16, height: 16 },
  pointTitle: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
  pointBody: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.textSecondary },
});
