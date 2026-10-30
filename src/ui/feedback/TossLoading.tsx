import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import type { ImageSourcePropType, LayoutChangeEvent } from 'react-native';

import { keyframedStyle, useTimeline } from '@ui/motion/keyframes';
import { TOSS, TOSS_LOOP_MS } from '@ui/motion/tossTimeline';
import { C } from '@ui/v2/theme';

/**
 * The loading screen — Figma `2692:864` "Loading / App launch — v4 · Tight toss" (page
 * `2539:15531`): veggies tossed in a pan on a yellow wash.
 *
 * The one full-screen wait in the app (owner, 30 Oct 2026: "use the same loading screen which we
 * use at splash"): the app opening (`SplashLoading`) and every screen whose first read is still
 * in flight (`LoadingState`'s `screen` variant, which `QueryBoundary` uses by default). It lives
 * here rather than in `@features/loading` so the token layer can draw it without importing a
 * feature.
 *
 * The frame is a 402 × 874 canvas with every layer absolutely placed, so it is drawn as exactly
 * that, scaled to the box's width and centred on its height; the wash fills the box edge to edge.
 * The frame's title, subtitle, glow, chilli, peas and sizzle dots are hidden in the file and are
 * not drawn.
 *
 * MOTION: `get_motion_context` — nine layers on one 1.34s loop (`motion/tossTimeline.ts`), on the
 * native driver, resting on its first frame under Reduce Motion.
 */

const img = (source: unknown) => source as ImageSourcePropType;

/** Rasterised at 3× from each layer's own SVG (`assets/figma/loading/`). */
const ART = {
  /** `2692:868` — 410 × 300: the handle overhangs the 402pt frame by 8pt on the left. */
  panBack: img(require('../../../assets/figma/loading/pan-back.webp')),
  /** `2692:912` — 402 × 300, the near rim drawn over the veggies. */
  panFront: img(require('../../../assets/figma/loading/pan-front.webp')),
  tomato: img(require('../../../assets/figma/loading/veg-tomato.webp')),
  /** 66 × 60: the stem runs 6pt past the 60pt box. */
  brinjal: img(require('../../../assets/figma/loading/veg-brinjal.webp')),
  cauliflower: img(require('../../../assets/figma/loading/veg-cauliflower.webp')),
  onion: img(require('../../../assets/figma/loading/veg-onion.webp')),
  carrot: img(require('../../../assets/figma/loading/veg-carrot.webp')),
  paneer: img(require('../../../assets/figma/loading/veg-paneer.webp')),
};

const FRAME_WIDTH = 402;
const FRAME_HEIGHT = 874;

/** `2692:864` fill — `linear-gradient(0deg, …)`, symmetric about the middle. */
const WASH = {
  colors: [C.border, C.tint, C.brand, C.tint, C.border] as const,
  locations: [0, 0.24092, 0.43178, 0.64432, 1] as const,
};

/** Each veggie's 60pt box in the frame. The brinjal's is its 75.6pt rotated bound, re-centred. */
const VEGGIES = [
  { key: 'tomato', left: 163.06, top: 343.21 },
  { key: 'brinjal', left: 197.74, top: 356.05 },
  { key: 'cauliflower', left: 256.42, top: 422.14 },
  { key: 'onion', left: 222.96, top: 408.46 },
  { key: 'carrot', left: 195.57, top: 426.6 },
  { key: 'paneer', left: 228.59, top: 344.84 },
] as const;

export interface TossLoadingProps {
  /** What a screen reader announces. */
  readonly label?: string;
  readonly testID?: string;
}

export function TossLoading({ label = 'Loading', testID }: TossLoadingProps) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const progress = useTimeline({ durationMs: TOSS_LOOP_MS, loop: true, restAt: 0 });
  const scale = box.width / FRAME_WIDTH;

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  };

  return (
    <View
      style={styles.toss}
      onLayout={onLayout}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
    >
      <LinearGradient
        colors={WASH.colors}
        locations={WASH.locations}
        start={{ x: 0, y: 1 }}
        end={{ x: 0, y: 0 }}
        style={styles.fill}
      />

      {box.width > 0 ? (
        <View
          style={[
            styles.frame,
            {
              left: (box.width - FRAME_WIDTH) / 2,
              top: (box.height - FRAME_HEIGHT) / 2,
              transform: [{ scale }],
            },
          ]}
          pointerEvents="none"
        >
          {/* `2692:867` */}
          <Animated.View style={[styles.panShadow, keyframedStyle(progress, TOSS.panShadow)]}>
            <View style={styles.panShadowEllipse} />
          </Animated.View>

          <Animated.View style={[styles.pan, keyframedStyle(progress, TOSS.panBack)]}>
            <Image source={ART.panBack} style={styles.panBackArt} />
          </Animated.View>

          {VEGGIES.map((veggie) => (
            <Animated.View
              key={veggie.key}
              style={[
                styles.veggie,
                { left: veggie.left, top: veggie.top },
                keyframedStyle(progress, TOSS[veggie.key]),
              ]}
            >
              <Image
                source={ART[veggie.key]}
                style={veggie.key === 'brinjal' ? styles.brinjalArt : styles.veggieArt}
              />
            </Animated.View>
          ))}

          <Animated.View style={[styles.pan, keyframedStyle(progress, TOSS.panFront)]}>
            <Image source={ART.panFront} style={styles.panFrontArt} />
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toss: { flex: 1, overflow: 'hidden', backgroundColor: C.brand },
  fill: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  /** `2692:864` — the 402 × 874 canvas, scaled about its centre. */
  frame: { position: 'absolute', width: FRAME_WIDTH, height: FRAME_HEIGHT },
  /** `2692:867` — 250 × 26 at (111, 531), black at 12 %. */
  panShadow: { position: 'absolute', left: 111, top: 531, width: 250, height: 26 },
  /** An ellipse: a 250pt circle squashed to 26pt (a border radius alone draws a pill). */
  panShadowEllipse: {
    position: 'absolute',
    left: 0,
    top: -112,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(0,0,0,0.12)',
    transform: [{ scaleY: 26 / 250 }],
  },
  /** `2692:868` / `2692:912` — 402 × 300 at (0, 330). */
  pan: { position: 'absolute', left: 0, top: 330, width: FRAME_WIDTH, height: 300 },
  panBackArt: { position: 'absolute', left: -8, top: 0, width: 410, height: 300 },
  panFrontArt: { width: FRAME_WIDTH, height: 300 },
  veggie: { position: 'absolute', width: 60, height: 60 },
  veggieArt: { width: 60, height: 60 },
  brinjalArt: { width: 66, height: 60 },
});
