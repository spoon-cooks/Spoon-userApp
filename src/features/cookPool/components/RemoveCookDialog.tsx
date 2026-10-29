import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button, Text } from '@ui';
import { lightTheme } from '@ui/theme/ThemeProvider';
import { innerShadows } from '@ui/tokens/primitives';

import { COOK_ICON } from '../art';
import { BlurredScrim } from '@ui/v2/Backdrop';

/**
 * Remove a cook from the pool — Figma `848:7494`.
 *
 * The recurring flow's confirm card (`586:4373`): p 24, 16 between rows, a 24pt radius and
 * `Elevation/3`; a 48pt `#FFE666` badge with the cook glyph, the question (SemiBold 16/24), then
 * "Keep" in gold and "Remove" outlined. Keep — or a tap outside — closes it and stays on the
 * profile.
 *
 * While the removal is in flight Remove shows its spinner; a failed one is said under the
 * question, the way the cancel sheet says a failed cancel (`cancel-error`) — the frame draws no
 * error, so the line is the app's convention, not the design's.
 *
 * The frame's `Scrim` (`848:7551`) is black at 40 % (`surfaceScrim`) and the card (`848:7552`, 354
 * wide) sits 287 from the top of the 874 frame, above centre. The shared `Dialog` darkens to 80 %
 * and centres, so — like the recurring flow's `RecurringDialog` — this dialog hosts its own
 * `Modal`. The scrim's 12pt `BACKGROUND_BLUR` is not drawn: React Native has no backdrop blur
 * without `expo-blur`, which the app does not ship, so the profile shows through sharp.
 *
 * The native modal sits above every screen, so the profile closes it when it loses focus
 * (`CookProfileScreen`): a deep link or a push opened while it is up must not land under it.
 */
export interface RemoveCookDialogProps {
  readonly visible: boolean;
  /** The profile's title — "Cook Meera". */
  readonly cookName: string;
  readonly onKeep: () => void;
  readonly onRemove: () => void;
  readonly removing?: boolean;
  /** Why the last Remove failed, in the customer's words; `null` when it has not. */
  readonly errorMessage?: string | null;
  readonly testID?: string;
}

export function RemoveCookDialog({
  visible,
  cookName,
  onKeep,
  onRemove,
  removing = false,
  errorMessage = null,
  testID = 'remove-cook-dialog',
}: RemoveCookDialogProps) {
  if (!visible) return null;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onKeep}
      testID={`${testID}-modal`}
    >
      <View style={styles.scrim} accessibilityViewIsModal>
        <BlurredScrim dim={0.4} />
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onKeep}
          testID={`${testID}-backdrop`}
        />
        <View style={styles.place} pointerEvents="box-none">
          <View style={styles.card} accessibilityViewIsModal testID={testID}>
            <View style={styles.badge}>
              <Image source={COOK_ICON} style={styles.badgeIcon} />
            </View>
            <Text variant="emphasis" color="textPrimary" testID={`${testID}-title`}>
              Remove {cookName} from your Cook Pool?
            </Text>
            {errorMessage === null ? null : (
              <Text
                variant="body"
                color="textSecondary"
                accessibilityRole="alert"
                testID={`${testID}-error`}
              >
                {errorMessage}
              </Text>
            )}
            <View style={styles.actions}>
              <Button
                label="Keep"
                onPress={onKeep}
                size="pillLg"
                flat
                labelColor="textPrimary"
                style={styles.action}
                testID={`${testID}-keep`}
              />
              <Button
                label="Remove"
                onPress={onRemove}
                loading={removing}
                variant="secondary"
                size="pillLg"
                labelColor="textPrimary"
                style={[styles.action, styles.destructive]}
                testID={`${testID}-remove`}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** `848:7552` — the card's top in the 874 frame. */
const CARD_TOP = 287;

const styles = StyleSheet.create({
  /** `848:7551` — black at 40 % over the whole screen. */
  scrim: { flex: 1 },
  /** 24 in from each side (354 of 402), the card's top at 287. */
  place: { flex: 1, paddingTop: CARD_TOP, paddingHorizontal: lightTheme.space.xl },
  card: {
    padding: lightTheme.space.xl,
    gap: lightTheme.space.lg,
    borderRadius: lightTheme.radius.lg,
    backgroundColor: lightTheme.colors.surface,
    boxShadow: innerShadows.elevation3,
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightTheme.colors.surfaceBrandTint,
  },
  badgeIcon: { width: 24, height: 24 },
  /** pt 8, 12 between the two. */
  actions: { flexDirection: 'row', gap: lightTheme.space.md, paddingTop: lightTheme.space.sm },
  action: { flex: 1 },
  /** White behind a 1.5pt black edge. */
  destructive: { borderWidth: 1.5, borderColor: lightTheme.colors.borderInk },
});
