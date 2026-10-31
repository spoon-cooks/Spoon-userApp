import { Animated, Image, StyleSheet, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import { Text } from '@ui';
import { keyframedStyle } from '@ui/motion/keyframes';

import { formatRating } from '../../data/rating';
import type { RatingTier, VisitRatingValue } from '../../data/rating';
import { RATING_ART } from './assets';
import { FULL_TURN, IDLE_MARK, STICKER_MOTION } from './ratingMotion';

/**
 * The score sticker beside the mood headline — 96pt (`1501:6705` / `1501:7048` / `1501:7344` …),
 * plus the idle card's 112pt "?" sticker (`1501:6638`).
 *
 *   loved          `1501:6719` scallop at 0,0; 12pt sparkle at 82,0
 *   magic          `1501:7062` 104pt burst at −4,−4; sparkles 12pt at 82,0 and 8pt at −6,80
 *   below par      `1501:7362` blob at 0,4; the numeral's box centred 49.12 down
 *   disappointing  `1501:7508` blob at 0,4; centred 50.24 down
 *   very poor      `1501:7657` blob at 0,4; centred 51.36 down
 *
 * On a blob the numeral is centred across the BLOB, not the 96pt sticker: the blobs are narrower
 * (78 – 88) and sit at its left edge, so a sticker-centred "1" / "0.5" / "1.5" stood 9pt right of
 * its 78pt blob (device test, 31 Oct 2026).
 *
 * Motion (`ratingMotion.ts`): a rated sticker plays its entrance on the card's `clock`; the idle
 * sticker's "?" bobs on the first look's loop while its ring turns on `spin`.
 */

interface BlobSpec {
  readonly source: ImageSourcePropType;
  readonly width: number;
  readonly height: number;
  /** Where the numeral's 96pt box is centred, measured from the sticker's top. */
  readonly centreY: number;
}

const BLOBS: Partial<Record<RatingTier, BlobSpec>> = {
  belowPar: { source: RATING_ART.blobBelowPar, width: 87, height: 72, centreY: 49.12 },
  disappointing: {
    source: RATING_ART.blobDisappointing,
    width: 88,
    height: 68,
    centreY: 50.24,
  },
  veryPoor: { source: RATING_ART.blobVeryPoor, width: 78, height: 68, centreY: 51.36 },
};

export interface ScoreStickerProps {
  readonly tier: Exclude<RatingTier, 'idle'>;
  readonly value: VisitRatingValue;
  /** The card's entrance clock, 0 → 1; the sticker rests drawn without one. */
  readonly clock?: Animated.Value | undefined;
  readonly testID: string;
}

export function ScoreSticker({ tier, value, clock, testID }: ScoreStickerProps) {
  const blob = BLOBS[tier];
  const centreY = blob?.centreY ?? 48;
  const centreX = blob === undefined ? 48 : blob.width / 2;
  const motion = STICKER_MOTION[tier];
  const animate = (part: Parameters<typeof keyframedStyle>[1] | undefined) =>
    clock === undefined || part === undefined ? null : keyframedStyle(clock, part);

  return (
    <View style={styles.sticker} testID={testID}>
      {tier === 'loved' ? (
        <Animated.Image
          source={RATING_ART.scallopHigh}
          style={[styles.scallop, animate(motion.shape)]}
        />
      ) : null}
      {tier === 'magic' ? (
        <Animated.Image
          source={RATING_ART.burstTop}
          style={[styles.burst, animate(motion.shape)]}
        />
      ) : null}
      {blob ? (
        <Animated.Image
          source={blob.source}
          style={[styles.blob, { width: blob.width, height: blob.height }, animate(motion.shape)]}
        />
      ) : null}
      <Animated.View
        style={[styles.numeral, { left: centreX - 48, top: centreY - 48 }, animate(motion.numeral)]}
        testID={`${testID}-numeral`}
      >
        <Text variant="spoonDisplayLarge" align="center">
          {formatRating(value)}
        </Text>
      </Animated.View>
      {tier === 'loved' ? (
        <Animated.Image
          source={RATING_ART.sparkleHigh}
          style={[styles.sparkleTopRight, animate(motion.sparkles[0])]}
        />
      ) : null}
      {tier === 'magic' ? (
        <>
          <Animated.Image
            source={RATING_ART.sparkleTopLarge}
            style={[styles.sparkleTopRight, animate(motion.sparkles[0])]}
          />
          <Animated.Image
            source={RATING_ART.sparkleTopSmall}
            style={[styles.sparkleBottomLeft, animate(motion.sparkles[1])]}
          />
        </>
      ) : null}
    </View>
  );
}

/**
 * `1501:6638` — the idle 112pt sticker: dashed ring, bobbing "?", two sparkles. `clock` is the
 * first look's 2 s loop, `spin` the ring's endless turn.
 */
export function IdleSticker({
  clock,
  spin,
  testID,
}: {
  readonly clock?: Animated.Value | undefined;
  readonly spin?: Animated.Value | undefined;
  readonly testID: string;
}) {
  return (
    <View style={styles.idle} testID={testID}>
      <Animated.Image
        source={RATING_ART.idleRing}
        style={[styles.idleRing, spin ? keyframedStyle(spin, { rotate: FULL_TURN }) : null]}
      />
      <Animated.View style={[styles.idleMark, clock ? keyframedStyle(clock, IDLE_MARK) : null]}>
        <Text variant="ratingPlaceholder" color="textRatingPlaceholder" align="center">
          ?
        </Text>
      </Animated.View>
      <Image source={RATING_ART.idleSparkleLarge} style={styles.idleSparkleLarge} />
      <Image source={RATING_ART.idleSparkleSmall} style={styles.idleSparkleSmall} />
    </View>
  );
}

const styles = StyleSheet.create({
  sticker: { width: 96, height: 96 },
  scallop: { position: 'absolute', left: 0, top: 0, width: 96, height: 96 },
  /** `1501:7062` — 104pt, 4pt proud of the sticker on every side. */
  burst: { position: 'absolute', left: -4, top: -4, width: 104, height: 104 },
  /** `1501:7362` … — the blob sits 4pt down; its size is the export box. */
  blob: { position: 'absolute', left: 0, top: 4 },
  numeral: {
    position: 'absolute',
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkleTopRight: { position: 'absolute', left: 82, top: 0, width: 12, height: 12 },
  sparkleBottomLeft: { position: 'absolute', left: -6, top: 80, width: 8, height: 8 },
  idle: { width: 112, height: 112 },
  /** `1501:6642` — 104pt at 4,4. */
  idleRing: { position: 'absolute', left: 4, top: 4, width: 104, height: 104 },
  /** `1501:6655` — the 40/28 "?" centred on the 112 box. */
  idleMark: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idleSparkleLarge: { position: 'absolute', left: 96, top: 2, width: 14, height: 14 },
  idleSparkleSmall: { position: 'absolute', left: 2, top: 90, width: 8, height: 8 },
});
