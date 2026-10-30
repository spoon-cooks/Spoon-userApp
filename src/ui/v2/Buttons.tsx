import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import type { Ref } from 'react';
import type { StyleProp, View, ViewStyle } from 'react-native';

import { C, SHADOW_HAIRLINE, T } from './theme';

/**
 * A button label is one line. Android measures Livvic a hair narrower than it draws it, so a label
 * sized to its text wrapped its last word onto a line the button hides ("Go to home" for "Go to
 * home now") — `simple` breaking measures the line as it is drawn, as on the Account labels.
 */
const ONE_LINE = { numberOfLines: 1, textBreakStrategy: 'simple' } as const;

/** The shared Button (`90:180`) — Primary, and Disabled while not yet available. */
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  style,
  ref,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  /** For a caller that moves screen-reader focus to it (a sheet's default action). */
  ref?: Ref<View>;
  testID: string;
}) {
  const inert = disabled || loading;
  return (
    <Pressable
      ref={ref}
      onPress={() => {
        if (!inert) onPress();
      }}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inert, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        SHADOW_HAIRLINE,
        disabled ? styles.buttonDisabled : styles.buttonEnabled,
        pressed && !inert && styles.pressed,
        style,
      ]}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator color={C.text} />
      ) : (
        <Text style={[styles.buttonLabel, disabled && styles.buttonLabelDisabled]} {...ONE_LINE}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** The Button's Destructive variant — a monochrome 1.5pt outline ("Delete"). */
export function OutlineButton({
  label,
  onPress,
  loading = false,
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  testID: string;
}) {
  return (
    <Pressable
      onPress={() => {
        if (!loading) onPress();
      }}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: loading }}
      style={({ pressed }) => [
        styles.button,
        styles.outline,
        SHADOW_HAIRLINE,
        pressed && styles.pressed,
        style,
      ]}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator color={C.text} />
      ) : (
        <Text style={styles.buttonLabel} {...ONE_LINE}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** `167:25` Icon/Add — two 2pt bars, drawn rather than rasterised. */
/** The Button's Secondary variant (`90:174`) — `#FFF7CC`, no shadow ("Done"). */
export function SecondaryButton({
  label,
  onPress,
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.pressed, style]}
      testID={testID}
    >
      <Text style={styles.buttonLabel} {...ONE_LINE}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 9999,
  },
  buttonEnabled: { backgroundColor: C.brand },
  buttonDisabled: { backgroundColor: C.surfaceDisabled },
  secondary: { backgroundColor: C.subtle },
  outline: { borderWidth: 1.5, borderColor: C.borderStrong, backgroundColor: C.base },
  buttonLabel: { ...T.button, color: C.text },
  buttonLabelDisabled: { color: C.textDisabled },
  pressed: { opacity: 0.85 },
});
