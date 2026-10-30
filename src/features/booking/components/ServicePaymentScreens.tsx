import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from 'react-native';

import { ConfirmationLoading } from '@features/loading';
import { CheckoutFailedError } from '@features/payment';

import { PaymentFailedBody } from './PaymentFailedBody';

/**
 * The booking payment's two screens for the payments taken DURING a visit — an extension and a
 * tip: "Confirming your payment" (`2702:855`) while the backend verifies what checkout returned,
 * and "Payment failed" (`2718:916`) when checkout reports the payment failed.
 *
 * Drawn as a full-screen layer over the visit, not in place of it: the visit keeps its own state
 * (the tip sheet's "Paid" line) and is right there underneath when the layer goes.
 *
 * Classified as the booking payment is (`payAndClassify`): only `CheckoutFailedError` — checkout
 * opened and the payment was declined, so nothing was charged — earns "Payment failed". A closed
 * sheet, or a failure before checkout or while verifying, goes back to the caller as before.
 *
 * While "Payment failed" is up the caller's promise stays open: Retry Payment and Change payment
 * method open checkout again for the same thing, and a retry that succeeds settles it as if the
 * first attempt had. Android back, or closing checkout during a retry, leaves and rejects it.
 */

type Layer =
  | { readonly kind: 'confirming' }
  | { readonly kind: 'failed'; readonly retry: () => void; readonly leave: () => void };

export interface ServicePaymentScreens {
  /**
   * Runs one checkout. `start` opens it and calls `onVerifying` once checkout has returned and
   * the backend is checking the payment.
   */
  readonly run: <T>(start: (onVerifying: () => void) => Promise<T>) => Promise<T>;
  /** Rendered once, anywhere in the screen: the layer, while a payment needs it. */
  readonly layer: ReactNode;
}

export function useServicePaymentScreens(): ServicePaymentScreens {
  const [layer, setLayer] = useState<Layer | null>(null);
  const [retrying, setRetrying] = useState(false);
  const retryingRef = useRef(false);

  const run = useCallback(
    <T,>(start: (onVerifying: () => void) => Promise<T>): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const attempt = () => {
          start(() => setLayer({ kind: 'confirming' }))
            .then((value) => {
              setLayer(null);
              resolve(value);
            })
            .catch((error: unknown) => {
              if (!(error instanceof CheckoutFailedError)) {
                setLayer(null);
                reject(error);
                return;
              }
              setLayer({
                kind: 'failed',
                retry: () => {
                  // One checkout at a time: both buttons open it.
                  if (retryingRef.current) return;
                  retryingRef.current = true;
                  setRetrying(true);
                  attempt();
                },
                leave: () => {
                  setLayer(null);
                  reject(error);
                },
              });
            })
            .finally(() => {
              retryingRef.current = false;
              setRetrying(false);
            });
        };
        attempt();
      }),
    [],
  );

  const failed = layer?.kind === 'failed' ? layer : null;
  const element = (
    <Modal
      visible={layer !== null}
      animationType="fade"
      statusBarTranslucent
      // While the payment is being confirmed there is nothing to go back to; the screen says so.
      onRequestClose={() => failed?.leave()}
    >
      {layer?.kind === 'confirming' ? <ConfirmationLoading /> : null}
      {failed !== null ? (
        <PaymentFailedBody
          retrying={retrying}
          onRetry={failed.retry}
          onChangeMethod={failed.retry}
        />
      ) : null}
    </Modal>
  );

  return { run, layer: element };
}
