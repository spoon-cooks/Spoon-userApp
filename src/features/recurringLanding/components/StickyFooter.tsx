import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Button, useBottomGutter } from '@ui';
import { lightTheme } from '@ui/theme/ThemeProvider';

import {
  FOOTER_IN_CURVE,
  FOOTER_IN_MS,
  FOOTER_OUT_CURVE,
  FOOTER_OUT_MS,
  footerVisibleAt,
} from '../stickyFooter';

/**
 * The sticky "Book Recurring" footer — `970:5470`, with the show/hide behaviour of the page's
 * design notes (`983:6006` …): parked below the screen while the "Book Recurring" tag is on it, and
 * slid in once the tag has scrolled away (`stickyFooter.ts` holds the rule).
 *
 * `useStickyFooter` gives the page the scroll handler to attach to its `Animated.ScrollView` and
 * the footer's state; `StickyFooter` draws it. The rule runs on the UI thread, in the scroll
 * handler, so it needs no round trip per frame; only a change of state crosses to JS, to start
 * the slide and to take the parked footer out of reach of touch and screen readers.
 */
export interface StickyFooterState {
  /** Progress of the slide: 0 parked below the screen, 1 in place. */
  readonly progress: SharedValue<number>;
  /** Whether the footer is in (or sliding in): when it can be touched and read. */
  readonly interactive: boolean;
  /** Attach to the page's `Animated.ScrollView`. */
  readonly onScroll: ReturnType<typeof useAnimatedScrollHandler>;
  /** Puts the footer in or out at once, with no slide — for a page that opens already scrolled. */
  readonly jumpTo: (visible: boolean) => void;
}

const SLIDE_IN = { duration: FOOTER_IN_MS, easing: Easing.bezier(...FOOTER_IN_CURVE) };
const SLIDE_OUT = { duration: FOOTER_OUT_MS, easing: Easing.bezier(...FOOTER_OUT_CURVE) };

export function useStickyFooter(): StickyFooterState {
  const progress = useSharedValue(0);
  const visible = useSharedValue(false);
  const [interactive, setInteractive] = useState(false);

  const slide = useCallback(
    (show: boolean) => {
      setInteractive(show);
      progress.set(withTiming(show ? 1 : 0, show ? SLIDE_IN : SLIDE_OUT));
    },
    [progress],
  );

  const onScroll = useAnimatedScrollHandler((event) => {
    const next = footerVisibleAt(visible.get(), event.contentOffset.y);
    if (next === visible.get()) return;
    visible.set(next);
    scheduleOnRN(slide, next);
  });

  const jumpTo = useCallback(
    (show: boolean) => {
      visible.set(show);
      setInteractive(show);
      progress.set(show ? 1 : 0);
    },
    [progress, visible],
  );

  return { progress, interactive, onScroll, jumpTo };
}

export interface StickyFooterProps {
  readonly state: Pick<StickyFooterState, 'progress' | 'interactive'>;
  readonly label: string;
  readonly onPress: () => void;
  /** Greyed and not pressable — the Cook Pool is below the unlock. */
  readonly disabled?: boolean;
  /** Reports the footer's height, for the page to leave room for it at the end of its scroll. */
  readonly onHeight?: (height: number) => void;
  readonly testID?: string;
}

export function StickyFooter({
  state,
  label,
  onPress,
  disabled = false,
  onHeight,
  testID = 'sticky-footer',
}: StickyFooterProps) {
  // `970:5470` — 72 tall (py 12 around the 48pt button), over the safe area's own gutter.
  const gutter = useBottomGutter(lightTheme.space.md);
  // "translateY 100 %": the slide is as far as the footer is tall, known once it has laid out.
  const height = useSharedValue(FOOTER_HEIGHT);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const next = event.nativeEvent.layout.height;
      height.set(next);
      onHeight?.(next);
    },
    [height, onHeight],
  );

  // Only the shared value goes into the worklet: capturing `state` would drag along everything
  // else on it, including the scroll handler, which cannot be copied to the UI thread.
  const { progress } = state;
  const style = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * height.get() }],
  }));

  return (
    <Animated.View
      onLayout={onLayout}
      pointerEvents={state.interactive ? 'auto' : 'none'}
      accessibilityElementsHidden={!state.interactive}
      importantForAccessibility={state.interactive ? 'auto' : 'no-hide-descendants'}
      style={[styles.footer, { paddingBottom: gutter }, style]}
      testID={testID}
    >
      <Button
        label={label}
        onPress={onPress}
        disabled={disabled}
        disabledTone="soft"
        size="pillLg"
        flat
        labelColor="textPrimary"
        testID={`${testID}-cta`}
      />
    </Animated.View>
  );
}

/** `970:5470` — the footer's height before it has laid out. */
const FOOTER_HEIGHT = 72;

const styles = StyleSheet.create({
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: lightTheme.space.lg,
    paddingTop: lightTheme.space.md,
    backgroundColor: lightTheme.colors.surface,
  },
});
