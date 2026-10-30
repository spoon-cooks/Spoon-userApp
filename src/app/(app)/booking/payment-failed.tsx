import { useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  isAwaitingConfirmation,
  PaymentFailedBody,
  useBookingConfirmation,
  usePaymentRetry,
} from '@features/booking';
import { ErrorBoundary, QueryBoundary } from '@ui';
import { useDeterministicBack } from '@core/navigation';

/**
 * Payment Failed — the sibling Page 21 (`433:2290`, `confirming.tsx`) never needed until now:
 * checkout came back with nothing to confirm. The booking created by `useBookingSubmission` is
 * still on HOLD (task §9's V7 comment applies here too), so this screen's whole job is to say so
 * and offer to try the SAME booking again.
 *
 * ## Why this polls at all
 *
 * A client-side failure is a message from the SDK on this device; Razorpay's webhook reaches the
 * backend independently of it and can still settle the booking while the customer is reading this
 * screen. `useBookingConfirmation` is the same hook and cache entry Page 21 polls, so the moment
 * the server's status leaves `created` — paid after all, or the hold expired — this screen gets
 * out of the way to `/booking/:id`, which renders whatever that turns out to be. Nothing here
 * asserts the payment failed; it only reports what checkout said and waits to be contradicted.
 *
 * ## No cancel here
 *
 * Figma `2718:916` offers Retry Payment and Change payment method, and nothing else. The booking
 * is an unpaid hold the backend releases on its own when it runs out, so leaving abandons it; the
 * poll below then reads `cancelled` like any other settled status if the customer is still here.
 */
export default function PaymentFailedRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const bookingId = typeof id === 'string' && id !== '' ? id : null;

  const confirmation = useBookingConfirmation(bookingId);
  const retryPayment = usePaymentRetry(bookingId ?? '');

  const goHome = useDeterministicBack('/home');

  const status = confirmation.state.status === 'ready' ? confirmation.state.data.status : null;
  const settled = status !== null && !isAwaitingConfirmation(status);
  const nothingToWaitFor = bookingId === null;
  /**
   * A read that keeps failing is not a reason to hold the customer on an error screen forever —
   * same call `confirming.tsx` makes. The booking already exists; if the device cannot read it,
   * Home is where the next successful read (the banner's own poll) reports whatever it actually
   * is, including a payment that settled while this screen couldn't confirm it.
   */
  const unreadable = confirmation.state.status === 'error';

  /** Leaving must happen once — see `confirming.tsx`'s identical guard. */
  const left = useRef(false);

  useEffect(() => {
    if (left.current) return;
    if (nothingToWaitFor || unreadable) {
      left.current = true;
      goHome();
      return;
    }
    if (!settled || bookingId === null) return;

    left.current = true;
    router.replace(`/booking/${bookingId}`);
  }, [settled, unreadable, nothingToWaitFor, bookingId, goHome, router]);

  const retry = () => {
    // One checkout at a time: a second press while one is open would start another.
    if (bookingId === null || retryPayment.retrying) return;
    void retryPayment.retry().then((outcome) => {
      // Guarded by `left`: the poll above can already have moved the customer on (the hold
      // settled via an earlier attempt's webhook, say) while this retry was still in flight, and
      // a late `verified` here must not yank them back onto the confirmation wait.
      if (outcome === 'verified' && !left.current) {
        left.current = true;
        router.replace(`/booking/confirming?id=${bookingId}`);
      }
      // Every other outcome leaves the customer here — a dismissal is a choice, a fresh failure
      // is what this screen already says, and `processing` is safe to retry again against the
      // same order. Nothing here needs its own message.
    });
  };

  return (
    <ErrorBoundary scope="payment-failed">
      <QueryBoundary state={confirmation.state} onRetry={confirmation.refetch}>
        {() => (
          <PaymentFailedBody
            retrying={retryPayment.retrying}
            // Both reopen checkout on this booking: the method is picked in Razorpay's sheet.
            onRetry={retry}
            onChangeMethod={retry}
          />
        )}
      </QueryBoundary>
    </ErrorBoundary>
  );
}
