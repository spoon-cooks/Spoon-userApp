import { Image, StyleSheet, Text, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBottomGutter } from '@ui';
import { PrimaryButton, SecondaryButton } from '@ui/v2/Buttons';
import { C, T } from '@ui/v2/theme';

/**
 * Payment failed — Figma `2718:916` (page `2539:15531`): checkout came back with nothing to
 * confirm, so instead of the confirmation wait (`2702:855`) this is what runs.
 *
 * A white page: the cracked-card illustration, "Payment failed" and a line saying nothing was
 * charged, top-aligned under the status bar; a dock at the foot holds "Retry Payment" (Primary)
 * and "Change payment method" (Secondary). Both reopen checkout on the SAME booking — Razorpay's
 * sheet is where a method is picked, so another method is simply another attempt.
 *
 * The frame offers no "Cancel booking". An unpaid booking is released by the backend when its
 * hold runs out, so leaving the screen abandons it.
 */

/** `2718:928` — the 200 × 190 illustration, rasterised at 3×. */
const PAYMENT_FAILED_ART =
  require('../../../../assets/figma/payment/payment-failed.webp') as ImageSourcePropType;

export interface PaymentFailedBodyProps {
  readonly retrying: boolean;
  readonly onRetry: () => void;
  readonly onChangeMethod: () => void;
}

export function PaymentFailedBody({ retrying, onRetry, onChangeMethod }: PaymentFailedBodyProps) {
  const insets = useSafeAreaInsets();
  const gutter = useBottomGutter(16);

  return (
    <View style={styles.screen} testID="payment-failed-body">
      {/* `2718:927` */}
      {/* 40pt under Figma's 54pt status bar; a shorter inset (Android) still starts the art there. */}
      <View style={[styles.content, { paddingTop: Math.max(insets.top, 54) + 40 }]}>
        <Image
          source={PAYMENT_FAILED_ART}
          style={styles.art}
          accessible
          accessibilityLabel="Payment failed"
          accessibilityIgnoresInvertColors
        />
        <Text style={styles.title} accessibilityRole="header">
          Payment failed
        </Text>
        <Text style={styles.body}>
          We couldn’t process your payment. Don’t worry, you haven’t been charged.
        </Text>
      </View>

      {/* `2718:962` */}
      <View style={[styles.dock, { paddingBottom: gutter }]}>
        <PrimaryButton
          label="Retry Payment"
          onPress={onRetry}
          loading={retrying}
          testID="payment-failed-retry"
        />
        <SecondaryButton
          label="Change payment method"
          onPress={onChangeMethod}
          testID="payment-failed-change-method"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.base },
  /** 40pt under the status bar, 24pt sides, 16pt apart. */
  content: { flex: 1, alignItems: 'center', paddingHorizontal: 24, gap: 16 },
  art: { width: 200, height: 190 },
  title: { ...T.display, color: C.text, textAlign: 'center' },
  body: { ...T.body, color: C.textSecondary, textAlign: 'center', alignSelf: 'stretch' },
  /** White, 16pt in, 12pt between the buttons. */
  dock: { paddingTop: 16, paddingHorizontal: 16, gap: 12, backgroundColor: C.base },
});
