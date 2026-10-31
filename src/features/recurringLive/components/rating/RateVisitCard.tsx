import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { loadExpoCamera, loadExpoImagePicker } from '@core/native';
import { canUploadRatingMedia } from '@features/booking';
import { Text } from '@ui';
import { keyframedStyle, useTimeline } from '@ui/motion/keyframes';
import { lightTheme } from '@ui/theme/ThemeProvider';

import {
  RATING_CHIPS_NEGATIVE,
  RATING_CHIPS_NEGATIVE_PICKED,
  RATING_CHIPS_POSITIVE,
  RATING_CHIPS_POSITIVE_PICKED,
  RATING_DIFFERENT_COOK,
  RATING_VISIT_FIXTURE,
  ratingTier,
  ratingTierCopy,
} from '../../data/rating';
import type { RatingTier, VisitRatingValue } from '../../data/rating';
import { CONFETTI_ART, RATING_ART } from './assets';
import { FeedbackBlock, SubmittedFeedback } from './feedback/FeedbackBlock';
import { MediaCaptureModal } from './feedback/MediaCaptureModal';
import type { CaptureMode } from './feedback/MediaCaptureModal';
import { MediaSourceSheet } from './feedback/MediaSourceSheet';
import type { MediaSource } from './feedback/MediaSourceSheet';
import { EMPTY_FEEDBACK, photosLeft, videoAllowed } from './feedback/model';
import type { FeedbackDraft, FeedbackMediaItem } from './feedback/model';
import { pickFromGallery } from './feedback/pickFromGallery';
import {
  CONFETTI,
  IDLE_RING_TURN_MS,
  NUDGE_SPARKLE,
  RATING_TIMELINE_MS,
  STICKER_MOTION,
} from './ratingMotion';
import { RatingStars } from './RatingStars';
import { IdleSticker, ScoreSticker } from './ScoreSticker';

/**
 * Rate card — Figma "Ratings" page `1603:50`, components `Rate card / *` (`1517:9293` Idle,
 * `1517:9295` Rated, `1517:9297` 5+, `1517:9301` Poor; dev notes `2238:908` … `2238:935`). One
 * self-contained card; the Visit details · Completed screens drop it into their rating slot.
 *
 * Every drawn state is the SAME card at a different picked score, held as local UI state:
 *   null       Idle — 112pt "?" sticker, empty stars, scale captions, lime 5+ nudge
 *   4 – 5      Rated "Loved it!" — scallop, "What stood out?" chips, the feedback block, Submit
 *   5+         "Off the charts!" — lime wash + confetti, "What made it amazing?", lime Submit
 *   below 4    Poor "We're so sorry" — "What went wrong?", "Show us what went wrong", and
 *              "Prefer a different cook next time?" (ON excludes the cook from future matching)
 * Changing the score swaps badge, headline, subtext and chips in place; picks reset with the band.
 *
 * The feedback block (`2093:6050`, `FeedbackBlock`) records a voice note, takes photos and a video
 * through "Add photos & videos" (M1) and the camera (M3 – M5) or the gallery, and holds a written
 * note. Nothing uploads until Submit: `onSubmit` hands up the score, chips, the different-cook
 * answer and the draft, and the caller uploads the media and sends the rating.
 *
 * Geometry, verbatim:
 *   card     370 wide in the frames (stretches to its slot here), r28, `0 8 24 rgba(0,0,0,0.08)`,
 *            p20 (idle: pt20 / pb24), 20pt between blocks; 5+ washes `#ECFF9B` → white by 34 %,
 *            below 4 `#F3F0E8` → white by 40 %
 *   cook     44pt photo, 12pt gap, SemiBold 14/20 over Caption 12/16 at 55 %, 2pt apart
 *   hero     idle: centred column, 12pt gap; rated: 96pt sticker, 16pt gap, Display 24/32 over
 *            Caption at 55 %, 4pt apart
 *   chips    label SemiBold 12/16 at 70 %, 10pt below it a wrap at 8pt; ticked chips pl10 / pr14
 *            / py8 with a 1.5pt edge (`#FFD600`, or black 25 % on a low score) on `#FFF7CC` with an
 *            18pt check 4pt from the label; unticked px14 / py8, 1pt black 25 % on white
 *   support  pl12 / pr14 / py12, r18, 12pt gap; 36pt white disc, Caption Strong over Micro, 44 × 26
 *            toggle
 *   CTA      52 tall, r26, `#FFD600` (5+: `#CFFF04`), Spoon/Button
 *
 * Motion follows Figma's 2 s timelines (`ratingMotion.ts`): the first look loops; a picked score
 * plays its entrance once, again on every new pick. Reduce Motion rests each on its final frame.
 *
 * The preview draws the frames as drawn. On a real visit (`live`) the card draws the visit's own
 * cook and slot and starts with no chips ticked.
 *
 * `submitted` — `Rate card / Submitted` (`2306:929`, dev note beside it): the same card stays in
 * place, read-only. A lime "Rating submitted" banner leads it; the stars and 5+ take no taps; only
 * the picked chips show; "Your note to <cook>" plays the voice note, opens the photos and video
 * full-screen and reads the words, with nothing to add or delete; there is no Submit. The host
 * flips it on once the rating is sent, keeping what was entered, or mounts it already submitted
 * from the server's copy (`initialRating`, `initialChips`, `initialFeedback`) on a reopened visit.
 */

export interface RateVisitSubmission {
  readonly rating: VisitRatingValue;
  /** Chip keys, as picked under the band's question. */
  readonly chips: readonly string[];
  /** "Prefer a different cook next time?" — only ever true below 4. */
  readonly avoidCook: boolean;
  /** What the Voice / Media / Write block holds: a voice note, photos, a video, words. */
  readonly feedback: FeedbackDraft;
}

/** The visit being rated: the header row and the cook named in the copy. */
export interface RateVisitInfo {
  readonly title: string;
  readonly meta: string;
  /** First name, as the copy uses it ("Meera will be thrilled"). */
  readonly cookName: string;
  readonly photoUri?: string | null;
}

export interface RateVisitCardProps {
  readonly initialRating?: VisitRatingValue | null;
  /** Defaults to the frames' sample visit. */
  readonly visit?: RateVisitInfo;
  /** A real visit — see above. */
  readonly live?: boolean;
  /** Whether the submit is on its way: the CTA reads "Sending…" and takes no taps. */
  readonly submitting?: boolean;
  readonly onSubmit?: (submission: RateVisitSubmission) => void;
  /** The preview's drawn feedback states (`2093:*`); a real visit starts empty. */
  readonly initialFeedback?: FeedbackDraft;
  readonly initialFeedbackFocus?: 'voice' | 'write' | null;
  /** The score as it is picked — the tip card beside it warms up at 4 and above (`2165:14445`). */
  readonly onRatingChange?: (rating: VisitRatingValue | null) => void;
  /** `1501:6636` — "Later" on the first look. Absent: no "Later" link. */
  readonly onLater?: () => void;
  /**
   * Whose copy the first look reads. `visit` (the Recurring frames, `1501:6628`) or `service` — the
   * one-time Service flow's Completed frame (`2165:12076`): "How was the service today?", its own
   * scale hint, no "Later", and the 5+ nudge without a fill. Both read the Ratings page's subtitle.
   */
  readonly variant?: 'visit' | 'service';
  /** The rating has been sent: draw it read-only (`2306:929`). */
  readonly submitted?: boolean;
  /** The chips already picked — a reopened, submitted rating's, from the server. */
  readonly initialChips?: readonly string[];
  readonly testID?: string;
}

const LOW_TIERS: readonly RatingTier[] = ['belowPar', 'disappointing', 'veryPoor'];

export function RateVisitCard({
  initialRating = null,
  visit = RATING_VISIT_FIXTURE,
  live = false,
  submitting = false,
  onSubmit,
  initialFeedback = EMPTY_FEEDBACK,
  initialFeedbackFocus = null,
  onRatingChange,
  onLater,
  variant = 'visit',
  submitted = false,
  initialChips,
  testID = 'rate-visit-card',
}: RateVisitCardProps) {
  const [rating, setRating] = useState<VisitRatingValue | null>(initialRating);
  const [positivePicked, setPositivePicked] = useState<readonly string[]>(
    initialChips ?? (live ? [] : RATING_CHIPS_POSITIVE_PICKED),
  );
  const [negativePicked, setNegativePicked] = useState<readonly string[]>(
    initialChips ?? (live ? [] : RATING_CHIPS_NEGATIVE_PICKED),
  );
  const [avoidCook, setAvoidCook] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackDraft>(initialFeedback);
  const [focus, setFocus] = useState<'voice' | 'write' | null>(initialFeedbackFocus);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [capture, setCapture] = useState<CaptureMode | null>(null);
  const [preparingVideo, setPreparingVideo] = useState(false);

  // What this build can capture: a build from before rating media has none of these modules, and
  // the card then offers only words.
  const cameraModule = canUploadRatingMedia() ? loadExpoCamera() : null;
  const galleryAvailable = canUploadRatingMedia() && loadExpoImagePicker() !== null;
  const mediaAvailable = cameraModule !== null || galleryAvailable;

  const addMedia = (items: readonly FeedbackMediaItem[]) =>
    setFeedback((current) => ({ ...current, media: [...current.media, ...items] }));
  const onPickSource = (source: MediaSource) => {
    setSourceOpen(false);
    // iOS presents nothing while another modal is still going away: wait for the sheet to finish
    // closing before the camera screen or the system picker comes up.
    setTimeout(() => {
      if (source === 'gallery') {
        void pickFromGallery(photosLeft(feedback), videoAllowed(feedback), setPreparingVideo).then(
          addMedia,
        );
      } else {
        setCapture(source);
      }
    }, SHEET_DISMISS_MS);
  };

  /*
   * The first pick stays on the first look for a moment before the card swaps to its rated layout.
   * The swap moves the stars up the card, so swapping on the first tap would put a quick second tap
   * on the same star — the one that fills its second half — on whatever moved under the finger.
   */
  const [settled, setSettled] = useState(initialRating !== null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (settleTimer.current !== null) clearTimeout(settleTimer.current);
    },
    [],
  );
  const onRate = (value: VisitRatingValue) => {
    setRating(value);
    if (settled) return;
    if (settleTimer.current !== null) {
      // The second tap of the double tap: settle on it now.
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
      setSettled(true);
      return;
    }
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      setSettled(true);
    }, FIRST_PICK_SETTLE_MS);
  };
  useEffect(() => {
    onRatingChange?.(rating);
  }, [onRatingChange, rating]);

  // The card's look follows the score once it has settled; until then it is still the first look.
  const tier = settled ? ratingTier(rating) : 'idle';
  const low = LOW_TIERS.includes(tier);
  const compact = useCompactCard();
  // The confetti is drawn on Figma's 370pt card. Its pieces are spread across the card's real width
  // so none fall off a narrower phone's card, and start below the "Rating submitted" banner when
  // it leads the card, so they keep to the cook row and title as drawn instead of covering text.
  const [cardWidth, setCardWidth] = useState(CONFETTI_FRAME_WIDTH);
  const [bannerBottom, setBannerBottom] = useState(0);
  const confettiScale = Math.min(1, cardWidth / CONFETTI_FRAME_WIDTH);
  // Replays on each new score once the rated layout is up (not while it waits to settle).
  const entrance = useTimeline({
    durationMs: RATING_TIMELINE_MS,
    replayKey: settled ? rating : null,
  });

  return (
    <View style={styles.shadow} testID={testID}>
      <View
        style={[
          styles.card,
          compact ? styles.cardCompact : null,
          tier === 'idle' ? styles.cardIdle : null,
        ]}
        onLayout={(event) => setCardWidth(event.nativeEvent.layout.width)}
      >
        {tier === 'magic' ? (
          <LinearGradient
            colors={[
              lightTheme.colors.surfaceRatingNudge,
              lightTheme.colors.surface,
              lightTheme.colors.surface,
            ]}
            locations={[0, 0.34, 1]}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {low ? (
          <LinearGradient
            colors={[
              lightTheme.colors.surfaceRatingPoorTop,
              lightTheme.colors.surface,
              lightTheme.colors.surface,
            ]}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {tier === 'magic' ? (
          <View
            style={[styles.confetti, { width: cardWidth, top: submitted ? bannerBottom : 0 }]}
            pointerEvents="none"
          >
            {CONFETTI.map((piece) => (
              <Animated.View
                key={piece.key}
                style={[
                  styles.confettiPiece,
                  {
                    left: piece.x * confettiScale,
                    top: piece.y,
                    width: piece.width,
                    height: piece.height,
                  },
                  keyframedStyle(entrance, piece.motion),
                ]}
              >
                {piece.art === 'image' ? (
                  <Image
                    source={CONFETTI_ART[piece.key]!}
                    style={[
                      styles.confettiArt,
                      { width: piece.width + 8, height: piece.height + 8 },
                    ]}
                  />
                ) : (
                  <View style={[styles.streamer, { backgroundColor: piece.art }]} />
                )}
              </Animated.View>
            ))}
          </View>
        ) : null}

        {submitted ? (
          // `2517:1030` Rate card / Submitted header — no fill of its own, so the card's mood
          // gradient runs under it: a 36pt check well (yellow on Good, white on 5+ and Bad) and two
          // lines. Supersedes the `2306:1135` lime pill.
          <View
            style={styles.banner}
            onLayout={(event) => {
              const { y, height } = event.nativeEvent.layout;
              setBannerBottom(y + height);
            }}
            testID={`${testID}-submitted`}
          >
            <View style={[styles.bannerWell, tier === 'loved' ? styles.bannerWellGood : null]}>
              <Image source={RATING_ART.check} style={styles.bannerCheck} />
            </View>
            <View style={styles.bannerText}>
              <Text variant="spoonBodyStrong" color="textPrimary">
                Rating submitted
              </Text>
              <Text variant="spoonCaption" color="textSecondarySoft">
                Thanks for the feedback!
              </Text>
            </View>
          </View>
        ) : null}

        {/* `1501:6631` — cook row. */}
        <View style={styles.cook}>
          {live ? (
            visit.photoUri ? (
              <Image source={{ uri: visit.photoUri }} style={styles.cookPhoto} resizeMode="cover" />
            ) : (
              <View style={styles.cookPhoto} />
            )
          ) : (
            <Image source={RATING_ART.cookPhoto} style={styles.cookPhoto} resizeMode="cover" />
          )}
          <View style={styles.cookText}>
            {/* The cook's registered name: a long one wraps to a second line (31 Oct 2026). */}
            <Text variant="spoonBodyStrong" numberOfLines={2}>
              {visit.title}
            </Text>
            <Text variant="spoonCaption" color="textRatingSubtle" numberOfLines={1}>
              {visit.meta}
            </Text>
          </View>
          {tier === 'idle' && onLater !== undefined && !submitted ? (
            <Pressable
              onPress={onLater}
              accessibilityRole="button"
              hitSlop={lightTheme.space.md}
              testID={`${testID}-later`}
            >
              <Text variant="spoonCaptionStrong" color="textRatingQuiet">
                Later
              </Text>
            </Pressable>
          ) : null}
        </View>

        {rating === null || tier === 'idle' ? (
          <FirstLook
            rating={rating}
            onRate={onRate}
            cookName={visit.cookName}
            live={live}
            variant={variant}
            testID={testID}
          />
        ) : (
          <RatedBody
            tier={tier}
            rating={rating}
            onRate={onRate}
            picked={low ? negativePicked : positivePicked}
            onTogglePick={(key) => {
              const update = (current: readonly string[]) =>
                current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
              if (low) setNegativePicked(update);
              else setPositivePicked(update);
            }}
            avoidCook={avoidCook}
            onToggleAvoidCook={() => setAvoidCook((current) => !current)}
            feedback={feedback}
            onFeedback={setFeedback}
            focus={focus}
            onFocus={setFocus}
            onOpenMedia={mediaAvailable ? () => setSourceOpen(true) : undefined}
            onSubmit={onSubmit}
            clock={entrance}
            cookName={visit.cookName}
            submitting={submitting}
            preparingVideo={preparingVideo}
            submitted={submitted}
            testID={testID}
          />
        )}
      </View>
      <MediaSourceSheet
        visible={sourceOpen}
        onClose={() => setSourceOpen(false)}
        onPick={onPickSource}
        canPhoto={photosLeft(feedback) > 0}
        canVideo={videoAllowed(feedback)}
        cameraAvailable={cameraModule !== null}
        galleryAvailable={galleryAvailable}
        testID={`${testID}-media-source`}
      />
      {capture === null || cameraModule === null ? null : (
        <MediaCaptureModal
          camera={cameraModule}
          visible
          initialMode={capture}
          canPhoto={photosLeft(feedback) > 0}
          canVideo={videoAllowed(feedback)}
          onUse={(item) => {
            addMedia([item]);
            setCapture(null);
          }}
          onClose={() => setCapture(null)}
          testID={`${testID}-capture`}
        />
      )}
    </View>
  );
}

/**
 * `1501:6628` — the first look, with its own clocks: the 2 s loop (the "?" bob, the nudge
 * sparkle, the 5+ wiggle) and the ring's endless turn. Both rest at their start under Reduce Motion.
 */
function FirstLook({
  rating,
  onRate,
  cookName,
  live,
  variant,
  testID,
}: {
  readonly rating: VisitRatingValue | null;
  readonly onRate: (value: VisitRatingValue) => void;
  readonly cookName: string;
  readonly live: boolean;
  readonly variant: 'visit' | 'service';
  readonly testID: string;
}) {
  const service = variant === 'service';
  const loop = useTimeline({ durationMs: RATING_TIMELINE_MS, loop: true, restAt: 0 });
  const spin = useTimeline({ durationMs: IDLE_RING_TURN_MS, loop: true, restAt: 0 });
  return (
    <>
      {/* `1501:6637` — idle hero. */}
      <View style={styles.idleHero}>
        <IdleSticker clock={loop} spin={spin} testID={`${testID}-sticker`} />
        <Text variant="spoonTitle" align="center">
          How was the service today?
        </Text>
        <Text variant="spoonCaption" color="textRatingSubtle" align="center">
          {/* The Ratings page's line (`1517:9293`), on every card. */}
          One tap! Your rating helps us assign you better cooks
        </Text>
      </View>

      {/* `1501:6660` — stars over the scale captions, 10pt apart. */}
      <View style={styles.idleInput}>
        <RatingStars value={rating} onChange={onRate} clock={loop} testID={`${testID}-stars`} />
        <View style={styles.scaleLabels}>
          <Text variant="spoonMicro" color="textSecondarySoft">
            Not great
          </Text>
          <Text variant="spoonMicro" color="textSecondarySoft">
            Single tap for half star. Double tap for full star
          </Text>
          <Text variant="spoonMicroStrong" color="textSecondarySoft">
            Amazing!
          </Text>
        </View>
      </View>

      {/* `1501:6689` — the 5+ nudge. */}
      <View style={styles.nudge}>
        <View style={styles.nudgeDisc}>
          <Animated.Image
            source={RATING_ART.nudgeSparkle}
            style={[styles.nudgeSparkle, keyframedStyle(loop, { rotate: NUDGE_SPARKLE })]}
          />
        </View>
        <Text variant="spoonCaption" style={styles.flex}>
          {'Blown away? Give a '}
          <Text variant="ratingCaptionBold">5+</Text>
          {live && !service
            ? `, it tells ${cookName} the visit went above & beyond and delivered that extra delight!`
            : `, it tells ${cookName} she went above & beyond to deliver that extra delight!`}
        </Text>
      </View>
    </>
  );
}

interface RatedBodyProps {
  readonly tier: Exclude<RatingTier, 'idle'>;
  readonly rating: VisitRatingValue;
  readonly onRate: (value: VisitRatingValue) => void;
  readonly picked: readonly string[];
  readonly onTogglePick: (key: string) => void;
  readonly avoidCook: boolean;
  readonly onToggleAvoidCook: () => void;
  readonly feedback: FeedbackDraft;
  readonly onFeedback: (feedback: FeedbackDraft) => void;
  readonly focus: 'voice' | 'write' | null;
  readonly onFocus: (focus: 'voice' | 'write' | null) => void;
  readonly onOpenMedia: (() => void) | undefined;
  readonly onSubmit?: ((submission: RateVisitSubmission) => void) | undefined;
  /** The entrance, played on each new score. */
  readonly clock: Animated.Value;
  readonly cookName: string;
  readonly submitting: boolean;
  /** An Android gallery video is being compressed: nothing can be sent until it is ready. */
  readonly preparingVideo: boolean;
  /** Sent: everything reads back, nothing is edited (`2306:929`). */
  readonly submitted: boolean;
  readonly testID: string;
}

function RatedBody({
  tier,
  rating,
  onRate,
  picked,
  onTogglePick,
  avoidCook,
  onToggleAvoidCook,
  feedback,
  onFeedback,
  focus,
  onFocus,
  onOpenMedia,
  onSubmit,
  clock,
  cookName,
  submitting,
  preparingVideo,
  submitted,
  testID,
}: RatedBodyProps) {
  const busy = submitting || preparingVideo;
  const motion = STICKER_MOTION[tier];
  const copy = ratingTierCopy(cookName)[tier];
  const low = LOW_TIERS.includes(tier);
  const compact = useCompactCard();
  const chips = low ? RATING_CHIPS_NEGATIVE : RATING_CHIPS_POSITIVE;

  return (
    <>
      {/* `1501:6704` — sticker + mood. */}
      <View style={styles.hero}>
        <ScoreSticker tier={tier} value={rating} clock={clock} testID={`${testID}-sticker`} />
        <View style={styles.mood}>
          <Animated.View style={keyframedStyle(clock, motion.headline)}>
            <Text variant="spoonDisplay">{copy.headline}</Text>
          </Animated.View>
          <Animated.View style={keyframedStyle(clock, motion.body)}>
            <Text variant="spoonCaption" color="textRatingSubtle">
              {submitted ? copy.submittedBody : copy.body}
            </Text>
          </Animated.View>
        </View>
      </View>

      {/* `1501:6758` — stars, no captions once rated. */}
      <RatingStars
        value={rating}
        {...(submitted ? {} : { onChange: onRate })}
        clock={clock}
        testID={`${testID}-stars`}
      />

      {submitted ? (
        <SubmittedBody
          chips={chips.filter((chip) => picked.includes(chip.key))}
          chipsLabel={copy.chipsLabel.replace(/\?$/, '')}
          low={low}
          feedback={feedback}
          cookName={cookName}
          testID={testID}
        />
      ) : (
        <>
          {/* `1501:6807` — chips. */}
          <View style={styles.chipsBlock}>
            <Text variant="spoonCaptionStrong" color="textSecondary">
              {copy.chipsLabel}
            </Text>
            <View style={[styles.chips, compact ? styles.chipsCompact : null]}>
              {chips.map((chip) => {
                const on = picked.includes(chip.key);
                return (
                  <Pressable
                    key={chip.key}
                    onPress={() => onTogglePick(chip.key)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    style={[
                      styles.chip,
                      on ? styles.chipOn : styles.chipOff,
                      on && low ? styles.chipOnLow : null,
                      compact ? (on ? styles.chipOnCompact : styles.chipOffCompact) : null,
                    ]}
                    testID={`${testID}-chip-${chip.key}`}
                  >
                    {on ? (
                      <Image
                        source={RATING_ART.check}
                        style={compact ? styles.chipCheckCompact : styles.chipCheck}
                      />
                    ) : null}
                    <Text variant="spoonCaptionStrong" numberOfLines={1}>
                      {chip.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* `2093:6050` — Voice / Media / Write. */}
          <FeedbackBlock
            title={copy.feedbackTitle}
            body={copy.feedbackBody}
            draft={feedback}
            onChange={onFeedback}
            focus={focus}
            onFocus={onFocus}
            onOpenMedia={onOpenMedia}
            disabled={busy}
            testID={`${testID}-feedback`}
          />

          {/* `1501:7471` — below 4 only (dev note `2238:930`). Only the toggle is pressable; the
              icon and copy beside it are not (device test, 31 Oct 2026). */}
          {copy.differentCook ? (
            <View style={styles.support} testID={`${testID}-support`}>
              <View style={styles.supportDisc}>
                <Image source={RATING_ART.restart} style={styles.icon} />
              </View>
              <View style={styles.supportText}>
                {/* One line as drawn; a narrow phone (a 360dp S21 leaves ~166pt) shrinks it a step. */}
                <Text
                  variant="spoonCaptionStrong"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {RATING_DIFFERENT_COOK.title}
                </Text>
                <Text variant="spoonMicro" color="textRatingSubtle">
                  {RATING_DIFFERENT_COOK.body}
                </Text>
              </View>
              <Pressable
                onPress={onToggleAvoidCook}
                accessibilityRole="switch"
                accessibilityLabel={RATING_DIFFERENT_COOK.title}
                accessibilityState={{ checked: avoidCook }}
                hitSlop={TOGGLE_HIT_SLOP}
                testID={`${testID}-support-toggle`}
              >
                <Image
                  source={avoidCook ? RATING_ART.toggleOn : RATING_ART.toggleOff}
                  style={styles.toggle}
                />
              </Pressable>
            </View>
          ) : null}

          {/* `1501:6844` — CTA. */}
          <Pressable
            onPress={() =>
              onSubmit?.({ rating, chips: picked, avoidCook: low && avoidCook, feedback })
            }
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy }}
            style={[
              styles.submit,
              tier === 'magic' ? styles.submitLime : null,
              busy ? styles.submitBusy : null,
            ]}
            testID={`${testID}-submit`}
          >
            <Text variant="spoonButton">
              {submitting ? 'Sending…' : preparingVideo ? 'Preparing video…' : copy.submit}
            </Text>
          </Pressable>
        </>
      )}
    </>
  );
}

/**
 * `2306:957` / `2306:980` — what the rating said, read back: only the picked chips (ticked, not
 * tappable) under the question as a statement ("What stood out"), then "Your note to <cook>".
 */
function SubmittedBody({
  chips,
  chipsLabel,
  low,
  feedback,
  cookName,
  testID,
}: {
  readonly chips: readonly { readonly key: string; readonly label: string }[];
  readonly chipsLabel: string;
  readonly low: boolean;
  readonly feedback: FeedbackDraft;
  readonly cookName: string;
  readonly testID: string;
}) {
  return (
    <>
      {chips.length === 0 ? null : (
        <View style={styles.chipsBlock}>
          <Text variant="spoonCaptionStrong" color="textSecondary">
            {chipsLabel}
          </Text>
          <View style={styles.chips}>
            {chips.map((chip) => (
              <View
                key={chip.key}
                style={[styles.chip, styles.chipOn, low ? styles.chipOnLow : null]}
                testID={`${testID}-chip-${chip.key}`}
              >
                <Image source={RATING_ART.check} style={styles.chipCheck} />
                <Text variant="spoonCaptionStrong" numberOfLines={1}>
                  {chip.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
      <SubmittedFeedback
        // `2513:1798` Mood=Bad addresses a low rating's note to the Spoon team.
        title={low ? 'Your note to the Spoon team' : `Your note to ${cookName}`}
        draft={feedback}
        testID={`${testID}-feedback`}
      />
    </>
  );
}

/** The source sheet's slide-out (220 ms) and the modal dismissal behind it. */
const SHEET_DISMISS_MS = 450;

/** How long the first pick waits on the first look for a quick second tap (see `settled`). */
const FIRST_PICK_SETTLE_MS = 350;

const CARD_RADIUS = 28;

/** Phones narrower than the frames' 402pt by more than a few points get the compact card. */
const COMPACT_BELOW = 390;

function useCompactCard(): boolean {
  return useWindowDimensions().width < COMPACT_BELOW;
}

/** `1501:6849` — the confetti frame's width: the card as Figma draws it. */
const CONFETTI_FRAME_WIDTH = 370;

/** The 44 × 26 toggle reaches a 48pt touch target. */
const TOGGLE_HIT_SLOP = { top: 11, bottom: 11, left: 2, right: 2 };

const styles = StyleSheet.create({
  flex: { flex: 1 },
  /** `1517:9293` — `0 8 24 rgba(0,0,0,0.08)`, outside the clip so iOS keeps it. */
  shadow: {
    alignSelf: 'stretch',
    borderRadius: CARD_RADIUS,
    backgroundColor: lightTheme.colors.surface,
    shadowColor: lightTheme.colors.textPrimary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  card: {
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    padding: 20,
    gap: 20,
    alignItems: 'center',
  },
  /** Under 390pt wide (a 360dp Android): 16 in, so the frames' rows still fit on one line. */
  cardCompact: { padding: lightTheme.space.lg },
  /** `1517:9293` — the first look pads 24 at the bottom. */
  cardIdle: { paddingBottom: lightTheme.space.xl },
  /** `1501:6849` — 370 × 226 from the card's corner. */
  confetti: { position: 'absolute', left: 0, top: 0, width: CONFETTI_FRAME_WIDTH, height: 226 },
  /** A piece at its box; a sparkle's art carries 4pt of margin round it. */
  confettiPiece: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  confettiArt: { position: 'absolute', left: -4, top: -4 },
  /** `1501:6961` — a 10 × 4 streamer, r2, centred in its turned box. */
  streamer: { width: 10, height: 4, borderRadius: 2 },
  cook: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.space.md,
  },
  /** `2306:1135` — `#ECFF9B`, r14, pl10 / pr14 / py10, 10pt gap. */
  /** `2517:1030` — a row, 12 between the well and the text; the card's padding frames it. */
  banner: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.space.md,
  },
  /** 36pt round; white on 5+ and Bad. */
  bannerWell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightTheme.colors.surface,
  },
  /** `#FFD600` on Good. */
  bannerWellGood: { backgroundColor: lightTheme.colors.surfaceCta },
  bannerCheck: { width: 20, height: 20 },
  /** "Rating submitted" Body Strong 14/20 over "Thanks for the feedback!" Caption at 60 %, 2 apart. */
  bannerText: { flex: 1, gap: 2 },
  /** `1501:6632` — the photo fills a 44pt `#FFF7CC` circle; no ring. */
  cookPhoto: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: lightTheme.colors.surfaceAccent,
  },
  cookText: { flex: 1, gap: lightTheme.space.xxs },
  idleHero: { alignSelf: 'stretch', alignItems: 'center', gap: lightTheme.space.md },
  idleInput: { alignSelf: 'stretch', alignItems: 'center', gap: lightTheme.space.s10 },
  scaleLabels: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  /** `1501:6689` — pl12 / pr14 / py10, r16, 10pt gap; no fill on the Ratings page (`1517:9293`). */
  nudge: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.space.s10,
    paddingLeft: lightTheme.space.md,
    paddingRight: 14,
    paddingVertical: lightTheme.space.s10,
    borderRadius: lightTheme.radius.md,
  },
  /** `1501:6690` — 28pt lime disc; the 14pt sparkle at 7,7. */
  nudgeDisc: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: lightTheme.colors.surfaceRatingLime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeSparkle: { width: 14, height: 14 },
  hero: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.space.lg,
  },
  mood: { flex: 1, gap: lightTheme.space.xs },
  chipsBlock: { alignSelf: 'stretch', gap: lightTheme.space.s10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: lightTheme.space.sm },
  chip: {
    // Never squeezed to fit what is left of a row: Android then wraps the label inside the pill
    // and clips it ("Too much oil" → "Too much"). A chip that doesn't fit moves to the next row.
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.space.xs,
    paddingVertical: lightTheme.space.sm,
    borderRadius: lightTheme.radius.pill,
  },
  /** `1501:6810` — ticked: pl10 / pr14, 1.5pt `#FFD600` on `#FFF7CC`. */
  chipOn: {
    paddingLeft: lightTheme.space.s10,
    paddingRight: 14,
    borderWidth: 1.5,
    borderColor: lightTheme.colors.surfaceCta,
    backgroundColor: lightTheme.colors.surfaceAccent,
  },
  /** `1501:7432` — on a low score the ticked edge is black 25 % instead. */
  chipOnLow: { borderColor: lightTheme.colors.textDisabledSoft },
  /** `1501:6818` — unticked: px14, 1pt black 25 % on white. */
  chipOff: {
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: lightTheme.colors.textDisabledSoft,
    backgroundColor: lightTheme.colors.surface,
  },
  chipCheck: { width: 18, height: 18 },
  /** Compact: 6 apart, 2pt less padding each side and a 16pt tick, so a frame's row stays a row. */
  chipsCompact: { gap: lightTheme.space.s6 },
  chipOnCompact: { paddingLeft: lightTheme.space.sm, paddingRight: lightTheme.space.s10 },
  chipOffCompact: { paddingHorizontal: lightTheme.space.s10 },
  chipCheckCompact: { width: 16, height: 16 },
  icon: { width: 24, height: 24 },
  /** `1501:7471` — pl12 / pr14 / py12, r18, 12pt gap. */
  support: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.space.md,
    paddingLeft: lightTheme.space.md,
    paddingRight: 14,
    paddingVertical: lightTheme.space.md,
    borderRadius: 18,
  },
  supportDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: lightTheme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportText: { flex: 1, gap: lightTheme.space.xxs },
  toggle: { width: 44, height: 26 },
  /** `1501:6844` — 52 tall, r26. */
  submit: {
    alignSelf: 'stretch',
    height: 52,
    borderRadius: 26,
    backgroundColor: lightTheme.colors.surfaceCta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitLime: { backgroundColor: lightTheme.colors.surfaceRatingLime },
  submitBusy: { opacity: 0.6 },
});
