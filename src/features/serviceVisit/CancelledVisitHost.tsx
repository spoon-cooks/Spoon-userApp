import { useState } from 'react';

import { useBookingRefunds } from '@features/booking';
import type { BookingDetailDto } from '@features/booking';
import { PaymentDetailsSheet, VisitDetailsScreen } from '@features/recurringLive';
import {
  RefundProgressCard,
  refundProgressViewFrom,
  refundTrackerFrom,
  useRefund,
} from '@features/refunds';
import { useWhatsAppHelp } from '@features/support';

import { cancelledVisitModelFrom, spoonCancelledFrom } from './cancelledVisit';
import type { SpoonCancelledData } from './cancelledVisit';
import { SpoonCancelledCard } from './notices';

export interface CancelledVisitHostProps {
  readonly booking: BookingDetailDto;
  readonly onBack: () => void;
  readonly onHelp: () => void;
  /**
   * Cancelled by Spoon — "Rebook a visit" (`2342:4366`): the booking flow, prefilled with what
   * it can take (the same day and length).
   */
  readonly onRebook: (prefill: SpoonCancelledData['rebook']) => void;
  /** Cancelled by Spoon — "Talk to us" (`2342:4368`): Help chat about this booking. */
  readonly onTalkToUs: () => void;
}

/**
 * A cancelled one-time booking's Visit details (Figma `2165:11853`): the booking, its latest
 * refund (`GET /v1/bookings/:id/refunds`) and the Payment details sheet. Only Payment details and
 * Help remain in the dock (dev note `2226:4224`).
 *
 * Payment & refund carries the Refund tracker (`2303:4231`) — the refund's own steps, gateway
 * times and RRN from `GET /v1/me/refunds/:id` — once it has been read.
 *
 * Cancelled by Spoon (`2342:4195`, dev note `2342:4405`): the apology card takes the place of the
 * plain "Visit cancelled" card. A booking the customer cancelled is unchanged.
 */
export function CancelledVisitHost({
  booking,
  onBack,
  onHelp,
  onRebook,
  onTalkToUs,
}: CancelledVisitHostProps) {
  const refunds = useBookingRefunds(booking.id);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const refund = refunds.state.status === 'ready' ? (refunds.state.data[0] ?? null) : null;
  const model = cancelledVisitModelFrom(booking, refund, booking.cook?.name ?? null);
  const spoon = spoonCancelledFrom(booking, refund);
  const tracked = useRefund(refund?.refundId ?? null);
  const contactSupport = useWhatsAppHelp();
  const tracker =
    tracked.state.status === 'ready'
      ? refundTrackerFrom(tracked.state.data, { timeZone: 'Asia/Kolkata' })
      : null;

  return (
    <>
      <VisitDetailsScreen
        model={model}
        title="One-time visit"
        inlineDock
        onBack={onBack}
        onPaymentDetails={() => setPaymentOpen(true)}
        onHelp={onHelp}
        cancelledSlot={
          spoon === null ? undefined : (
            <SpoonCancelledCard
              when={spoon.when}
              reason={spoon.reason}
              refundLine={spoon.refundLine}
              onRebook={() => onRebook(spoon.rebook)}
              onTalkToUs={onTalkToUs}
              testID="cancelled-visit-spoon"
            />
          )
        }
        refundProgress={
          tracker === null ? undefined : (
            <RefundProgressCard
              view={refundProgressViewFrom(tracker)}
              onContactSupport={() => contactSupport(tracker.supportMessage)}
              testID="cancelled-visit-refund-tracker"
            />
          )
        }
        testID="cancelled-visit"
      />
      <PaymentDetailsSheet
        visible={paymentOpen}
        data={model.paymentSheet}
        onClose={() => setPaymentOpen(false)}
      />
    </>
  );
}
