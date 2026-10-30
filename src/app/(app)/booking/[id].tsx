import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import {
  BookingDetailScreen,
  tipAmountPaiseFrom,
  useCallCook,
  useExtensionCheckout,
  usePaymentRetry,
  payRetryingOnceWhileProcessing,
  ratingScopeFor,
  ratingSubmissionScope,
  useBookingDetail,
  useRateBooking,
  useServicePaymentScreens,
  useTipCheckout,
} from '@features/booking';
import type { PaymentOutcome } from '@features/booking';
import { useBookingCancelVisit } from '@features/cancellation';
import {
  CancelledVisitHost,
  ServiceVisitHost,
  servicePhaseOf,
  spoonCancelHelpMessage,
} from '@features/serviceVisit';
import type { SpoonCancelledData } from '@features/serviceVisit';
import { paymentErrorMessage } from '@features/payment';
import { useWhatsAppHelp } from '@features/support';
import { ErrorBoundary, isNumericRating } from '@ui';
import { createIdempotencyKey } from '@core/api';
import { useDeterministicBack, useNavigationGuard, useSafeBack } from '@core/navigation';

/**
 * Booking lifecycle host - Confirmation (`3:1041`), En route (`3:1381` / `99:1413`), Arrived
 * (`3:1658`), In service (`101:1812`) and Completion (`143:207`) are VIEWS of this one route.
 *
 * Wrapped in its own error boundary: an unexpected server state must degrade, not white-screen.
 *
 * Help (`39:5331`) is CLOSED. Blocker B-10 recorded that the design named no destination; the
 * founder's comment on the final file does — every WhatsApp control reaches Spoon on 8792997836.
 * `useWhatsAppHelp` owns the link so no screen builds a `wa.me` URL of its own (task §15).
 *
 * Call Cook (`94:936`) is REAL: offered only where `allowedActions.canCallCook` says it may be,
 * and pressing it reads the number from `GET /v1/bookings/:id/cook-contact` at that moment and
 * hands it to the device dialer. The number is never a prop, never cached.
 *
 * Cancel is REAL, and blocker B-11 is closed. It recorded that no live-booking frame drew a
 * Cancel control; the current file does — `3:1041` draws the Reschedule/Cancel pair under the
 * summary and `292:241` draws it on the en-route and reassigned frames. The four-step sheet was
 * already built and already read live data; all it lacked was this entry point and a booking id.
 * `allowedActions.canCancel` decides whether it is offered, and the SERVER decides the fee and
 * the refund — this route sends the reason and refetches.
 */
/**
 * What to tell the customer when the press opened no checkout.
 *
 * `cancelled` returns null on purpose: they closed the sheet themselves, and reporting that back
 * at them is noise.
 */
function payNoticeFor(outcome: PaymentOutcome): string | null {
  if (outcome === 'cancelled') return null;
  if (outcome === 'processing') {
    return 'Still confirming your last payment. Try again in a moment.';
  }
  if (outcome === 'failed') return 'That payment did not go through. You can try again.';
  return 'Could not open checkout. Check your connection and try again.';
}

export default function BookingRoute() {
  const router = useRouter();
  const {
    id,
    from,
    tip: openOnTip,
  } = useLocalSearchParams<{ id: string; from?: string; tip?: string }>();
  const bookingId = id ?? '';

  const callCook = useCallCook(bookingId === '' ? null : bookingId);
  const openHelp = useWhatsAppHelp();
  // One screen per tap: a quick double tap must not open the same screen (or WhatsApp) twice.
  const guard = useNavigationGuard();

  const rate = useRateBooking();
  const tip = useTipCheckout();
  /**
   * "Book now" on an unpaid hold — see `onPayNow` below.
   *
   * The SAME hook the Payment Failed screen retries with, for the same reason: the booking already
   * exists and `usePayForBooking`'s idempotency scope is keyed by booking id alone, so this reopens
   * the order that was already created instead of making a second one (and instead of a second
   * BOOKING, which the server's own overlap constraint would refuse anyway — the customer would
   * be told they clash with themselves).
   */
  const payHold = usePaymentRetry(bookingId);
  /**
   * What the last Book now press did, when it opened no checkout.
   *
   * Only `verified` used to be acted on, so every other outcome ended in silence — including
   * `processing`, which is the ordinary answer while a slow payment attempt is still unresolved.
   * The customer pressed a button, watched a spinner stop, and was told nothing.
   */
  const [payNotice, setPayNotice] = useState<string | null>(null);
  /**
   * The delayed retry is in flight.
   *
   * Kept separate from `payHold.retrying`, which is false while we are merely waiting. Without it
   * the bar would go idle mid-recovery and invite a press that starts the whole thing again.
   */
  const [awaitingPayRetry, setAwaitingPayRetry] = useState(false);
  /** Stops a pending retry from touching state after the screen has gone. */
  const payAbandoned = useRef(false);
  useEffect(() => {
    payAbandoned.current = false;
    return () => {
      payAbandoned.current = true;
    };
  }, []);
  const extend = useExtensionCheckout();
  /**
   * An extension or a tip is paid mid-visit through Razorpay, like the booking itself, so it gets
   * the booking payment's two screens: "Confirming your payment" while the backend verifies, and
   * "Payment failed" when checkout says the payment failed — laid over this screen, which keeps
   * its own state underneath.
   */
  const servicePayment = useServicePaymentScreens();
  const extendBy = (minutes: number) =>
    servicePayment.run((onVerifying) =>
      extend.mutateAsync({
        bookingId,
        minutes,
        // Scoped to the booking AND the size of the extension, so a retry after an ambiguous
        // failure replays the same intent instead of extending twice.
        scope: `booking.extend:${bookingId}:${minutes}`,
        onVerifying,
      }),
    );
  /**
   * The redesigned cancel flow (Figma C1–C5): "Modify visit" first, then policy, reason, review and
   * the cancelled sheet. C5's Done goes to My bookings and "Book a visit" to Schedule — neither
   * creates a booking on the customer's behalf.
   */
  const cancelVisit = useBookingCancelVisit(bookingId === '' ? null : bookingId, {
    onReschedule: guard(() => router.push(`/reschedule/${bookingId}`)),
    onDone: guard(() => router.replace('/history')),
    onBookVisit: guard(() => router.replace('/scheduled')),
  });

  /**
   * HOME, always, UNLESS this booking was opened from History ("My bookings") — task §11's "all
   * these back buttons take the user to the home page" (V7 founder comment) plus the fix for the
   * bug it caused there.
   *
   * The founder's reasoning is sound for the service lifecycle proper: a booking moves through
   * confirm -> arriving -> reassigned -> arrived -> in-service under the customer, and popping to
   * a screen drawn before that advance would show a lie — an "Arriving" banner for a cook who has
   * since arrived. `useDeterministicBack` (dismiss + replace to `/home`) is still correct for every
   * entry point that reasoning actually covers: a Home banner, a push notification, a reschedule
   * confirmation, a `spoon://` deep link — see `service lifecycle — every back button goes Home`
   * in `v7Flow.test.tsx` (task §11), which this must keep passing unchanged.
   *
   * It never covered History. A Past booking cannot advance at all, and an Upcoming one reached
   * from there is exactly as live as one reached from Home — but landing on Home instead of the
   * list the customer just walked down made "back" from a booking opened via My bookings behave
   * as if the list screen behind it did not exist. `history.tsx` tags its push with `?from=history`
   * for exactly this; `useSafeBack('/history')` pops there when it can (always, in practice — the
   * push notification and deep-link cases that need a fallback never carry this tag) and replaces
   * to `/history` on the rare stack-less path so the fallback still lands somewhere sensible rather
   * than reusing Home's.
   */
  const goHome = useDeterministicBack('/home');
  const goToHistory = useSafeBack('/history');
  /*
   * The same reasoning for a finished Recurring visit tapped on its plan's calendar: the visit
   * route hands it over here (`?from=recurring`), and back returns to that calendar rather than
   * Home. A finished visit cannot advance, so popping cannot show a stale state.
   */
  const goToPlan = useSafeBack('/recurring');
  const goBack = guard(from === 'history' ? goToHistory : from === 'recurring' ? goToPlan : goHome);

  /**
   * The redesigned visit details (Figma "Service flow") for the phases it draws — assigned, on the
   * way, arrived, cooking, time's up, completed — a reassigned booking included: a one-time visit
   * whose cook was swapped before the trip shows "Sorry, we have assigned you another cook" above
   * the new cook while it is still `assigned` (Figma `2353:17562`, dev note `2353:17578`). Payment
   * pending keeps the established screen; cancelled has its own Visit details below.
   */
  const detail = useBookingDetail(bookingId === '' ? null : bookingId, { poll: true });
  const booking = detail.state.status === 'ready' ? detail.state.data : null;
  const phase = booking === null ? null : servicePhaseOf(booking, new Date());

  /*
   * A Recurring visit's booking (`booking.recurring`) is drawn by the same screens, titled
   * "Recurring visit" (Figma `1005:131`, `2165:13928` → `2216:6600`). It is cancelled — never
   * rescheduled — from the plan's own Modify booking sheet, and once cancelled it is the plan's
   * Visit details (`2165:13866`) that tell its story.
   */
  const recurring = booking?.recurring ?? null;
  const recurringVisit =
    recurring === null
      ? null
      : {
          pathname: '/recurring/[bookingId]/visits/[visitId]' as const,
          params: { bookingId: recurring.recurringBookingId, visitId: recurring.visitId },
        };

  if (booking !== null && recurringVisit !== null && booking.status === 'cancelled') {
    return <Redirect href={recurringVisit} />;
  }

  if (booking !== null && phase !== null) {
    return (
      <ErrorBoundary scope="booking-host">
        <ServiceVisitHost
          booking={booking}
          phase={phase}
          onBack={goBack}
          {...(recurringVisit !== null
            ? {
                onModifyBooking: guard(() =>
                  router.push({
                    ...recurringVisit,
                    params: { ...recurringVisit.params, modify: '1' },
                  }),
                ),
              }
            : booking.allowedActions.canCancel || booking.allowedActions.canReschedule
              ? { onModifyBooking: () => cancelVisit.open() }
              : {})}
          onHelp={guard(() => openHelp('Hi Spoon, I need help with my booking.'))}
          onCall={guard(() => {
            void callCook.call();
          })}
          onShareRecipe={guard(() => {
            openHelp("Hi Spoon, I'd like to share a recipe or a special request for my booking.");
          })}
          onExtend={extendBy}
          extending={extend.isPending}
          onTip={(amountPaise) =>
            servicePayment.run((onVerifying) =>
              tip.mutateAsync({
                bookingId,
                amountPaise,
                // A fresh scope per attempt; see `onSelectTip` below.
                scope: `booking.tip.${bookingId}.${createIdempotencyKey()}`,
                onVerifying,
              }),
            )
          }
          tipping={tip.isPending}
          onRate={(request) =>
            rate.mutateAsync({
              bookingId,
              ...request,
              scope: ratingSubmissionScope(bookingId, request),
            })
          }
          rating={rate.isPending}
          onBookAnother={guard(() => router.push('/scheduled'))}
          onViewRefunds={guard(() => router.push('/refunds'))}
        />
        {cancelVisit.sheet}
        {servicePayment.layer}
      </ErrorBoundary>
    );
  }

  /*
   * Cancelled (Figma `2165:11853`, dev note `2226:4224`) — by the customer or by Spoon, whether or
   * not its cook had been reassigned first: it is cancelled either way. The cancel sheet stays
   * mounted so its "Visit cancelled" step can still be read over the screen.
   *
   * Cancelled by Spoon (`2342:4195`): "Rebook a visit" opens Schedule on the same day and length
   * (all `/scheduled` reads — it takes no slot or address), and "Talk to us" opens the Help chat
   * naming this booking.
   */
  if (booking !== null && booking.status === 'cancelled') {
    return (
      <ErrorBoundary scope="booking-host">
        <CancelledVisitHost
          booking={booking}
          onBack={goBack}
          onHelp={guard(() => openHelp('Hi Spoon, I need help with my cancelled booking.'))}
          onRebook={guard(({ date, durationId }: SpoonCancelledData['rebook']) =>
            router.push({
              pathname: '/scheduled',
              params: { durationId, ...(date === null ? {} : { date }) },
            }),
          )}
          onTalkToUs={guard(() => openHelp(spoonCancelHelpMessage(booking)))}
        />
        {cancelVisit.sheet}
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary scope="booking-host">
      <BookingDetailScreen
        bookingId={bookingId}
        initialTipOpen={openOnTip === '1'}
        onBack={goBack}
        onReschedule={guard(() => router.push(`/reschedule/${bookingId}`))}
        onHelp={guard(() => {
          openHelp('Hi Spoon, I need help with my booking.');
        })}
        onContactSupport={openHelp}
        onCallCook={guard(() => {
          void callCook.call();
        })}
        callCookError={callCook.errorMessage}
        onDismissCallCookError={callCook.clearError}
        onCancel={() => cancelVisit.open()}
        /**
         * The unpaid hold's only action (`status: created`, drawn by `ConfirmationBody` as a single
         * "Book now" bar under the amber "Payment pending!" banner).
         *
         * `verified` hands over to `/booking/confirming`, which polls until the SERVER's status
         * leaves `created` and then returns here — the client never redraws this screen as
         * confirmed off the back of a checkout callback (ruling R-1). Every other outcome leaves
         * the customer on this screen, which already says the payment is pending and offers the
         * bar again: a dismissal is a choice, `processing` is safe to retry against the same
         * order, and a failure is what the banner is already reporting.
         */
        onPayNow={() => {
          if (bookingId === '') return;
          setPayNotice(null);
          setAwaitingPayRetry(true);
          void payRetryingOnceWhileProcessing(payHold.retry)
            .then((outcome) => {
              // The screen may be gone: a customer who leaves mid-retry gets no state written
              // under them, and no navigation they did not ask for.
              if (payAbandoned.current) return;
              if (outcome === 'verified') {
                router.replace(`/booking/confirming?id=${bookingId}`);
                return;
              }
              setPayNotice(payNoticeFor(outcome));
            })
            .finally(() => {
              if (!payAbandoned.current) setAwaitingPayRetry(false);
            });
        }}
        paying={payHold.retrying || awaitingPayRetry}
        payNotice={payNotice}
        /**
         * `275:4265` — "Extend" (task §15, the extension step of the service flow).
         *
         * `POST /v1/bookings/:id/extensions` with the MINUTES the catalogue published. The new end
         * time, the price and whether the extension was allowed at all are the server's; this
         * refetches and the In-service view re-renders from the answer. Nothing here adds minutes
         * to a clock.
         */
        onExtendBooking={extendBy}
        extending={extend.isPending}
        extendError={paymentErrorMessage(extend.error)}
        /**
         * `201:93` / `201:96` — the auto-cancelled rebook prompt.
         *
         * PRODUCT_DESIGN_CONFLICT (§37), settled the same way `115:2703` already was: a cancelled
         * booking cannot rebook itself, and this flow has no authority to create one. "Yes" returns
         * to HOME, where booking actually starts, and "No" leaves the screen. Both are real
         * destinations — neither invents a booking — and neither answer is left inert.
         */
        onRebook={guard(() => router.replace('/home'))}
        onDeclineRebook={goBack}
        /* `383:748` — the same Spoon line as every other WhatsApp control (task §15). */
        onShareRecipe={guard(() => {
          openHelp("Hi Spoon, I'd like to share a recipe or a special request for my booking.");
        })}
        /**
         * `306:2885` — the tip sheet's CTA (task §14).
         *
         * The amount is the catalogue's, decoded from the option id the sheet reports, and it is
         * sent to `POST /v1/bookings/:id/tips` — no figure is computed here (ruling R-1).
         *
         * The CHECKOUT half is closed and no longer a gap. `useTipCook` runs the same proven
         * pipeline booking payment does — order, open Razorpay against the `keyId` the order
         * carries, verify against the TIP-scoped `POST /v1/bookings/:id/tips/verify`, then
         * refetch. Whether the tip took is the server's answer, never the SDK callback's.
         */
        onSelectTip={(tipId) => {
          const amountPaise = tipAmountPaiseFrom(tipId);
          // An id that carries no amount is not a tip. Rejected rather than sent as zero.
          if (amountPaise === null) return Promise.reject(new Error('Unknown tip option'));

          /**
           * A FRESH scope per checkout attempt, so each press is its own intent.
           *
           * It was `booking.tip:<bookingId>` -- one key for the life of the booking, released
           * only on a fully verified tip. Two failures came out of that. A customer who dismissed
           * checkout and then chose a different amount sent the same key with a different body,
           * which the backend answers 409 forever ("hash mismatch"), so the amount could never be
           * changed until the app was force-quit. And a key surviving an attempt that succeeded
           * server-side but never reached verify would REPLAY that completed order, reopening a
           * checkout Razorpay had already captured.
           *
           * Not per-amount, which was the obvious fix and the wrong one: tips are not capped per
           * booking, so tipping ₹50 twice would replay the first ₹50 order. The key identifies an
           * ATTEMPT, never a value. `useTipCook` releases it on every outcome.
           *
           * A stale `payment_pending` tip does NOT block a new attempt. Nothing server-side
           * sweeps that row and the detail payload carries no `providerOrderId` or `keyId`, so it
           * can neither expire nor be resumed -- blocking would strand the customer permanently
           * on a dead row. The abandoned Razorpay session cannot be paid, so the risk it leaves
           * is a dead row, not a stranded payment.
           */
          return servicePayment.run((onVerifying) =>
            tip.mutateAsync({
              bookingId,
              amountPaise,
              scope: `booking.tip.${bookingId}.${createIdempotencyKey()}`,
              onVerifying,
            }),
          );
        }}
        tipping={tip.isPending}
        tipError={paymentErrorMessage(tip.error)}
        /**
         * `143:292` -> `319:3191`. Submit sends the rating AND the words in one call, because
         * `299:1424` draws one Submit for both, and then the booking is refetched: the thank-you
         * state renders because the SERVER now says `canRate: false`, never because this callback
         * fired.
         */
        onSubmitFeedback={(feedback, rating) => {
          if (rate.isPending || rating === null) return;

          /*
           * `5+` is RECORDED, not collapsed.
           *
           * It used to be sent as a bare `stars: 5` with a structured warning, because the
           * contract had no way to say which of the two top chips was pressed and two different
           * customers were indistinguishable in the database. It has one now: `exceptional` is a
           * field of its own, valid only alongside `stars: 5`, and it changes no payout — the
           * five-plus EARNINGS bonus is still exactly `stars === 5`.
           *
           * So the pair is sent together and the warning is gone. Nothing is lost and nothing is
           * inferred: the numeric chips send the number, and `5+` sends 5 AND the flag.
           */
          const exceptional = !isNumericRating(rating);

          /*
           * RETURNED, so Completion can draw its acknowledgement only once the server has the
           * words -- a press alone used to be enough, which thanked customers for feedback a
           * failed request never delivered. The rejection is handled there; the mutation still
           * owns the normalized error.
           */
          const words = feedback.trim();

          return rate.mutateAsync({
            bookingId,
            stars: exceptional ? 5 : rating,
            ...(exceptional ? { exceptional: true } : {}),
            ...(words === '' ? {} : { feedback: words }),
            /* Writing is a different intent from rating — see `ratingScopeFor`. */
            scope: ratingScopeFor(bookingId, words),
          });
        }}
      />

      {cancelVisit.sheet}
      {servicePayment.layer}
    </ErrorBoundary>
  );
}
