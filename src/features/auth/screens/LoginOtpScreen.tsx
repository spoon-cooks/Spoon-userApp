import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  LayoutAnimation,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { LOGIN_ART } from '../login/art';
import { LoginShell, useOverlayTop } from '../login/LoginShell';
import { LoginToast } from '../login/LoginToast';
import { C, F, SHADOW_BUTTON, SHADOW_PILL, SHADOW_SOFT } from '../login/theme';
import { useKeyboardLayout } from '../login/useKeyboardLayout';
import type { LoginOtpViewModel } from '../types';

/**
 * Login OTP — Figma page "Login": `1934:1080` (2a, code entered), `1934:1358` (2b, resend offered),
 * `1934:1648` (2c, wrong code) and their keyboard versions, built to dev notes `1949:2211`,
 * `1949:2219`, `1949:2227` and `1949:2266`–`1949:2282`.
 *
 *   back     `1934:1319` — a 40pt white disc, Elevation/2, over the photo at (16, top + 8)
 *   title    `1934:1324` — Display Large "Enter your" + "OTP" on a 63 × 14 `#FFD600` marker
 *   sent to  `1934:1329` — "Sent to **+91 98765 43210**" and the 28pt Edit pill
 *   cells    `1934:1337` — six 50 × 58 cells at radius 16, spaced across the full width
 *   resend   `1934:1350` — "Didn’t get the code?" + the 36pt timer pill, or "Resend via SMS"
 *
 * One hidden numeric input sits behind the cells (the cells only display it), so paste and the iOS
 * one-time-code suggestion fill all six at once. There is no Verify button: the 6th digit submits,
 * and the same rejected code is never sent twice — the customer retries by editing a digit.
 *
 * The screen draws states; the host decides them. `verifying`, `errorMessage` and `resend` come in
 * as props, and every network call is the host's.
 */
export type ResendState =
  /** The timer pill, pre-formatted ("Resend in 0:25"). Not tappable. */
  | { readonly kind: 'countdown'; readonly label: string }
  | { readonly kind: 'available'; readonly sending?: boolean }
  /** The send limit was hit: plain text in the pill's place. */
  | { readonly kind: 'limited'; readonly message: string };

export interface LoginOtpScreenProps {
  readonly otp: LoginOtpViewModel;
  /** "+91 98765 43210". */
  readonly phoneLabel: string;
  readonly verifying: boolean;
  /** The rejected-code message. Its presence draws the 2c state and shakes the cells once. */
  readonly errorMessage?: string;
  readonly resend: ResendState;
  /** One-line toast; a new `id` shows it again. */
  readonly notice?: { readonly id: number; readonly message: string } | null;
  /** Changing this clears the cells and keeps focus in the first one (after a resend). */
  readonly resetKey?: number;
  readonly onVerify: (code: string) => void;
  /** Any edit — the host clears the error with it. */
  readonly onChangeCode?: () => void;
  readonly onResend: () => void;
  /** Back and Edit do the same thing: return to Login with the number. */
  readonly onBack: () => void;
  readonly testID?: string;
}

/** `1934:1322` starts 374pt above the bottom edge; the curve 60pt above that. */
const CONTENT_FROM_BOTTOM = 374;
const CURVE_LEAD = 60;

export function LoginOtpScreen({
  otp,
  phoneLabel,
  verifying,
  errorMessage,
  resend,
  notice = null,
  resetKey = 0,
  onVerify,
  onChangeCode,
  onResend,
  onBack,
  testID = 'login-otp-screen',
}: LoginOtpScreenProps) {
  const [code, setCode] = useState('');
  /** A render that changes nothing but makes the TextInput re-apply `value` to its native text. */
  const [, resync] = useReducer((n: number) => n + 1, 0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const keyboardHeight = useKeyboardLayout();
  const overlayTop = useOverlayTop();
  const [shake] = useState(() => new Animated.Value(0));

  const showError = errorMessage !== undefined;

  /*
   * The last code the server rejected — never submitted again. Captured the moment a new error
   * arrives (state adjusted during render, React's pattern for "a prop changed"), and dropped when
   * a resend clears the cells.
   */
  const [rejected, setRejected] = useState<string | null>(null);
  const [seenError, setSeenError] = useState(errorMessage);
  if (errorMessage !== seenError) {
    // 2c keyboard note: the error line slides the content up (and back) over 150 ms.
    LayoutAnimation.configureNext(LayoutAnimation.create(150, 'easeOut', 'opacity'));
    setSeenError(errorMessage);
    if (errorMessage !== undefined) setRejected(code);
  }
  const [seenReset, setSeenReset] = useState(resetKey);
  if (resetKey !== seenReset) {
    setSeenReset(resetKey);
    setCode('');
    setRejected(null);
  }

  // 2c: shake the row once (8pt, 0.5 s) with an error haptic.
  const shakeRow = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    shake.setValue(0);
    Animated.timing(shake, {
      toValue: 1,
      duration: 500,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [shake]);

  useEffect(() => {
    if (errorMessage === undefined) return;
    AccessibilityInfo.announceForAccessibility(errorMessage);
    shakeRow();
  }, [errorMessage, shakeRow]);

  // After a resend, focus stays in the first cell.
  useEffect(() => {
    if (resetKey !== 0) inputRef.current?.focus();
  }, [resetKey]);

  const onChange = (text: string) => {
    // "While verifying: boxes are locked … keyboard stays up." The lock is here, not `editable`:
    // a non-editable TextInput resigns focus on iOS, which would close the keyboard. Re-rendering
    // the unchanged `code` puts the native text back.
    if (verifying) {
      resync();
      return;
    }
    const next = text.replace(/\D/g, '').slice(0, otp.digitCount);
    setCode(next);
    onChangeCode?.();
    if (next.length === otp.digitCount && next !== rejected && !verifying) {
      onVerify(next);
    }
  };

  const translateX = shake.interpolate({
    inputRange: [0, 0.125, 0.375, 0.625, 0.875, 1],
    outputRange: [0, 8, -8, 8, -8, 0],
  });
  const keyboardOpen = keyboardHeight > 0;
  const gap = keyboardOpen ? 16 : 24;
  const complete = code.length === otp.digitCount;

  /*
   * `1945:1692` "Verify & continue" — Figma draws it only in the keyboard frames; the app shows it
   * at all times (owner, 2026-10-30). Disabled until all six digits are in. The 6th digit still submits on its own; the button is the explicit retry. A code
   * the server already rejected is never sent again: tapping then replays the shake instead.
   */
  const onVerifyPress = () => {
    if (!complete || verifying) return;
    if (code === rejected) {
      shakeRow();
      inputRef.current?.focus();
      return;
    }
    onVerify(code);
  };
  const activeIndex = focused && !verifying && !showError ? code.length : -1;

  return (
    <View style={styles.fill}>
      <LoginShell
        keyboardHeight={keyboardHeight}
        contentFromBottom={CONTENT_FROM_BOTTOM}
        curveLead={CURVE_LEAD}
        testID={testID}
        overlay={
          <Pressable
            onPress={onBack}
            disabled={verifying}
            accessibilityRole="button"
            accessibilityLabel={otp.backLabel}
            hitSlop={4}
            style={({ pressed }) => [styles.back, { top: overlayTop }, pressed && styles.pressed]}
            testID={`${testID}-back`}
          >
            <Image source={LOGIN_ART.chevronLeft} style={styles.backIcon} />
          </Pressable>
        }
      >
        <View style={[styles.content, { gap }]}>
          <View style={styles.headline}>
            <View style={styles.title} accessible accessibilityRole="header">
              <Text style={styles.titleText}>{otp.titleLead}</Text>
              <View style={styles.highlight}>
                <View style={styles.marker} />
                <Text style={[styles.titleText, styles.markerText]}>{otp.titleMarker}</Text>
              </View>
            </View>
            <View style={styles.sentTo}>
              <Text style={styles.sentToText}>
                {otp.sentToLead}
                <Text style={styles.sentToPhone}>{phoneLabel}</Text>
              </Text>
              <Pressable
                onPress={onBack}
                disabled={verifying}
                accessibilityRole="button"
                accessibilityLabel={`${otp.editLabel} ${phoneLabel}`}
                hitSlop={8}
                style={({ pressed }) => [styles.editPill, pressed && styles.pressed]}
                testID={`${testID}-edit`}
              >
                <Image source={LOGIN_ART.edit} style={styles.pillIcon} />
                <Text style={styles.pillText}>{otp.editLabel}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.otp}>
            <Pressable
              onPress={() => inputRef.current?.focus()}
              accessible={false}
              style={styles.cellsHit}
            >
              <Animated.View style={[styles.cells, { transform: [{ translateX }] }]}>
                {Array.from({ length: otp.digitCount }, (_, index) => (
                  <Cell
                    key={index}
                    digit={code[index]}
                    active={index === activeIndex}
                    error={showError}
                  />
                ))}
              </Animated.View>
              <TextInput
                ref={inputRef}
                value={code}
                onChangeText={onChange}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                autoFocus
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={otp.digitCount}
                // Digits always go in at the end and delete from the end (the boxes fill left to
                // right); the native cursor must never drift into the middle of the code.
                selection={{ start: code.length, end: code.length }}
                caretHidden
                contextMenuHidden={false}
                style={styles.hiddenInput}
                accessibilityLabel={`${otp.titleLead} ${otp.titleMarker}`}
                testID={`${testID}-input`}
              />
            </Pressable>

            {showError ? (
              <View style={styles.error} testID={`${testID}-error`}>
                <Image source={LOGIN_ART.exclamation} style={styles.errorIcon} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.resend}>
            {resend.kind === 'limited' ? (
              <Text style={styles.resendPrompt} testID={`${testID}-limited`}>
                {resend.message}
              </Text>
            ) : (
              <>
                <Text style={styles.resendPrompt}>{otp.resendPrompt}</Text>
                {resend.kind === 'countdown' ? (
                  <View style={[styles.pill, styles.timerPill]} testID={`${testID}-timer`}>
                    <Image source={LOGIN_ART.time} style={styles.pillIcon} />
                    <Text style={[styles.pillText, styles.timerText]}>{resend.label}</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={onResend}
                    disabled={resend.sending === true}
                    accessibilityRole="button"
                    accessibilityLabel={otp.resendLabel}
                    accessibilityState={{ busy: resend.sending === true }}
                    // The pill is 36pt; the tap area is at least 44 (dev note 2b).
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    style={({ pressed }) => [
                      styles.pill,
                      styles.resendPill,
                      pressed && styles.pressed,
                    ]}
                    testID={`${testID}-resend`}
                  >
                    <Image source={LOGIN_ART.restart} style={styles.pillIcon} />
                    <Text style={styles.pillText}>{otp.resendLabel}</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>

          {/* Always shown, keyboard up or down (owner, 2026-10-30); Figma draws it only in the
              keyboard frames. The spinner while verifying sits in it. */}
          <Pressable
            onPress={onVerifyPress}
            disabled={!complete || verifying}
            accessibilityRole="button"
            accessibilityLabel={otp.verifyLabel}
            accessibilityState={{ disabled: !complete || verifying, busy: verifying }}
            style={({ pressed }) => [
              styles.cta,
              SHADOW_BUTTON,
              complete ? styles.ctaEnabled : styles.ctaDisabled,
              pressed && complete && styles.pressed,
            ]}
            testID={`${testID}-verify`}
          >
            {verifying ? (
              <ActivityIndicator color={C.text} testID={`${testID}-verifying`} />
            ) : (
              <Text style={[styles.ctaLabel, !complete && styles.ctaLabelDisabled]}>
                {otp.verifyLabel}
              </Text>
            )}
          </Pressable>
        </View>
      </LoginShell>
      <LoginToast notice={notice} keyboardHeight={keyboardHeight} />
    </View>
  );
}

/**
 * One cell. Empty = `#FFF7CC`; active = white with a 2pt yellow outline and a blinking caret
 * (0.5 s on, 0.5 s off); filled = white with a 1.5pt yellow outline; rejected = 1.5pt black
 * outline with the digit at 60 %.
 */
function Cell({
  digit,
  active,
  error,
}: {
  digit: string | undefined;
  active: boolean;
  error: boolean;
}) {
  const filled = digit !== undefined;
  return (
    <View
      style={[
        styles.cell,
        error
          ? styles.cellError
          : active
            ? [styles.cellActive, SHADOW_SOFT]
            : filled
              ? [styles.cellFilled, SHADOW_SOFT]
              : styles.cellEmpty,
      ]}
    >
      {filled ? (
        <Text style={[styles.digit, error && styles.digitError]}>{digit}</Text>
      ) : active ? (
        <Caret />
      ) : null}
    </View>
  );
}

function Caret() {
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const step = (toValue: number) =>
      Animated.timing(opacity, { toValue, duration: 0, delay: 500, useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([step(0), step(1)]));
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.caret, { opacity }]} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { width: '100%', alignItems: 'center' },
  back: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.base,
    ...SHADOW_PILL,
  },
  backIcon: { width: 24, height: 24 },
  headline: { alignItems: 'center', gap: 8 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  /** Spoon/Display Large — Bold 28/32, −0.56 tracking. */
  titleText: {
    fontFamily: F.bold,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.56,
    color: C.text,
    // iOS sets Livvic Bold 28 in a 32pt line 1.5pt higher than Figma does (measured against
    // `1934:1358`; the 14/20 lines beside it match exactly). The marker is positioned on its own.
    transform: [{ translateY: 1.5 }],
  },
  /** `1934:1326` — "OTP" over a 63 × 14 marker that starts 16pt down. */
  highlight: { height: 32, minWidth: 63, justifyContent: 'flex-start' },
  marker: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 16,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.brand,
  },
  markerText: { paddingHorizontal: 4 },
  sentTo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  /** Spoon/Body at 60 %, the number SemiBold black. */
  sentToText: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.textSecondary },
  sentToPhone: { fontFamily: F.semibold, color: C.text },
  editPill: {
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 9999,
    backgroundColor: C.subtle,
  },
  pillIcon: { width: 16, height: 16 },
  /** Spoon/Caption Strong. */
  pillText: { fontFamily: F.semibold, fontSize: 12, lineHeight: 16, color: C.text },
  otp: { width: '100%', alignItems: 'center', gap: 12 },
  cellsHit: { width: '100%' },
  cells: { width: '100%', flexDirection: 'row', justifyContent: 'space-between' },
  cell: {
    width: 50,
    height: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellEmpty: { backgroundColor: C.subtle },
  cellActive: { backgroundColor: C.base, borderWidth: 2, borderColor: C.brand },
  cellFilled: { backgroundColor: C.base, borderWidth: 1.5, borderColor: C.brand },
  cellError: { backgroundColor: C.base, borderWidth: 1.5, borderColor: C.borderStrong },
  /** Spoon/Display — Bold 24/32. */
  digit: { fontFamily: F.bold, fontSize: 24, lineHeight: 32, color: C.text },
  digitError: { color: C.textSecondary },
  caret: { width: 2, height: 26, borderRadius: 1, backgroundColor: C.text },
  hiddenInput: {
    ...StyleSheet.absoluteFill,
    opacity: 0.011,
    color: 'transparent',
  },
  error: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  errorIcon: { width: 16, height: 16 },
  errorText: { fontFamily: F.semibold, fontSize: 12, lineHeight: 16, color: C.text, flexShrink: 1 },
  resend: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resendPrompt: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.textSecondary },
  pill: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    borderRadius: 9999,
  },
  timerPill: { backgroundColor: C.subtle },
  timerText: { color: C.textSecondary },
  resendPill: { backgroundColor: C.tint },
  /** `1945:1692` — the shared Button, Primary / Disabled. */
  cta: {
    width: '100%',
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaEnabled: { backgroundColor: C.brand },
  ctaDisabled: { backgroundColor: C.surfaceDisabledVerify },
  ctaLabel: { fontFamily: F.bold, fontSize: 16, lineHeight: 24, color: C.text },
  ctaLabelDisabled: { color: C.textDisabled },
  pressed: { opacity: 0.85 },
});
