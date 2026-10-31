import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { idempotency } from '@core/api';
import { ready } from '@core/data';
import type { DataState } from '@core/data';
import { useNavigationGuard, useSafeBack } from '@core/navigation';
import { useBookingDetail } from '@features/booking';
import { CancelVisitSheet, cancelReasonsFrom } from '@features/cancellation';
import type { CancelQuote, CancelStep, CancelVisit } from '@features/cancellation';
import { useCatalogue } from '@features/catalogue';
import { cookCardLines, cookProfileFrom, useCookPoolProfile } from '@features/cookPool';
import {
  PaymentDetailsSheet,
  VisitDetailsScreen,
  useCancelWholeBooking,
  todayInKolkata,
  visitDetailsFrom,
  visitWhatsAppLink,
} from '@features/recurringLive';
import type { VisitDetailsModel, VisitPrepKey } from '@features/recurringLive';
import {
  useCancelRecurringVisit,
  useRecurringBooking,
  useRecurringVisit,
  useRecurringVisitCancellationQuote,
  useUpdateBookingPrep,
} from '@features/recurringSetup';
import {
  RefundProgressCard,
  refundProgressViewFrom,
  refundTrackerFrom,
  useRefund,
} from '@features/refunds';
import { useWhatsAppHelp } from '@features/support';
import { QueryBoundary } from '@ui';

/**
 * Recurring — one visit's "Visit details" (Figma `1005:131`: `1008:5398` assigned, `1466:8275`
 * pending, `1466:8446` cancelled), on the visit itself.
 *
 *   completed     goes to the visit's own booking (`/booking/[id]`), as Figma draws it: the
 *                 Service flow's Completed screen with the rate card and the tip (`2165:14082`,
 *                 `2216:6600`) — the same screen Today / Up next open. Back returns to the plan.
 *                 The older Completed frame (`1466:8639`) and its "Add to Cook Pool" / tip / Book
 *                 again are not drawn for it any more (owner's call, 2026-10-12: follow Figma).
 *
 *   checklist     saved to the visit's booking as it is ticked (only once it has one)
 *   Modify        the cancellation timeline from the visit's quote; "Cancel this visit" asks for a
 *                 reason with the app's own cancellation sheet (opened at the reason step — its fee
 *                 table is the one-time booking's, not Recurring's) and cancels the visit
 *   Payment       the price, GST and Autopay mandate; "Manage" cancels the whole booking
 *   Rebook        a past visit's "Book again" starts a new Recurring plan; one whose debit failed
 *                 also books a one-time visit for the same day and length
 *   Help, Share   WhatsApp with Spoon (`1434:2205`), when the backend gives the link
 *   Cook Pool     the pool landing; the next-visit row that visit's own details
 *   modify=1      "Modify booking" on the visit's live booking page lands here with the sheet open
 */
export default function RecurringVisitRoute() {
  const router = useRouter();
  const { bookingId, visitId, modify } = useLocalSearchParams<{
    bookingId: string;
    visitId: string;
    modify?: string;
  }>();
  const goBack = useSafeBack(`/recurring/${bookingId ?? ''}`);
  // One screen per tap: a quick double tap must not open the same screen (or WhatsApp) twice.
  const guard = useNavigationGuard();

  const visit = useRecurringVisit(bookingId ?? null, visitId ?? null);
  const booking = useRecurringBooking(bookingId ?? null);
  const quote = useRecurringVisitCancellationQuote(bookingId ?? null, visitId ?? null);
  const cookId = visit.state.status === 'ready' ? (visit.state.data.cook?.cookId ?? null) : null;
  const profile = useCookPoolProfile(cookId ?? 'none', { enabled: cookId !== null });

  const state = useMemo<DataState<VisitDetailsModel>>(() => {
    if (visit.state.status !== 'ready') return visit.state;
    const cookProfile =
      cookId !== null && profile.state.status === 'ready' ? profile.state.data : null;
    return ready(
      visitDetailsFrom({
        visit: visit.state.data,
        booking: booking.state.status === 'ready' ? booking.state.data : null,
        cookProfile,
        cookCard: cookProfile === null ? null : cookProfileFrom(cookProfile),
        cookLines: cookCardLines(cookProfile?.presentation),
        quote: quote.state.status === 'ready' ? quote.state.data : null,
        todayId: todayInKolkata(),
        now: new Date(),
      }),
    );
  }, [visit.state, booking.state, quote.state, profile.state, cookId]);

  const detail = visit.state.status === 'ready' ? visit.state.data : null;
  // `Note · Help deep link`: one tap to WhatsApp, prefilled. `wa.me` is a universal link, so it
  // opens WhatsApp where it is installed and the same page in the browser where it is not.
  const whatsApp = (purpose: 'help' | 'recipe') => {
    const link = detail === null ? null : visitWhatsAppLink(detail, purpose);
    return link === null
      ? undefined
      : () => {
          Linking.openURL(link).catch(() =>
            Alert.alert('Couldn’t open WhatsApp', 'Please try again in a moment.'),
          );
        };
  };
  const openHelp = whatsApp('help');
  const openRecipe = whatsApp('recipe');

  // ─── Refund tracker (DEC-090) ──────────────────────────────────────────────────────────────
  const refundId = detail?.cancellation?.refundId ?? null;
  const refund = useRefund(refundId);
  const contactSupport = useWhatsAppHelp();
  // The Refund tracker (`2303:4231`) inside Payment & refund. While it loads, nothing is drawn
  // there rather than the card's older statuses; those stand in only when the visit has no refund
  // linked yet or the tracker cannot be read.
  const tracker =
    refund.state.status === 'ready'
      ? refundTrackerFrom(refund.state.data, { timeZone: 'Asia/Kolkata' })
      : null;
  const refundProgress =
    tracker !== null ? (
      <RefundProgressCard
        view={refundProgressViewFrom(tracker)}
        onContactSupport={() => contactSupport(tracker.supportMessage)}
        testID="visit-refund-tracker"
      />
    ) : refundId !== null && refund.state.status === 'loading' ? (
      <View testID="visit-refund-tracker-loading" />
    ) : undefined;

  // ─── Checklist ─────────────────────────────────────────────────────────────────────────────
  const prepBookingId = detail?.payment?.bookingId ?? detail?.bookingId ?? null;
  const updatePrep = useUpdateBookingPrep();
  const savePrep =
    prepBookingId === null
      ? undefined
      : (checked: readonly VisitPrepKey[]) => {
          updatePrep.mutate(
            {
              bookingId: prepBookingId,
              input: {
                entryApproved: checked.includes('entry'),
                groceriesReady: checked.includes('groceries'),
                utensilsReady: checked.includes('utensils'),
              },
            },
            {
              onSuccess: () => visit.refetch(),
              onError: () =>
                Alert.alert('Couldn’t save that', 'Your checklist didn’t save. Please try again.'),
            },
          );
        };

  // ─── Sheets and cancelling (Figma C1–C5) ─────────────────────────────────────────────────────
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cancelStep, setCancelStep] = useState<CancelStep | null>(null);
  const catalogue = useCatalogue({ enabled: cancelStep !== null });
  const cancelVisit = useCancelRecurringVisit();
  // The visit's booking says whether the cook has already left (`cook_en_route`).
  const linkedBooking = useBookingDetail(cancelStep === null ? null : (detail?.bookingId ?? null));

  // `modify=1`: "Modify booking" on the visit's live booking page — open the sheet once the visit
  // says it can still be cancelled. Once only, so closing it stays closed.
  const modifyAsked = useRef(modify === '1');
  const canModify = state.status === 'ready' && state.data.modifySheet !== null;
  useEffect(() => {
    if (!modifyAsked.current || !canModify) return;
    modifyAsked.current = false;
    setCancelStep('modify');
  }, [canModify]);

  const quoteData = quote.state.status === 'ready' ? quote.state.data : null;
  /** The quote the customer confirmed, for C5 once the visit has been refetched as cancelled. */
  const [confirmedQuote, setConfirmedQuote] = useState<CancelQuote | null>(null);
  const cancelQuote: CancelQuote | null =
    quoteData === null
      ? null
      : {
          cancellable: quoteData.cancellable,
          feePercent: quoteData.feePercent,
          feePaise: quoteData.feePaise,
          refundPaise: quoteData.refundPaise,
          paidPaise: quoteData.chargedPaise,
          servicePaise: detail?.payment?.pricePaise ?? null,
          taxPaise: detail?.payment?.gstPaise ?? null,
        };
  const cancelVisitModel: CancelVisit | null =
    detail === null
      ? null
      : {
          startsAt: detail.start,
          durationMinutes: detail.durationMinutes,
          cookName: detail.cook?.displayName ?? null,
          cookOnTheWay:
            linkedBooking.state.status === 'ready' &&
            linkedBooking.state.data.status === 'cook_en_route',
          etaMinutes: null,
          wasRescheduled: false,
        };

  const confirmCancel = async (reasonCode: string, reasonDetail: string): Promise<boolean> => {
    if (bookingId === undefined || visitId === undefined) return false;
    setConfirmedQuote(cancelQuote);
    const scope = `recurring.visit.cancel:${bookingId}:${visitId}`;
    try {
      await cancelVisit.mutateAsync({
        id: bookingId,
        visitId,
        reason: reasonDetail.trim() === '' ? { reasonCode } : { reasonCode, reasonDetail },
        scope,
      });
      visit.refetch();
      booking.refetch();
      return true;
    } catch {
      idempotency.release(scope);
      return false;
    }
  };

  // ─── Completed: the visit's own booking (Figma `2165:14082` / `2216:6600`) ──────────────────
  const completedBookingId =
    detail !== null && detail.displayState === 'completed'
      ? (detail.payment?.bookingId ?? detail.bookingId)
      : null;

  // ─── Payment details → Manage: cancel the whole booking (spec, "Per-visit payment record") ───
  const bookingActive = booking.state.status === 'ready' && booking.state.data.status === 'active';
  const wholeBooking = useCancelWholeBooking({
    bookingId: bookingId ?? null,
    // Not tied to the sheet being open: Manage closes it, and the quote must still be there.
    enabled: bookingActive,
    onViewRefunds: () => router.push('/refunds'),
    onCancelled: () => {
      visit.refetch();
      booking.refetch();
    },
  });

  const nextVisitId =
    booking.state.status === 'ready' ? (booking.state.data.upNext?.visitId ?? null) : null;

  // Every hook above runs first; only then does a finished visit hand over to its booking.
  if (completedBookingId !== null) {
    return (
      <Redirect
        href={{ pathname: '/booking/[id]', params: { id: completedBookingId, from: 'recurring' } }}
      />
    );
  }

  return (
    <QueryBoundary state={state} onRetry={visit.refetch}>
      {(model) => (
        <>
          <VisitDetailsScreen
            model={model}
            onBack={guard(goBack)}
            onPaymentDetails={() => setPaymentOpen(true)}
            {...(model.modifySheet === null
              ? {}
              : { onModifyBooking: () => setCancelStep('modify') })}
            onHelp={openHelp === undefined ? undefined : guard(openHelp)}
            onShareRecipe={openRecipe === undefined ? undefined : guard(openRecipe)}
            onViewCookPool={guard(() => router.push('/cook-pool'))}
            {...(nextVisitId === null || nextVisitId === visitId
              ? {}
              : {
                  onNextVisit: guard(() =>
                    router.replace({
                      pathname: '/recurring/[bookingId]/visits/[visitId]',
                      params: { bookingId: bookingId ?? '', visitId: nextVisitId },
                    }),
                  ),
                })}
            onPrepChange={savePrep}
            onBookAgain={guard(() => router.push('/recurring'))}
            onBookOneTime={guard(() =>
              detail === null
                ? undefined
                : router.push({
                    pathname: '/scheduled',
                    params: { date: detail.date, durationId: `dur-${detail.durationMinutes}` },
                  }),
            )}
            refundProgress={refundProgress}
          />
          <PaymentDetailsSheet
            visible={paymentOpen}
            data={model.paymentSheet}
            onClose={() => setPaymentOpen(false)}
            {...(bookingActive
              ? {
                  onManageAutopay: () => {
                    setPaymentOpen(false);
                    wholeBooking.askToCancel();
                  },
                }
              : {})}
          />
          {wholeBooking.sheet}
          {cancelStep === null || cancelVisitModel === null ? null : (
            <CancelVisitSheet
              visible
              step={cancelStep}
              onStepChange={setCancelStep}
              visit={cancelVisitModel}
              quote={cancelStep === 'done' ? (confirmedQuote ?? cancelQuote) : cancelQuote}
              reasons={
                catalogue.state.status === 'ready' ? cancelReasonsFrom(catalogue.state.data) : []
              }
              // A Recurring visit is not rescheduled on its own.
              canReschedule={false}
              onReschedule={() => setCancelStep(null)}
              onClose={() => setCancelStep(null)}
              onConfirm={confirmCancel}
              refund={
                detail?.cancellation?.refundId === undefined ||
                detail.cancellation.refundId === null
                  ? null
                  : {
                      amountPaise: detail.cancellation.refundPaise,
                      method: 'upi',
                      refunded: detail.cancellation.refundStatus === 'refunded',
                      initiatedAt: detail.cancellation.cancelledAt,
                      creditedAt: null,
                    }
              }
              onBoundary={quote.refetch}
              onDone={guard(() => {
                setCancelStep(null);
                router.replace('/history');
              })}
              onBookVisit={guard(() => {
                setCancelStep(null);
                router.push('/scheduled');
              })}
              testID="cancel-visit"
            />
          )}
        </>
      )}
    </QueryBoundary>
  );
}
