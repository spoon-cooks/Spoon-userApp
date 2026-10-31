import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Image, Modal, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { VideoPlayer } from 'expo-video';

import { Text } from '@ui';
import { lightTheme } from '@ui/theme/ThemeProvider';

import { PAUSE_BUTTON, SKIP_ARROW } from '../art';
import { loadExpoVideo } from '../expoVideo';
import type { ExpoVideo } from '../expoVideo';
import {
  SKIP_SECONDS,
  VIDEO_DURATION_SECONDS,
  advance,
  clampPosition,
  formatClock,
  hasEnded,
  positionAt,
  progressOf,
  skipBy,
} from '../playback';

/**
 * The explainer's player — Figma `970:5546` ("Video / playing"): a sheet that comes up over the
 * landing, which a `#0A0A08` 50 % scrim dims, 33 below the status bar, with a 28 radius on its top
 * corners, on `#1A1A1A`. From the top: a drag zone with a grab handle, the video's surface, and
 * the transport — elapsed time, back 10 s, play/pause, forward 10 s, the total.
 *
 * ## The video
 *
 * Given a `source` the surface plays it with `expo-video` and the transport follows the video:
 * its position, its length, its end. Without one — no URL set yet (`../video.ts`), or a build
 * made before `expo-video` was added, which has no native module for it (`../expoVideo.ts`) — the
 * surface is the pale placeholder the frame draws and a clock stands in for the playhead, so the
 * page, its transport and the "watched" state all still work. Either way the sheet itself only
 * sees a `Playback`: a position, a length, whether it plays, and how to play, pause and seek.
 *
 * ## What is not in the frame
 *
 * The frame draws no scrubber. One is added, a 4pt track along the top edge of the transport,
 * so the video can be seeked (and, with no video to play to the end, finished). The skip buttons'
 * arrows are drawn white, with the "10" in the middle of each, and the forward one is the back
 * one mirrored: the frame leaves the forward arrow out and sets the back one dark-on-dark.
 */
export interface ExplainerVideoSource {
  readonly uri: string;
}

export interface ExplainerPlayerProps {
  /** The video to play. Absent until there is one: the placeholder plays a clock instead. */
  readonly source?: ExplainerVideoSource;
  readonly durationSeconds?: number;
  /** Where the playhead starts. */
  readonly initialPosition?: number;
  /** The playhead reached the end — played there or scrubbed there. The page marks it watched. */
  readonly onEnded: () => void;
  /** The sheet was dismissed: its handle or the dimmed page was tapped, or it was swiped down. */
  readonly onClose: () => void;
  readonly testID?: string;
}

/** What the sheet needs of whatever is playing: the video, or the placeholder's clock. */
interface Playback {
  /** Seconds in. */
  readonly position: number;
  /** The length in seconds. */
  readonly duration: number;
  readonly playing: boolean;
  /** The playhead is at the end, played there or scrubbed there. */
  readonly ended: boolean;
  readonly play: () => void;
  readonly pause: () => void;
  readonly seekTo: (seconds: number) => void;
}

export function ExplainerPlayer(props: ExplainerPlayerProps) {
  const video = props.source === undefined ? null : loadExpoVideo();
  return props.source !== undefined && video !== null ? (
    <VideoBackedPlayer {...props} source={props.source} video={video} />
  ) : (
    <PlaceholderPlayer {...props} />
  );
}

/** No video to play: the pale surface, and a clock for the playhead. */
function PlaceholderPlayer({
  durationSeconds = VIDEO_DURATION_SECONDS,
  initialPosition = 0,
  ...sheet
}: ExplainerPlayerProps) {
  const playback = useClockPlayback({ initialPosition, duration: durationSeconds });
  return (
    <PlayerSheet
      {...sheet}
      playback={playback}
      surface={<View style={styles.scene} testID="explainer-player-surface" />}
    />
  );
}

/** A real video, played by `expo-video`. */
function VideoBackedPlayer({
  video,
  source,
  durationSeconds = VIDEO_DURATION_SECONDS,
  initialPosition = 0,
  ...sheet
}: ExplainerPlayerProps & {
  readonly video: ExpoVideo;
  readonly source: ExplainerVideoSource;
}) {
  const { useVideoPlayer, VideoView } = video;
  const player = useVideoPlayer(source.uri, (instance) => {
    instance.timeUpdateEventInterval = TIME_UPDATE_SECONDS;
    if (initialPosition > 0) instance.currentTime = initialPosition;
    instance.play();
  });
  const { playback, failed } = useVideoPlayback(player, durationSeconds, initialPosition);
  return (
    <PlayerSheet
      {...sheet}
      playback={playback}
      surface={
        <View style={styles.videoScene} testID="explainer-player-surface">
          {/*
           * The sheet's ink behind the video, not the pale scene: the video is narrower than the
           * frame on a phone, and the pale scene showed as a strip down each side (device test,
           * 31 Oct 2026). Ink blends into the video's own dark frame.
           */}
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            nativeControls={false}
            allowsPictureInPicture={false}
          />
          {failed ? (
            <View style={styles.failure} pointerEvents="none">
              <Text variant="bodyLargeStrong" color="textPrimary" align="center">
                We couldn&apos;t load the video. Please try again in a moment.
              </Text>
            </View>
          ) : null}
        </View>
      }
    />
  );
}

/** The sheet: drag zone, the video's surface (given), and the transport. */
function PlayerSheet({
  playback,
  surface,
  onEnded,
  onClose,
  testID = 'explainer-player',
}: Pick<ExplainerPlayerProps, 'onEnded' | 'onClose' | 'testID'> & {
  readonly playback: Playback;
  readonly surface: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [trackWidth, setTrackWidth] = useState(0);
  const { position, duration, playing, ended, play, pause, seekTo } = playback;

  // The end, however it was reached: nothing is playing any more, and the page is told.
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);
  useEffect(() => {
    if (ended) onEndedRef.current();
  }, [ended]);

  // The sheet comes up from the bottom and goes back down.
  const [slide] = useState(() => new Animated.Value(SHEET_OFFSET));
  useEffect(() => {
    Animated.timing(slide, { toValue: 0, duration: SLIDE_MS, useNativeDriver: true }).start();
  }, [slide]);
  const requestClose = useCallback(() => {
    Animated.timing(slide, {
      toValue: SHEET_OFFSET,
      duration: SLIDE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [onClose, slide]);

  // Swiping the drag zone down closes it, as `BottomSheet`'s handle does.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > lightTheme.space.sm,
        onPanResponderMove: (_event, gesture) => {
          if (gesture.dy > 0) slide.setValue(gesture.dy);
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > DRAG_DISMISS) {
            requestClose();
            return;
          }
          Animated.timing(slide, { toValue: 0, duration: SLIDE_MS, useNativeDriver: true }).start();
        },
      }),
    [requestClose, slide],
  );

  const seek = useCallback(
    (event: GestureResponderEvent) =>
      seekTo(positionAt(event.nativeEvent.locationX, trackWidth, duration)),
    [duration, seekTo, trackWidth],
  );

  const progress = progressOf(position, duration);

  return (
    <Modal transparent animationType="none" statusBarTranslucent onRequestClose={requestClose}>
      <View style={styles.root} accessibilityViewIsModal testID={testID}>
        {/* `970:5600` — the dimmed page; tapping it closes the player. */}
        <Pressable
          style={styles.scrim}
          onPress={requestClose}
          accessibilityRole="button"
          accessibilityLabel="Close video"
          testID={`${testID}-scrim`}
        />
        {/* `970:5601` — 33 under the status bar, to the bottom of the screen. */}
        <Animated.View
          style={[
            styles.sheet,
            { top: insets.top + SHEET_TOP, transform: [{ translateY: slide }] },
          ]}
        >
          {/* `970:5602` — 23 tall, the handle 5 × 48 at the centre. */}
          <View style={styles.dragZone} {...panResponder.panHandlers}>
            <Pressable
              onPress={requestClose}
              accessibilityRole="button"
              accessibilityLabel="Close video"
              hitSlop={lightTheme.space.sm}
              testID={`${testID}-handle`}
            >
              <View style={styles.handle} />
            </Pressable>
          </View>

          {surface}

          {/* `970:5609` */}
          <View style={styles.transport}>
            <View
              style={styles.track}
              hitSlop={TRACK_HIT_SLOP}
              onLayout={(event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width)}
              onStartShouldSetResponder={() => true}
              onResponderTerminationRequest={() => false}
              onResponderGrant={seek}
              onResponderMove={seek}
              accessibilityRole="adjustable"
              accessibilityLabel="Video position"
              accessibilityValue={{ min: 0, max: duration, now: Math.floor(position) }}
              testID={`${testID}-scrubber`}
            >
              <View style={styles.trackRail} pointerEvents="none" />
              <View
                style={[styles.trackFill, { width: `${progress * 100}%` }]}
                pointerEvents="none"
              />
            </View>

            <Text variant="bodyStrong" color="textPlayerTime" testID={`${testID}-elapsed`}>
              {formatClock(position)}
            </Text>
            <View style={styles.buttons}>
              <SkipButton
                direction="back"
                onPress={() => seekTo(skipBy(position, -SKIP_SECONDS, duration))}
                testID={`${testID}-back`}
              />
              <PlayPauseButton
                playing={playing}
                onPress={() => {
                  // Pressing play at the end starts it again.
                  if (ended) {
                    seekTo(0);
                    play();
                  } else if (playing) {
                    pause();
                  } else {
                    play();
                  }
                }}
                testID={`${testID}-toggle`}
              />
              <SkipButton
                direction="forward"
                onPress={() => seekTo(skipBy(position, SKIP_SECONDS, duration))}
                testID={`${testID}-forward`}
              />
            </View>
            <Text variant="bodyStrong" color="textPlayerTime" testID={`${testID}-total`}>
              {formatClock(duration)}
            </Text>
          </View>

          {/* `970:5625` — the home indicator's strip, in the page's white. */}
          <View style={{ height: insets.bottom, backgroundColor: lightTheme.colors.surface }} />
        </Animated.View>
      </View>
    </Modal>
  );
}

/**
 * The placeholder's playhead: a clock. Plays the position forward in real time while playing and
 * stops at the end; seeks set it directly. There is no video, so this is all "playing" means.
 */
function useClockPlayback({
  initialPosition,
  duration,
}: {
  readonly initialPosition: number;
  readonly duration: number;
}): Playback {
  const [position, setPosition] = useState(() => clampPosition(initialPosition, duration));
  const [wantsPlay, setWantsPlay] = useState(true);
  const ended = hasEnded(position, duration);
  const playing = wantsPlay && !ended;

  useEffect(() => {
    if (!playing) return;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - last) / 1000;
      last = now;
      setPosition((current) => advance(current, elapsed, duration));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [playing, duration]);

  return useMemo(
    () => ({
      position,
      duration,
      playing,
      ended,
      play: () => setWantsPlay(true),
      pause: () => setWantsPlay(false),
      seekTo: (seconds: number) => setPosition(clampPosition(seconds, duration)),
    }),
    [position, duration, playing, ended],
  );
}

/** Seeks the video to `seconds`. `expo-video` seeks by setting `currentTime`. */
function seekPlayer(player: VideoPlayer, seconds: number) {
  player.currentTime = seconds;
}

/**
 * The video's playhead: `expo-video`'s own position, length, play state and end, read from its
 * events. A seek moves the playhead at once (the video catches up) so the scrubber follows the
 * finger. The length is the video's, once it has loaded; until then the one the page was given.
 */
function useVideoPlayback(
  player: VideoPlayer,
  fallbackDuration: number,
  initialPosition: number,
): { readonly playback: Playback; readonly failed: boolean } {
  const [duration, setDuration] = useState(
    player.duration > 0 ? player.duration : fallbackDuration,
  );
  const [position, setPosition] = useState(() => clampPosition(initialPosition, duration));
  const [playing, setPlaying] = useState(player.playing);
  const [playedToEnd, setPlayedToEnd] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const subscriptions = [
      player.addListener('timeUpdate', ({ currentTime }) => setPosition(currentTime)),
      player.addListener('playingChange', ({ isPlaying }) => setPlaying(isPlaying)),
      player.addListener('playToEnd', () => setPlayedToEnd(true)),
      player.addListener('sourceLoad', ({ duration: length }) => {
        if (length > 0) setDuration(length);
      }),
      player.addListener('statusChange', ({ status }) => setFailed(status === 'error')),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [player]);

  const ended = playedToEnd || hasEnded(position, duration);

  const playback = useMemo<Playback>(
    () => ({
      position: clampPosition(position, duration),
      duration,
      playing: playing && !ended,
      ended,
      play: () => player.play(),
      pause: () => player.pause(),
      seekTo: (seconds: number) => {
        const target = clampPosition(seconds, duration);
        setPosition(target);
        setPlayedToEnd(false);
        seekPlayer(player, target);
      },
    }),
    [position, duration, playing, ended, player],
  );
  return { playback, failed };
}

/** `970:5612` / `970:5620` — a 44pt button: a circular arrow with "10" in it, forward being the back one mirrored. */
function SkipButton({
  direction,
  onPress,
  testID,
}: {
  readonly direction: 'back' | 'forward';
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const forward = direction === 'forward';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={forward ? 'Forward 10 seconds' : 'Back 10 seconds'}
      style={styles.skip}
      testID={testID}
    >
      <Image
        source={SKIP_ARROW}
        style={[styles.skipArrow, forward ? styles.skipArrowForward : null]}
      />
      <Text variant="labelMicro" color="textInverse" align="center" style={styles.skipLabel}>
        10
      </Text>
    </Pressable>
  );
}

/**
 * `970:5616` — the 64pt play/pause button. Playing is the frame's own pause button, as exported;
 * the frame draws no paused state, so that one is the same yellow disc with a play triangle in
 * the pause bars' ink.
 */
function PlayPauseButton({
  playing,
  onPress,
  testID,
}: {
  readonly playing: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause' : 'Play'}
      style={styles.toggle}
      testID={testID}
    >
      {playing ? (
        <Image source={PAUSE_BUTTON} style={styles.toggleArt} />
      ) : (
        <View style={styles.playDisc}>
          <View style={styles.playTriangle} />
        </View>
      )}
    </Pressable>
  );
}

/** Below the sheet's own height, so it starts fully off the screen. */
const SHEET_OFFSET = 1000;
const SLIDE_MS = 250;
const DRAG_DISMISS = 80;
/** `970:5601` — 87 from the top, with the status bar's 54 above: 33 under it. */
const SHEET_TOP = 33;
const TICK_MS = 250;
/** How often `expo-video` reports the position, in seconds. */
const TIME_UPDATE_SECONDS = 0.25;
const TRACK_HIT_SLOP = { top: 14, bottom: 14 };
/** The scrubber's track height. */
const TRACK = 4;

const styles = StyleSheet.create({
  root: { flex: 1 },
  /** `970:5600` — `#0A0A08` at 50 %, over the whole page. */
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: lightTheme.colors.scrimPlayer },
  /** `970:5601` — `#1A1A1A`, the top corners at 28. */
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    backgroundColor: lightTheme.colors.surfaceInk,
  },
  /** `970:5602` — 23 tall, py 10 around the 5pt handle. */
  dragZone: { height: 23, alignItems: 'center', paddingVertical: lightTheme.space.s10 },
  /** `970:5603` — 48 × 5 at a 3 radius, `#FFEF99`. */
  handle: {
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: lightTheme.colors.surfaceAccentStrong,
  },
  /** `970:5608`. */
  scene: { flex: 1, backgroundColor: lightTheme.colors.surfaceVideoScene },
  /** Behind a real video: the sheet's own ink, so a letterbox does not show as pale strips. */
  videoScene: { flex: 1, backgroundColor: lightTheme.colors.surfaceInk },
  /** Over the scene, when the video would not load: pale, so the dark copy reads on it. */
  failure: {
    ...StyleSheet.absoluteFill,
    backgroundColor: lightTheme.colors.surfaceVideoScene,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: lightTheme.space.xl,
  },
  /** `970:5609` — px 24 / py 16, the times at the sides and the buttons between. */
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: lightTheme.space.xl,
    paddingVertical: lightTheme.space.lg,
  },
  /** Not in the frame — the scrubber: a 4pt track along the transport's top edge. */
  track: { position: 'absolute', top: 0, left: 0, right: 0, height: TRACK },
  trackRail: {
    ...StyleSheet.absoluteFill,
    backgroundColor: lightTheme.colors.textPlayerTime,
    opacity: 0.3,
  },
  trackFill: { height: TRACK, backgroundColor: lightTheme.colors.surfaceBrand },
  /** `970:5611` — 22 between the three. */
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  skip: { width: 44, height: 44 },
  /**
   * `983:6142` draws the arrow 19pt with the "10" laid over it, which leaves a ring too narrow for
   * the digits — they run into it. Drawn at 32pt (6 in on each side of the 44), centred, the ring's
   * inside is wide enough for the 11pt "10" with room to spare. White on the dark sheet.
   */
  skipArrow: {
    position: 'absolute',
    left: 6,
    top: 6,
    width: 32,
    height: 32,
    tintColor: lightTheme.colors.textInverse,
  },
  /** The forward button is the back one mirrored — the arrow only, never the digits. */
  skipArrowForward: { transform: [{ scaleX: -1 }] },
  /** `970:5615` — the "10", Bold, centred on the arrow's ring. */
  skipLabel: {
    position: 'absolute',
    left: 6,
    top: 6,
    width: 32,
    height: 32,
    lineHeight: 32,
    textAlignVertical: 'center',
  },
  toggle: { width: 64, height: 64 },
  toggleArt: { width: 64, height: 64 },
  playDisc: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: lightTheme.radius.pill,
    backgroundColor: lightTheme.colors.surfaceBrand,
  },
  /** A play triangle 16 high, nudged right so its weight sits at the disc's centre. */
  playTriangle: {
    marginLeft: 4,
    borderTopWidth: 10,
    borderBottomWidth: 10,
    borderLeftWidth: 16,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: lightTheme.colors.surfaceInk,
  },
});
