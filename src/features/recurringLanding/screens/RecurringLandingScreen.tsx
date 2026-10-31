import { useCallback, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ScreenHeader, Text } from '@ui';
import { lightTheme } from '@ui/theme/ThemeProvider';

import { HERO_THREAD, LIKE_ICON, LOCK_OPEN_ICON, THREAD_TAIL } from '../art';
import { ExplainerCard } from '../components/ExplainerCard';
import type { ExplainerVideoSource } from '../components/ExplainerPlayer';
import { ExplainerPlayer } from '../components/ExplainerPlayer';
import { FeatureRow } from '../components/FeatureRow';
import { RailMarker } from '../components/RailMarker';
import { RECURRING_CTA_LABEL, ScheduleTag } from '../components/ScheduleTag';
import type { RecurringCta } from '../components/ScheduleTag';
import { StickyFooter, useStickyFooter } from '../components/StickyFooter';
import { TicketRow } from '../components/TicketRow';
import {
  EXPLAINER_HEADING,
  EXPLAINER_HEADING_WATCHED,
  EXPLAINER_SUBHEAD,
  FEATURES,
  SAMPLE_TICKETS,
  TAGLINE,
} from '../content';

/**
 * Recurring landing — Figma `cCQlzTeiObQkpVBzwI8mZi` (Spoon — User), page "Recurring flow:
 * Booking": `970:5392` (the top), `970:5397` (scrolled to the end), `970:5546` (the video playing)
 * and `970:5472` (the end again, once the video has been watched).
 *
 * One page that scrolls: a hero with a yellow thread running down it, the headline and, hanging
 * off the thread's knot, the lime "Book Recurring" tag; then, along the thread's rail, "Unlock by
 * creating your Cook Pool" (with three sample bookings and the Cook Pool button: "Check your Cook
 * Pool" (`983:6046`) once the household has a cook in its pool, "Make your Cook Pool" while it
 * is empty or not yet known), "One time
 * planning, familiar cooks", and the explainer video's card. The thread's tail ends the page.
 *
 * ## One schedule button at a time
 *
 * Both the "Book Recurring" tag (`983:6077`) and the sticky footer's "Book Recurring"
 * (`970:5471`) are `onSchedule`. The tag is
 * the button while it is on screen; once it has scrolled off the top the footer slides in, and
 * out again when the tag returns (`stickyFooter.ts`).
 *
 * Both follow `cta` (the page's design notes): while the Cook Pool is below the unlock they stay
 * "Book Recurring" but disabled; once the household has a live Recurring booking both read
 * "Recurring · Live" and open it (`onOpenLive`).
 *
 * ## The video
 *
 * The explainer's card opens the player (`ExplainerPlayer`), which sits over the dimmed page.
 * When the playhead reaches the end — played there or scrubbed there — the player closes and the
 * page is "watched": the heading drops "Cook Pool" from its list and the card offers a replay.
 * Watched is held here, for the life of the screen. There is no video file or player library yet;
 * see `ExplainerPlayer` for what the real one needs.
 *
 * The status bar's strip and the screen header are the page's own in the frames, so the header
 * scrolls away with the page; the page scrolls below the safe area's top edge.
 */
export interface RecurringLandingScreenProps {
  readonly onBack: () => void;
  /** The "Book Recurring" tag and footer: both open the plan flow. */
  readonly onSchedule: () => void;
  /** What the tag and footer offer: book (the default), locked (disabled) or the live booking. */
  readonly cta?: RecurringCta;
  /** The "Recurring · Live" tag and footer: open the live booking. */
  readonly onOpenLive?: () => void;
  /** The Cook Pool button ("Make your Cook Pool" / "Check your Cook Pool"). */
  readonly onMakeCookPool: () => void;
  /**
   * Whether the household's Cook Pool has at least one cook: the button then reads "Check your
   * Cook Pool" (`983:6046`). False or absent (empty, or not known yet) reads "Make your Cook Pool".
   */
  readonly hasCookPool?: boolean;
  /** The explainer video. Absent until there is one. */
  readonly videoSource?: ExplainerVideoSource;
  /** Where the page opens: scrolled to the top (the default) or to the end. For previews. */
  readonly initialScroll?: 'top' | 'end';
  /** Opens with the video already watched. For previews. */
  readonly initialWatched?: boolean;
  /** Opens with the player up, its playhead at this many seconds. For previews. */
  readonly initialPlayerAt?: number;
  readonly testID?: string;
}

export function RecurringLandingScreen({
  onBack,
  onSchedule,
  cta = 'book',
  onOpenLive,
  onMakeCookPool,
  hasCookPool = false,
  videoSource,
  initialScroll = 'top',
  initialWatched = false,
  initialPlayerAt,
  testID = 'recurring-landing',
}: RecurringLandingScreenProps) {
  const footer = useStickyFooter();
  const scrollRef = useRef<Animated.ScrollView>(null);
  // A page that opens at its end keeps following the end until the customer drags it: the
  // footer's measured height grows the content after the first scroll, and the thread's tail must
  // still end on the footer (`970:5397`).
  const followEnd = useRef(initialScroll === 'end');
  const [watched, setWatched] = useState(initialWatched);
  const [playerAt, setPlayerAt] = useState<number | null>(initialPlayerAt ?? null);
  const [footerHeight, setFooterHeight] = useState(FOOTER_HEIGHT);
  const { jumpTo } = footer;
  // A live page without a way to open its booking offers the flow instead of a dead button.
  const shown: RecurringCta = cta === 'live' && onOpenLive === undefined ? 'book' : cta;
  const onCta = shown === 'live' && onOpenLive !== undefined ? onOpenLive : onSchedule;

  const openPlayer = useCallback(() => setPlayerAt(0), []);
  const closePlayer = useCallback(() => setPlayerAt(null), []);
  const onEnded = useCallback(() => {
    setWatched(true);
    setPlayerAt(null);
  }, []);

  // A page that opens at its end has the footer in already, without sliding.
  const onContentSizeChange = useCallback(() => {
    if (!followEnd.current) return;
    scrollRef.current?.scrollToEnd({ animated: false });
    jumpTo(true);
  }, [jumpTo]);
  const onScrollBeginDrag = useCallback(() => {
    followEnd.current = false;
  }, []);

  return (
    <View style={styles.screen} testID={testID}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <Animated.ScrollView
          ref={scrollRef}
          onScroll={footer.onScroll}
          scrollEventThrottle={16}
          onContentSizeChange={onContentSizeChange}
          onScrollBeginDrag={onScrollBeginDrag}
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={false}
          contentContainerStyle={{ paddingBottom: footerHeight }}
          testID={`${testID}-scroll`}
        >
          <View>
            {/* `983:6025` — the thread over the hero, from the page's very top (the status bar's
                54 above the header, which the safe area now takes). */}
            <Image source={HERO_THREAD} style={styles.hero} />

            <ScreenHeader
              density="nav"
              title="Recurring"
              onBack={onBack}
              transparent
              testID={`${testID}-header`}
            />

            {/* `983:6029` — 216 tall, p 16. */}
            <View style={styles.headline}>
              <View style={styles.headlineColumn}>
                <Text variant="display" color="textBrand">
                  Book for multiple days at once!
                </Text>
                <Text variant="bodyLargeStrong" color="textSubdued" style={styles.tagline}>
                  {TAGLINE}
                </Text>
              </View>
            </View>

            {/* `983:6033` — the thread's rail down the left, the content 40 in from it. */}
            <View style={styles.body}>
              <View style={styles.rail} />
              <Image source={THREAD_TAIL} style={styles.tail} />

              <View style={styles.content}>
                {/* `983:6036` */}
                <View style={styles.section}>
                  <View>
                    <RailMarker source={LOCK_OPEN_ICON} headingHeight={HEADING_HEIGHT} />
                    <Text variant="headingSection" color="textPrimary" accessibilityRole="header">
                      Unlock by creating your Cook Pool
                    </Text>
                  </View>
                  <Text variant="bodyLarge" color="textSubdued">
                    Curate your schedule in{' '}
                    <Text variant="title" color="textSubdued">
                      3 easy steps
                    </Text>
                    . Your preferred cooks service each visit. You{' '}
                    <Text variant="title" color="textSubdued">
                      pay as you go, so no upfront commitments
                    </Text>
                    !
                  </Text>
                  <TicketRow tickets={SAMPLE_TICKETS} testID={`${testID}-tickets`} />
                  <Button
                    label={hasCookPool ? 'Check your Cook Pool' : 'Make your Cook Pool'}
                    onPress={onMakeCookPool}
                    size="pillLg"
                    flat
                    labelColor="textPrimary"
                    style={styles.cookPoolButton}
                    testID={`${testID}-cook-pool`}
                  />
                </View>

                {/* `983:6047` */}
                <View style={styles.section}>
                  <View>
                    <RailMarker source={LIKE_ICON} headingHeight={HEADING_HEIGHT} />
                    <Text variant="headingSection" color="textPrimary" accessibilityRole="header">
                      One time planning, familiar cooks
                    </Text>
                  </View>
                  <View style={styles.features}>
                    {FEATURES.map((feature) => (
                      <FeatureRow
                        key={feature.title}
                        feature={feature}
                        testID={`${testID}-feature-${feature.title}`}
                      />
                    ))}
                  </View>
                </View>

                {/* `970:5448` (and `970:5523`, watched: 12 between the three, not 16 before the card) */}
                <View style={[styles.explainer, watched ? styles.explainerWatched : null]}>
                  <View style={styles.explainerCopy}>
                    <Text variant="emphasis" color="textPrimary" accessibilityRole="header">
                      {watched ? EXPLAINER_HEADING_WATCHED : EXPLAINER_HEADING}
                    </Text>
                    <Text variant="bodyLarge" color="textExplainer">
                      {EXPLAINER_SUBHEAD}
                    </Text>
                  </View>
                  <ExplainerCard
                    watched={watched}
                    onPress={openPlayer}
                    testID={`${testID}-explainer`}
                  />
                </View>
              </View>
            </View>

            {/* `983:6074` — the tag hangs off the thread's knot, 250 from the frame's top. */}
            <View style={styles.tag} pointerEvents="box-none">
              <ScheduleTag onPress={onCta} cta={shown} testID={`${testID}-tag`} />
            </View>
          </View>
        </Animated.ScrollView>
      </SafeAreaView>

      <StickyFooter
        state={footer}
        label={RECURRING_CTA_LABEL[shown]}
        onPress={onCta}
        disabled={shown === 'locked'}
        onHeight={setFooterHeight}
        testID={`${testID}-footer`}
      />

      {playerAt === null ? null : (
        <ExplainerPlayer
          {...(videoSource === undefined ? {} : { source: videoSource })}
          initialPosition={playerAt}
          onEnded={onEnded}
          onClose={closePlayer}
          testID={`${testID}-player`}
        />
      )}
    </View>
  );
}

/** `970:5470` — the footer's height before it has laid out. */
const FOOTER_HEIGHT = 72;
/** `983:6037` — a section heading's line height, which its rail marker is centred on. */
const HEADING_HEIGHT = 26;
/** `983:6073` — the tail's frame: 159 tall (its stroke overhangs by 4), the rail ending where it begins. */
const TAIL_HEIGHT = 159;
/**
 * The rail runs this far past the last of the content before the tail takes over: `970:5408` is
 * 848 tall under 16 + 790 of content (`970:5409`), so 42.
 */
const RAIL_PAST_CONTENT = 42;
/** `983:6074` — the tag's top in the frame, 250, less the status bar's 54. */
const TAG_TOP = 196;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: lightTheme.colors.surface },
  safe: { flex: 1 },
  /** `983:6025` — 434 × 334, from 8 left of the page. The status bar's 54 are above the safe area. */
  hero: { position: 'absolute', top: -54, left: -8, width: 434, height: 334 },
  headline: { height: 216, padding: lightTheme.space.lg },
  /** `983:6030` — 210 wide, 16 between the headline and the tagline. */
  headlineColumn: { width: 210, gap: lightTheme.space.lg },
  tagline: { width: 148 },
  /** `983:6033` — px 16, pt 16; the content 24 in from the rail and 16 from the right. */
  body: {
    paddingTop: lightTheme.space.lg,
    paddingLeft: 40,
    paddingRight: lightTheme.space.lg,
    paddingBottom: RAIL_PAST_CONTENT + TAIL_HEIGHT,
  },
  /** `983:6034` — an 8pt `#FFEF99` rail, its bottom corners rounded, down to where the tail starts. */
  rail: {
    position: 'absolute',
    top: 0,
    bottom: TAIL_HEIGHT,
    left: lightTheme.space.lg,
    width: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: lightTheme.colors.surfaceAccentStrong,
  },
  /** `970:5463` — 390 × 167, its stroke's 4 beyond the frame on every side. */
  tail: { position: 'absolute', left: lightTheme.space.lg, bottom: -4, width: 390, height: 167 },
  /** `983:6035` — 24 between sections. */
  content: { gap: lightTheme.space.xl },
  /** `983:6036` / `983:6047` — 12 between a heading and what follows. */
  section: { gap: lightTheme.space.md },
  /** `983:6046` — the file's `#FFE666` Button. */
  cookPoolButton: { backgroundColor: lightTheme.colors.surfaceBrandTint },
  features: { gap: lightTheme.space.md },
  /** `970:5448` — 16 between the texts and the card. */
  explainer: { gap: lightTheme.space.lg },
  explainerWatched: { gap: lightTheme.space.md },
  explainerCopy: { gap: lightTheme.space.md },
  tag: { position: 'absolute', top: TAG_TOP, right: lightTheme.space.lg },
});
