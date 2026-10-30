import { useState } from 'react';
import { Animated, Image, StyleSheet, Text as RNText, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import { LOADING_INTRO_HERO, LOADING_INTRO_LOGO, Text, TossLoading, lightTheme } from '@ui';
import { keyframedStyle, useTimeline } from '@ui/motion/keyframes';
import { C, T } from '@ui/v2/theme';

import { CAROUSEL_ART } from '../art';
import {
  CAROUSEL_DISHES,
  CAROUSEL_DOTS,
  CAROUSEL_LOOP_MS,
  CAROUSEL_SHADOWS,
} from '../motion/timelines';

/**
 * The DESIGNED loading surfaces: the app-launch toss (`2692:864`), the interstitial (`71:747`) and
 * payment confirmation (`2702:855`), Figma page `2539:15531` for the first and last.
 *
 * These replace a generic spinner wherever a whole screen is waiting. Task §13: the file draws
 * real loading states, so they are used rather than approximated with the shared `Skeleton`.
 *
 * BOUNDARY: no screen here decides anything. Readiness is governed by `src/app/_layout.tsx`,
 * which holds until the session resolves and Livvic has loaded. Nothing here advances navigation
 * (FRONTEND_FOUNDATION_PLAN.md §18). The motion is a loop on the native driver and rests at its
 * first frame under Reduce Motion (`useTimeline`).
 */

/** Both animated frames are drawn on a 402pt-wide phone. */
const FRAME_WIDTH = 402;

/** The width a layout pass measured; 0 until it has run. */
function useMeasured() {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  };
  return [box, onLayout] as const;
}

/* ------------------------------------------------------------------------- splash */

/**
 * The app opening — the toss (`2692:864`, `@ui`'s `TossLoading`), held by the boot gate while the
 * session, the profile gate and the address gate resolve. The same screen every other full-screen
 * wait shows (`LoadingState`'s `screen` variant).
 */
export interface SplashLoadingProps {
  readonly testID?: string;
}

export function SplashLoading({ testID = 'splash-loading' }: SplashLoadingProps) {
  return <TossLoading label="Loading Spoon" testID={testID} />;
}

/* ------------------------------------------------------------------- interstitial */

export interface IntroLoadingProps {
  /** `73:1062` — "Best cooks in town!". Supplied so the line can be varied per surface. */
  readonly headline?: string;
  readonly testID?: string;
}

export function IntroLoading({
  headline = 'Best cooks in town!',
  testID = 'intro-loading',
}: IntroLoadingProps) {
  return (
    <View
      style={styles.intro}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={headline}
      accessibilityState={{ busy: true }}
    >
      <Image
        source={LOADING_INTRO_LOGO}
        style={styles.introLogo}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />

      <Text variant="displayHero" color="textPrimary" align="right" style={styles.introHeadline}>
        {headline}
      </Text>

      <Image
        source={LOADING_INTRO_HERO}
        style={styles.introHero}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

/* ------------------------------------------------------ confirmation in progress */

/**
 * `2702:855` "Payment confirmation · Loading (dish carousel)".
 *
 * The few seconds between a verified payment and a booking the server has confirmed (V7 founder
 * comment, task §9). Six dishes take turns on a plate, each swinging in from the side as the last
 * swings out, over three bouncing dots and a note not to leave. There is no header, back control
 * or CTA: there is nothing to do on it.
 *
 * Layout: the dishes travel inside y 257–500 of the 402pt frame, which is drawn as one canvas
 * scaled to the screen's width; the copy (`2712:5832`) is real text under it, and the pair is
 * centred.
 *
 * MOTION: `get_motion_context` — dishes, shadows and dots on one 4.5s loop (`motion/timelines.ts`).
 *
 * BOUNDARY: this component renders. It does not poll, does not decide that a booking is
 * confirmed, and does not navigate — see `app/(app)/booking/confirming.tsx`, which owns all three
 * and reads them off the server.
 */
export interface ConfirmationLoadingProps {
  /** `2712:5833` — "Confirming your payment". */
  readonly title?: string;
  readonly testID?: string;
}

const STAGE_TOP = 257;
const STAGE_HEIGHT = 243;

const DISHES = ['rajma', 'chole', 'parathe', 'salad', 'pasta', 'biryani'] as const;
const DOTS = ['first', 'second', 'third'] as const;

/** Only the title and note keep to one line; Android measures Livvic a hair narrow. */
const ONE_LINE = { numberOfLines: 1, textBreakStrategy: 'simple' } as const;

export function ConfirmationLoading({
  title = 'Confirming your payment',
  testID = 'confirmation-loading',
}: ConfirmationLoadingProps) {
  const [box, onLayout] = useMeasured();
  const progress = useTimeline({ durationMs: CAROUSEL_LOOP_MS, loop: true, restAt: 0 });
  const scale = box.width > 0 ? box.width / FRAME_WIDTH : 1;

  return (
    <View
      style={styles.confirming}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={title}
      accessibilityState={{ busy: true }}
    >
      <View
        style={[styles.stage, { height: STAGE_HEIGHT * scale }]}
        onLayout={onLayout}
        pointerEvents="none"
      >
        <View
          style={[
            styles.stageFrame,
            {
              left: (box.width - FRAME_WIDTH) / 2,
              top: (STAGE_HEIGHT * scale - STAGE_HEIGHT) / 2,
              transform: [{ scale }],
            },
          ]}
        >
          {/* `2702:856` Shadows, then `2702:857` Dishes over them. */}
          {DISHES.map((dish) => (
            <Animated.View
              key={`shadow-${dish}`}
              style={[styles.dishShadow, keyframedStyle(progress, CAROUSEL_SHADOWS[dish])]}
            >
              <View style={styles.dishShadowEllipse} />
            </Animated.View>
          ))}
          {DISHES.map((dish) => (
            <Animated.Image
              key={dish}
              source={CAROUSEL_ART[dish]}
              style={[styles.dish, keyframedStyle(progress, CAROUSEL_DISHES[dish])]}
            />
          ))}
        </View>
      </View>

      {/* `2712:5832` */}
      <View style={styles.copy}>
        <RNText style={styles.copyTitle} {...ONE_LINE} adjustsFontSizeToFit>
          {title}
        </RNText>
        <RNText style={styles.copyBody}>Hang tight, this only takes a few seconds.</RNText>

        {/* `2712:5835` */}
        <View style={styles.dots}>
          {DOTS.map((dot) => (
            <Animated.View
              key={dot}
              style={[styles.dot, keyframedStyle(progress, CAROUSEL_DOTS[dot])]}
            />
          ))}
        </View>

        {/* `2712:5839` */}
        <View style={styles.note}>
          <Image source={CAROUSEL_ART.lock} style={styles.noteIcon} />
          <RNText style={styles.noteText} {...ONE_LINE}>
            Please don’t press back or close the app
          </RNText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** `71:887` — a flat `#EAF086` ground. */
  intro: { flex: 1, alignItems: 'center', backgroundColor: lightTheme.colors.surfaceLoading },
  /** `73:1035` — 130 × 130, centred, 39.5pt down. */
  introLogo: { width: 130, height: 130, marginTop: 39.5 },
  /** `73:1062` — Livvic Black 36/45 at −0.9, right-aligned 21pt in from the edge. */
  introHeadline: { alignSelf: 'stretch', paddingRight: 21, marginTop: 23 },
  /** `73:894` — full width from y 273 to past the frame bottom; cropped, never stretched. */
  introHero: { alignSelf: 'stretch', flex: 1, minHeight: 300, marginTop: 58, width: '100%' },
  /** `2702:855` — white; the stage and copy are centred together. */
  confirming: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.base,
  },
  stage: { alignSelf: 'stretch' },
  /** y 257–500 of the 402pt frame, scaled about its centre. */
  stageFrame: { position: 'absolute', width: FRAME_WIDTH, height: STAGE_HEIGHT },
  /** `2702:868` … `2702:990` — 170 × 170 at (116, 287). */
  dish: { position: 'absolute', left: 116, top: 287 - STAGE_TOP, width: 170, height: 170 },
  /** `2702:1022` … `2702:1027` — 124 × 14 at (139, 475), black at 12 %. */
  dishShadow: { position: 'absolute', left: 139, top: 475 - STAGE_TOP, width: 124, height: 14 },
  dishShadowEllipse: {
    position: 'absolute',
    left: 0,
    top: -55,
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: 'rgba(0,0,0,0.12)',
    transform: [{ scaleY: 14 / 124 }],
  },
  /** `2712:5832` — 303 wide, 10pt apart; 72pt under the dishes' travel (y 500 → 572). */
  copy: { width: 303, alignItems: 'center', gap: 10, marginTop: 72 },
  copyTitle: { ...T.display, color: C.text, textAlign: 'center' },
  copyBody: { ...T.body, color: C.text, textAlign: 'center', width: 300 },
  /** `2712:5835` — three 10pt dots across 46pt, 12pt above and 8pt below. */
  dots: {
    width: 46,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 8,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.brand },
  /** `2712:5839` — a `#FFF7CC` pill, 6 × 12 padding, 6pt between the lock and the line. */
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 9999,
    backgroundColor: C.subtle,
  },
  noteIcon: { width: 16, height: 16 },
  noteText: { ...T.captionStrong, color: C.text },
});
