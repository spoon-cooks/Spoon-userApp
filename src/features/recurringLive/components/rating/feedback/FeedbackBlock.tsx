import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { loadExpoAudio, loadExpoVideo } from '@core/native';
import { canUploadRatingMedia } from '@features/booking';
import { Text } from '@ui';
import { lightTheme } from '@ui/theme/ThemeProvider';

import { FEEDBACK_ART, RATING_ART } from '../assets';
import { MAX_FEEDBACK_TEXT, WAVE_HEIGHT, clipTime } from './model';
import type { FeedbackDraft, FeedbackMediaItem, FeedbackVoiceNote } from './model';
import { MediaViewer } from './MediaViewer';
import { useVoiceNote, useVoicePlayback } from './useVoiceNote';
import type { ExpoAudioModule } from './useVoiceNote';

/**
 * `Next step · Add feedback` — Figma "Ratings" `2093:6050`, in every rated rate card. What it
 * draws follows what the customer has added (dev note `2238:919`):
 *
 *   tiles      Voice / Media / Write (`2093:6054`); the last one used (Voice or Write) is
 *              outlined in black with a lime well (`2093:5743`, `2093:5834`)
 *   recording  pause, red live dot, the clock and a live waveform (`2093:5673`)
 *   recorded   play, the length and the note's waveform, with a bin (`2093:5759`)
 *   media      56pt thumbnails with a remove disc; a video adds play and its length (`1767:3731`)
 *   write      a dashed field — the prompt until something is typed (`2093:5892`, `2093:5964`)
 *
 * Each can be removed or redone: the bin drops the note, Voice records a new one over it, a
 * thumbnail's disc drops it, and clearing the field drops the words.
 *
 * A build without the microphone or upload modules (one from before rating media) draws no Voice
 * tile, and the card passes no Media handler, so it draws no Media tile; Write always works.
 *
 * Geometry: `#FFF7CC` → `#ECFF9B` left to right, r20, p16, 16 between blocks; tiles 8 apart,
 * white, r8, py10 / px4, 6 between the 36pt well and the label, `Elevation/1`; the Media tile is
 * 140 wide around a `#FFEF99` r8 pill of 24 / 20 / 20 glyphs, 12 apart.
 */
export interface FeedbackBlockProps {
  readonly title: string;
  readonly body: string;
  readonly draft: FeedbackDraft;
  readonly onChange: (draft: FeedbackDraft) => void;
  /** The tile drawn as the one in use. */
  readonly focus: 'voice' | 'write' | null;
  readonly onFocus: (focus: 'voice' | 'write' | null) => void;
  /** The Media tile — opens "Add photos & videos" (M1). Absent: no Media tile. */
  readonly onOpenMedia?: (() => void) | undefined;
  readonly disabled?: boolean;
  readonly testID: string;
}

interface VoiceControl {
  readonly audio: ExpoAudioModule;
  readonly recording: boolean;
  readonly elapsedMs: number;
  readonly liveBars: readonly number[];
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

export function FeedbackBlock(props: FeedbackBlockProps) {
  const audio = loadExpoAudio();
  return audio !== null && canUploadRatingMedia() ? (
    <FeedbackBlockWithVoice {...props} audio={audio} />
  ) : (
    <FeedbackBlockView {...props} voice={null} />
  );
}

function FeedbackBlockWithVoice({
  audio,
  ...props
}: FeedbackBlockProps & { readonly audio: ExpoAudioModule }) {
  const { draft, onChange } = props;
  // The draft is read at stop time, after other edits may have landed.
  const latest = useRef(draft);
  useEffect(() => {
    latest.current = draft;
  }, [draft]);
  const onRecorded = useCallback(
    (voice: FeedbackVoiceNote) => onChange({ ...latest.current, voice }),
    [onChange],
  );
  const voiceNote = useVoiceNote(audio, onRecorded);
  return <FeedbackBlockView {...props} voice={{ ...voiceNote, audio }} />;
}

function FeedbackBlockView({
  title,
  body,
  draft,
  onChange,
  focus,
  onFocus,
  onOpenMedia,
  disabled = false,
  voice,
  testID,
}: FeedbackBlockProps & { readonly voice: VoiceControl | null }) {
  const field = useRef<TextInput>(null);

  const onVoice = () => {
    if (voice === null) return;
    onFocus('voice');
    if (voice.recording) void voice.stop();
    else void voice.start();
  };
  const onWrite = () => {
    onFocus('write');
    requestAnimationFrame(() => field.current?.focus());
  };

  const showWrite = focus === 'write' || draft.text !== '';

  return (
    <View style={styles.block} testID={testID}>
      <LinearGradient
        colors={[lightTheme.colors.surfaceAccent, lightTheme.colors.surfaceRatingNudge]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.head}>
        {/* Carries the cook's registered name: a long one wraps to a second line (31 Oct 2026). */}
        <Text variant="spoonBodyStrong" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="spoonCaption" color="textSecondarySoft">
          {body}
        </Text>
      </View>

      <View style={styles.tiles}>
        {voice === null ? null : (
          <Tile
            label="Voice"
            icon={FEEDBACK_ART.mic}
            active={focus === 'voice' || voice.recording}
            onPress={onVoice}
            disabled={disabled}
            accessibilityLabel={voice.recording ? 'Stop recording' : 'Record a voice note'}
            testID={`${testID}-voice`}
          />
        )}
        {onOpenMedia === undefined ? null : (
          <Pressable
            onPress={onOpenMedia}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Add photos or a video"
            style={[styles.tile, styles.mediaTile]}
            testID={`${testID}-media`}
          >
            <View style={styles.mediaPill}>
              <Image source={FEEDBACK_ART.gallery} style={styles.icon24} />
              <Image source={FEEDBACK_ART.camera} style={styles.icon20} />
              <Image source={FEEDBACK_ART.video} style={styles.icon20} />
            </View>
            <Text variant="spoonCaptionStrong">Media</Text>
          </Pressable>
        )}
        <Tile
          label="Write"
          icon={FEEDBACK_ART.write}
          active={focus === 'write'}
          onPress={onWrite}
          disabled={disabled}
          accessibilityLabel="Write a note"
          testID={`${testID}-write`}
        />
      </View>

      {voice?.recording === true ? (
        <View style={styles.recording} testID={`${testID}-recording`}>
          <View style={styles.timer}>
            <View style={styles.timerLead}>
              <Pressable
                onPress={() => void voice.stop()}
                accessibilityRole="button"
                accessibilityLabel="Stop recording"
                hitSlop={lightTheme.space.sm}
              >
                <Image source={FEEDBACK_ART.pause} style={styles.icon24} />
              </Pressable>
              <Image source={RATING_ART.liveDot} style={styles.liveDot} />
              <Text variant="spoonEmphasis">{clipTime(voice.elapsedMs)}</Text>
            </View>
          </View>
          <Waveform bars={voice.liveBars} />
        </View>
      ) : draft.voice !== null ? (
        voice === null ? (
          <RecordedNoteView
            note={draft.voice}
            playing={false}
            positionMs={0}
            onDelete={() => onChange({ ...draft, voice: null })}
            disabled={disabled}
            testID={`${testID}-note`}
          />
        ) : (
          <RecordedNote
            audio={voice.audio}
            note={draft.voice}
            onDelete={() => onChange({ ...draft, voice: null })}
            disabled={disabled}
            testID={`${testID}-note`}
          />
        )
      ) : null}

      {draft.media.length === 0 ? null : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbs}
          style={styles.thumbsRow}
          testID={`${testID}-attachments`}
        >
          {draft.media.map((item) => (
            <Thumbnail
              key={item.id}
              item={item}
              onRemove={() =>
                onChange({ ...draft, media: draft.media.filter((entry) => entry.id !== item.id) })
              }
              disabled={disabled}
              testID={`${testID}-thumb-${item.id}`}
            />
          ))}
        </ScrollView>
      )}

      {showWrite ? (
        <Pressable
          onPress={() => field.current?.focus()}
          style={styles.field}
          testID={`${testID}-field`}
        >
          {draft.text === '' ? (
            <View style={styles.prompt} pointerEvents="none">
              <Text variant="spoonBodyStrong">Tap to write your feedback…</Text>
              <Text variant="spoonMicro" color="textSecondarySoft">
                e.g. how the sabzi tasted · was she on time
              </Text>
            </View>
          ) : null}
          <TextInput
            ref={field}
            value={draft.text}
            onChangeText={(text) => onChange({ ...draft, text })}
            onBlur={() => {
              if (draft.text.trim() === '') onFocus(null);
            }}
            editable={!disabled}
            multiline
            maxLength={MAX_FEEDBACK_TEXT}
            style={[styles.input, draft.text === '' ? styles.inputEmpty : null]}
            accessibilityLabel="Your feedback"
            testID={`${testID}-input`}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

function Tile({
  label,
  icon,
  active,
  onPress,
  disabled,
  accessibilityLabel,
  testID,
}: {
  readonly label: string;
  readonly icon: ImageSourcePropType;
  readonly active: boolean;
  readonly onPress: () => void;
  readonly disabled: boolean;
  readonly accessibilityLabel: string;
  readonly testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      style={[styles.tile, styles.flexTile, active ? styles.tileActive : null]}
      testID={testID}
    >
      <View style={[styles.well, active ? styles.wellActive : null]}>
        <Image source={icon} style={styles.icon20} />
      </View>
      <Text variant="spoonCaptionStrong">{label}</Text>
    </Pressable>
  );
}

/**
 * Dev note "Submitted" (`2306:929`, `2306:980`): what was added, read-only, under "Your note to
 * <cook>". The voice note plays, a photo or the video opens full-screen, the words read as
 * written; there is nothing to add or delete. Draws nothing when nothing was added.
 */
export function SubmittedFeedback({
  title,
  draft,
  testID,
}: {
  readonly title: string;
  readonly draft: FeedbackDraft;
  readonly testID: string;
}) {
  const audio = loadExpoAudio();
  const [open, setOpen] = useState<FeedbackMediaItem | null>(null);
  const text = draft.text.trim();
  if (draft.voice === null && draft.media.length === 0 && text === '') return null;

  return (
    <View style={styles.block} testID={testID}>
      <LinearGradient
        colors={[lightTheme.colors.surfaceAccent, lightTheme.colors.surfaceRatingNudge]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <Text variant="spoonBodyStrong" numberOfLines={2}>
        {title}
      </Text>

      {draft.voice === null ? null : audio === null || draft.voice.uri === null ? (
        <RecordedNoteView
          note={draft.voice}
          playing={false}
          positionMs={0}
          disabled
          testID={`${testID}-note`}
        />
      ) : (
        <RecordedNote audio={audio} note={draft.voice} disabled={false} testID={`${testID}-note`} />
      )}

      {draft.media.length === 0 ? null : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbs}
          style={styles.thumbsRow}
          testID={`${testID}-attachments`}
        >
          {draft.media.map((item) => (
            <Thumbnail
              key={item.id}
              item={item}
              onOpen={() => setOpen(item)}
              disabled={false}
              testID={`${testID}-thumb-${item.id}`}
            />
          ))}
        </ScrollView>
      )}

      {text === '' ? null : (
        <Text variant="spoonCaption" testID={`${testID}-text`}>
          {text}
        </Text>
      )}

      {open === null ? null : (
        <MediaViewer item={open} onClose={() => setOpen(null)} testID={`${testID}-viewer`} />
      )}
    </View>
  );
}

function RecordedNote({
  audio,
  note,
  ...rest
}: {
  readonly audio: ExpoAudioModule;
  readonly note: FeedbackVoiceNote;
  readonly onDelete?: () => void;
  readonly disabled: boolean;
  readonly testID: string;
}) {
  const playback = useVoicePlayback(audio, note.uri);
  return (
    <RecordedNoteView
      {...rest}
      note={note}
      playing={playback.playing}
      positionMs={playback.positionMs}
      onToggle={playback.toggle}
    />
  );
}

/** `2093:5759` — play / pause, the length (or the place while playing), the bin; the waveform. */
function RecordedNoteView({
  note,
  playing,
  positionMs,
  onToggle,
  onDelete,
  disabled,
  testID,
}: {
  readonly note: FeedbackVoiceNote;
  readonly playing: boolean;
  readonly positionMs: number;
  readonly onToggle?: () => void;
  /** Absent once the rating is submitted: the note plays but can't be deleted. */
  readonly onDelete?: () => void;
  readonly disabled: boolean;
  readonly testID: string;
}) {
  return (
    <View style={styles.recording} testID={testID}>
      <View style={styles.timer}>
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause voice note' : 'Play voice note'}
          style={styles.timerLead}
          testID={`${testID}-play`}
        >
          <Image
            source={playing ? FEEDBACK_ART.pause : FEEDBACK_ART.playTriangle}
            style={styles.icon24}
          />
          <Text variant="spoonEmphasis">{clipTime(playing ? positionMs : note.durationMs)}</Text>
        </Pressable>
        {onDelete === undefined ? null : (
          <Pressable
            onPress={onDelete}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Delete voice note"
            hitSlop={lightTheme.space.sm}
            testID={`${testID}-delete`}
          >
            <Image source={FEEDBACK_ART.trash} style={styles.icon20} />
          </Pressable>
        )}
      </View>
      <Waveform bars={note.bars} />
    </View>
  );
}

/** `2093:5682` — 2.45pt black bars, 2.52 apart, centred in a 30.8pt band. */
function Waveform({ bars }: { readonly bars: readonly number[] }) {
  return (
    <View style={styles.wave}>
      {bars.map((height, index) => (
        <View key={index} style={[styles.bar, { height: Math.min(WAVE_HEIGHT, height) }]} />
      ))}
    </View>
  );
}

/** `1767:3732` / `1767:3742` — 56pt, r13.18; the remove disc 16.5pt at 36.2, 3.3. */
function Thumbnail({
  item,
  onRemove,
  onOpen,
  disabled,
  testID,
}: {
  readonly item: FeedbackMediaItem;
  /** Absent once the rating is submitted: no remove disc. */
  readonly onRemove?: () => void;
  /** Submitted: a tap opens it full-screen. */
  readonly onOpen?: () => void;
  readonly disabled: boolean;
  readonly testID: string;
}) {
  return (
    <Pressable
      onPress={onOpen}
      disabled={onOpen === undefined}
      accessibilityRole={onOpen === undefined ? undefined : 'button'}
      accessibilityLabel={
        onOpen === undefined ? undefined : item.kind === 'photo' ? 'Open photo' : 'Play video'
      }
      style={styles.thumb}
      testID={testID}
    >
      {item.kind === 'photo' ? (
        <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <VideoFrame uri={item.uri} />
      )}
      {item.kind === 'video' ? (
        <>
          <View style={styles.thumbPlay}>
            <Image source={FEEDBACK_ART.play} style={styles.thumbPlayIcon} />
          </View>
          <Text style={styles.thumbTime}>{clipTime(item.durationMs ?? 0)}</Text>
        </>
      ) : null}
      {onRemove === undefined ? null : (
        <Pressable
          onPress={onRemove}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={item.kind === 'photo' ? 'Remove photo' : 'Remove video'}
          hitSlop={lightTheme.space.sm}
          style={styles.remove}
          testID={`${testID}-remove`}
        >
          <Image source={FEEDBACK_ART.remove} style={styles.removeIcon} />
        </Pressable>
      )}
    </Pressable>
  );
}

/** The video's first frame, paused and muted, under the play disc; dark without `expo-video`. */
function VideoFrame({ uri }: { readonly uri: string }) {
  const video = loadExpoVideo();
  return video === null ? null : <NativeVideoFrame video={video} uri={uri} />;
}

function NativeVideoFrame({
  video,
  uri,
}: {
  readonly video: NonNullable<ReturnType<typeof loadExpoVideo>>;
  readonly uri: string;
}) {
  const player = video.useVideoPlayer(uri, (instance) => {
    instance.muted = true;
  });
  return (
    <video.VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  block: {
    alignSelf: 'stretch',
    gap: lightTheme.space.lg,
    padding: lightTheme.space.lg,
    borderRadius: 20,
    overflow: 'hidden',
  },
  head: { gap: lightTheme.space.xxs },
  tiles: { flexDirection: 'row', alignItems: 'flex-start', gap: lightTheme.space.sm },
  tile: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: lightTheme.space.s10,
    paddingHorizontal: lightTheme.space.xs,
    borderRadius: lightTheme.radius.sm,
    backgroundColor: lightTheme.colors.surface,
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 3, color: 'rgba(0,0,0,0.08)' }],
  },
  flexTile: { flex: 1 },
  /** `2093:5743` — the tile in use: a 1pt black edge, grown by its width (72 × 80). */
  tileActive: {
    borderWidth: 1,
    borderColor: lightTheme.colors.textPrimary,
    paddingVertical: lightTheme.space.s10,
    margin: -1,
  },
  mediaTile: { width: 140 },
  mediaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.space.md,
    paddingHorizontal: lightTheme.space.md,
    paddingVertical: 6,
    borderRadius: lightTheme.radius.sm,
    backgroundColor: lightTheme.colors.surfaceAccentStrong,
  },
  well: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightTheme.colors.surfaceAccentStrong,
  },
  /** `2093:5744` — the well of the tile in use is lime. */
  wellActive: { backgroundColor: lightTheme.colors.surfaceRatingLime },
  icon20: { width: 20, height: 20 },
  icon24: { width: 24, height: 24 },
  recording: { gap: lightTheme.space.sm },
  timer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timerLead: { flexDirection: 'row', alignItems: 'center', gap: lightTheme.space.sm },
  liveDot: { width: 8, height: 8 },
  wave: { height: 30.8, flexDirection: 'row', alignItems: 'center', gap: 2.52 },
  bar: { width: 2.45, borderRadius: 1.225, backgroundColor: lightTheme.colors.textPrimary },
  thumbsRow: { marginHorizontal: -lightTheme.space.lg },
  thumbs: { gap: lightTheme.space.sm, paddingHorizontal: lightTheme.space.lg },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 13.18,
    overflow: 'hidden',
    backgroundColor: lightTheme.colors.textPrimary,
  },
  remove: {
    position: 'absolute',
    left: 36.24,
    top: 3.29,
    width: 16.47,
    height: 16.47,
    borderRadius: 8.24,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  removeIcon: { width: 16.47, height: 16.47 },
  /** `1767:3747` — 23pt white 90 % disc at 16.5, the 17.8pt play at 2.5, 1.2 inside it. */
  thumbPlay: {
    position: 'absolute',
    left: 16.47,
    top: 16.47,
    width: 23.06,
    height: 23.06,
    borderRadius: 11.53,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  thumbPlayIcon: { position: 'absolute', left: 2.47, top: 1.24, width: 17.79, height: 17.79 },
  /** `1767:3750` — SemiBold 8.2 / 11.5, white, at 6.6, 41.2. */
  thumbTime: {
    position: 'absolute',
    left: 6.59,
    top: 41.18,
    fontFamily: lightTheme.fontFamily.semibold,
    fontSize: 8.24,
    lineHeight: 11.53,
    color: lightTheme.colors.surface,
  },
  /** `2093:5892` — black 3 %, 1.5pt dashed `#FFD600`, r8, p8; the prompt sits 2 further in. */
  field: {
    minHeight: 55,
    padding: lightTheme.space.sm,
    borderRadius: lightTheme.radius.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: lightTheme.colors.borderNotice,
    backgroundColor: lightTheme.colors.surfaceRatingQuiet,
  },
  prompt: { position: 'absolute', left: 10, top: 10, right: 10, gap: lightTheme.space.xxs },
  input: {
    minHeight: 36,
    padding: 0,
    fontFamily: lightTheme.fontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    color: lightTheme.colors.textPrimary,
    textAlignVertical: 'top',
  },
  /** Empty: the prompt shows through; the caret starts where the prompt does. */
  inputEmpty: { paddingTop: 2, paddingLeft: 2 },
});
