import { useState } from 'react';
import type { ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { GestureType } from 'react-native-gesture-handler';
import { ScrollView } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import type { AnimatedStyle } from 'react-native-reanimated';

import { Text } from '@ui';
import { lightTheme } from '@ui/theme/ThemeProvider';

import { BAND_CURVE_CARD, CHEVRON_SMALL } from '../art';
import { useDishLikes } from '../data';
import type { CookProfile } from '../types';
import { CookMenu } from './CookMenu';
import { CookProfileHeader } from './CookProfileHeader';
import { YellowBand } from './YellowBand';

/**
 * `Cook card (scrolls vertically)` — Figma `755:2347`.
 *
 * The cook's header and menu, scrolling inside a fixed frame: white, a 1pt `#FFEF99` edge, a 16pt
 * radius and a `0 0 12 #0000001A` lift. A yellow band runs behind the menu from the photo's foot.
 * The scroll cue (`755:2472`) stays pinned to the card's foot — an 88pt fade into `#FFF7CC` with
 * a "Scroll for full menu" pill — until the menu has been scrolled to its end, or when it fits.
 *
 * Each dish carries its heart (`I1384:2942;1380:3081;848:7803`), the household's likes the Cook
 * Profile shows too (`useDishLikes`): a dish liked here is liked there, and the other way.
 */
export interface DeckCardProps {
  readonly profile: CookProfile;
  /** Native gestures for each menu row, so the deck's pan gives way to a row's sideways scroll. */
  readonly rowGestures?: readonly GestureType[] | undefined;
  /** Fades the cue's pill while the card is dragged (`848:6318` draws the fade alone). */
  readonly pillStyle?: AnimatedStyle<ViewStyle> | undefined;
  /** Drawn over the card's content: the drag's tint, edge and indicator. */
  readonly children?: ReactNode;
  readonly testID?: string;
}

export function DeckCard({
  profile,
  rowGestures,
  pillStyle,
  children,
  testID = `deck-card-${profile.cookId}`,
}: DeckCardProps) {
  const [bandTop, setBandTop] = useState(DEFAULT_BAND_TOP);
  const [frameHeight, setFrameHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  const dishLikes = useDishLikes();
  const fits = frameHeight > 0 && contentHeight > 0 && contentHeight <= frameHeight + 1;

  // `755:2348` — the band starts at the photo's foot (116), or under the text if that runs longer.
  const onHeaderLayout = (event: LayoutChangeEvent) =>
    setBandTop(Math.max(event.nativeEvent.layout.height - lightTheme.space.lg, DEFAULT_BAND_TOP));

  const onScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const end =
      nativeEvent.contentOffset.y + nativeEvent.layoutMeasurement.height >=
      nativeEvent.contentSize.height - END_SLACK;
    if (end !== atEnd) setAtEnd(end);
  };

  return (
    <View style={styles.card} testID={testID}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onLayout={(event) => setFrameHeight(event.nativeEvent.layout.height)}
        onContentSizeChange={(_, height) => setContentHeight(height)}
        onScroll={onScroll}
        scrollEventThrottle={32}
      >
        <YellowBand curve={BAND_CURVE_CARD} top={bandTop} />
        <CookProfileHeader profile={profile} onLayout={onHeaderLayout} />
        <CookMenu
          sections={profile.menu}
          favourites={dishLikes.liked}
          onToggleFavourite={dishLikes.toggle}
          rowGestures={rowGestures}
          testID={`${testID}-menu`}
        />
      </ScrollView>
      {fits || atEnd ? null : (
        <LinearGradient
          colors={CUE_COLORS}
          locations={CUE_STOPS}
          style={styles.cue}
          pointerEvents="none"
        >
          <Animated.View style={[styles.pill, pillStyle]}>
            <Text variant="bodyStrong" color="textSubdued">
              Scroll for full menu
            </Text>
            <Image source={CHEVRON_SMALL} style={styles.chevron} />
          </Animated.View>
        </LinearGradient>
      )}
      {children}
    </View>
  );
}

/** 16 (padding) + 100 (photo) — the header's height less its own bottom padding. */
const DEFAULT_BAND_TOP = 116;
const END_SLACK = 8;
const CUE_COLORS = ['rgba(255,247,204,0)', 'rgba(255,247,204,0.9)', '#FFF7CC'] as const;
const CUE_STOPS = [0, 0.55, 1] as const;

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: 1,
    borderColor: lightTheme.colors.borderAccent,
    borderRadius: lightTheme.radius.md,
    backgroundColor: lightTheme.colors.surface,
    boxShadow: '0px 0px 12px 0px rgba(0,0,0,0.1)',
  },
  /** The content clips to the card's inner corners; the lift stays outside them. */
  scroll: { flex: 1, borderRadius: lightTheme.radius.md - 1, overflow: 'hidden' },
  content: { flexGrow: 1 },
  /** `755:2472` — 88 tall at the card's foot, pb 12, the pill centred. */
  cue: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 88,
    paddingBottom: lightTheme.space.md,
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderBottomLeftRadius: lightTheme.radius.md - 1,
    borderBottomRightRadius: lightTheme.radius.md - 1,
  },
  /** `755:2473` — `#FFD600`, pl 12 / pr 8 / py 6, 4 between the label and the chevron. */
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.space.xs,
    paddingLeft: lightTheme.space.md,
    paddingRight: lightTheme.space.sm,
    paddingVertical: lightTheme.space.s6,
    borderRadius: lightTheme.radius.pill,
    backgroundColor: lightTheme.colors.surfaceBrand,
  },
  /** `755:2475` — the right chevron turned to point down. */
  chevron: { width: 16, height: 16, transform: [{ rotate: '90deg' }] },
});
