import { formatPaise } from '@core/format';
import { serviceWindowOf } from '@core/time';
import { bookingStrikeOf } from '@features/booking';
import type { BookingDetailDto, RefundDto } from '@features/booking';
import { visitDemoModel } from '@features/recurringLive';
import type { VisitDetailsModel, VisitRefundData } from '@features/recurringLive';

import { clock, day, duration, isoDay, paymentSheetFrom } from './model';

/*
 * ------------------------------------------------------------------ Cancelled by Spoon (one-time)
 *
 * Figma `2342:4195`, dev note `2342:4405`: ops or the system cancelled a ONE-TIME visit before the
 * cook marked arrived. The apology card replaces "Visit cancelled"; the refund is always 100%,
 * auto-initiated at cancel, so its tracker starts at Initiated.
 *
 * The reason line is Figma's own copy, whatever the cancel reason: the frame draws one line and
 * product has not written others. The operator's free-text `reasonDetail` is never shown — it is
 * their own words and may name the cook.
 */
export const SPOON_CANCEL_REASON = 'None of our cooks could make it to your booked slot.';

/**
 * Cancelled by `operations` / `system`, yet not Spoon's doing — the apology would be untrue:
 * the customer's own abandoned or expired checkout (nothing was paid), and Ops cancelling at the
 * customer's request.
 */
const NOT_SPOONS_DOING: ReadonlySet<string> = new Set([
  'ABANDONED_CHECKOUT',
  'CHECKOUT_EXPIRED',
  'CUSTOMER_REQUEST',
]);

/** The refund a cancellation owes, as the server states it. */
function refundPaiseOf(booking: BookingDetailDto, refund: RefundDto | null): number | null {
  return refund?.amountPaise ?? booking.cancellation?.refundAmountPaise ?? null;
}

/** A one-time, paid visit that ops or the system cancelled for a reason of Spoon's own. */
export function isSpoonCancellation(booking: BookingDetailDto, refund: RefundDto | null): boolean {
  const cancellation = booking.cancellation;
  if ((booking.recurring ?? null) !== null || cancellation === null) return false;
  const by = cancellation.cancelledBy ?? null;
  if (by === null || by === 'customer') return false;
  if (NOT_SPOONS_DOING.has(cancellation.reasonCode ?? '')) return false;
  const refundPaise = refundPaiseOf(booking, refund);
  return refund !== null || (refundPaise !== null && refundPaise > 0);
}

export interface SpoonCancelledData {
  /** "Thu, 1 Oct, 6:40 PM". */
  readonly when: string | null;
  readonly reason: string;
  /** "Full ₹299 refund started, no deductions". */
  readonly refundLine: string;
  /** What "Rebook a visit" prefills on `/scheduled`: the same day and length. */
  readonly rebook: { readonly date: string | null; readonly durationId: string };
}

export function spoonCancelledFrom(
  booking: BookingDetailDto,
  refund: RefundDto | null,
): SpoonCancelledData | null {
  if (!isSpoonCancellation(booking, refund)) return null;
  const at = booking.cancellation?.cancelledAt ?? null;
  const start = booking.scheduledStart ?? booking.timing.actualStart;
  const refundPaise = refundPaiseOf(booking, refund) ?? booking.price.totalAmountPaise;
  return {
    when: at === null ? null : `${day(at)}, ${clock(at)}`,
    reason: SPOON_CANCEL_REASON,
    refundLine: `Full ${formatPaise(refundPaise)} refund started, no deductions`,
    rebook: {
      date: start === null ? null : isoDay(start),
      durationId: `dur-${String(booking.durationMinutes)}`,
    },
  };
}

/** "Talk to us" (`2342:4368`) — the Help chat opens on this booking: its id and its slot. */
export function spoonCancelHelpMessage(booking: BookingDetailDto): string {
  const start = booking.scheduledStart ?? booking.timing.actualStart;
  const visit = start === null ? 'my visit' : `my visit on ${day(start)}, ${clock(start)}`;
  return `Hi Spoon, ${visit} (booking ${booking.id}) was cancelled by Spoon. Can you help me?`;
}

/**
 * Visit details / upcoming · Cancelled for a ONE-TIME booking — Figma `2165:11853`, dev note
 * `2226:4224`. Drawn by the recurring Visit details screen's cancelled variant, which is the same
 * frame; this maps a booking (and its refund, when there is one) onto it:
 *
 *   - "Visit cancelled · By you / By Spoon · <when>"; no "Your plan continues" (one-time).
 *   - Payment & refund itemises amount paid, GST and the cancellation fee; the refund is the
 *     server's figure. Pill: Refund initiated → Refunded.
 *   - Refund to: the masked original method; the refund ID is shown for copying.
 *   - Timeline: initiated date, then the 5–7 working day credit note.
 *   - The dock drops Modify booking.
 *
 * A booking cancelled before it was ever paid has nothing to refund: the charge card then says
 * nothing was charged.
 */
/**
 * The fee kept on cancellation, as the server states it (`cancellation.chargeAmountPaise`). Where
 * the detail does not carry it (a server before it was published), it is what was paid less what
 * is being refunded; with neither known it is nothing. It was always ₹0 before (device test, 31
 * Oct 2026), because the detail never carried the fee and the refund was not used.
 */
export function cancellationFeePaise(
  paidPaise: number,
  chargePaise: number | null | undefined,
  refundPaise: number | null,
): number {
  if (chargePaise !== null && chargePaise !== undefined) return chargePaise;
  if (refundPaise === null) return 0;
  return Math.max(0, paidPaise - refundPaise);
}

/** `2165:11890` — the one-time refund's last step; the Recurring summary no longer draws it. */
const REFUND_CREDIT_NOTE = 'It takes 5-7 working days for the amount to get credited to source';

export function cancelledVisitModelFrom(
  booking: BookingDetailDto,
  refund: RefundDto | null,
  cookName: string | null,
): VisitDetailsModel {
  const base = visitDemoModel('cancelled');
  // The visit's own times: the booked slot, or the start OTP's if it was cancelled after starting.
  const { start, end } = serviceWindowOf({
    bookedStart: booking.scheduledStart,
    durationMinutes: booking.durationMinutes,
    timing: booking.timing,
  });
  const length = duration(booking.durationMinutes);
  const cancellation = booking.cancellation;
  const by =
    cancellation?.cancelledBy === 'customer'
      ? 'By you'
      : cancellation === null
        ? 'Cancelled'
        : 'By Spoon';
  const at = cancellation?.cancelledAt ?? null;

  const paid = booking.price.totalAmountPaise;
  const refundPaise = refund?.amountPaise ?? cancellation?.refundAmountPaise ?? null;
  const feePaise = cancellationFeePaise(paid, cancellation?.chargeAmountPaise, refundPaise);
  const charged = refund !== null || (refundPaise !== null && refundPaise > 0) || feePaise > 0;
  const method = booking.paymentMethod ?? null;
  const was = bookingStrikeOf(booking.price)?.totalPaise ?? null;

  const spoon = isSpoonCancellation(booking, refund);
  const refundAmount = formatPaise(refundPaise ?? Math.max(0, paid - feePaise));
  const refundData: VisitRefundData | null = charged
    ? {
        title: 'Payment & refund',
        badge:
          refund?.state === 'succeeded'
            ? 'Refunded'
            : refund?.state === 'failed_terminal'
              ? 'Refund failed'
              : 'Refund initiated',
        lines: [
          {
            label: 'Amount paid',
            detail: `Cook visit ${length} ${formatPaise(booking.price.serviceAmountPaise)} + GST ${formatPaise(booking.price.taxAmountPaise)}`,
            ...(was === null ? {} : { was: formatPaise(was) }),
            amount: formatPaise(paid),
          },
          { label: 'GST', amount: formatPaise(booking.price.taxAmountPaise), minor: true },
          { label: 'Cancellation fee', amount: `– ${formatPaise(feePaise)}`, minor: true },
        ],
        total: {
          label: 'Refund amount',
          detail: feePaise === 0 ? 'Full refund, inclusive of taxes' : 'Inclusive of taxes',
          // `2165:11890` — a full refund strikes the same "was" price.
          ...(was === null || feePaise > 0 ? {} : { was: formatPaise(was) }),
          amount: refundAmount,
        },
        modeEyebrow: 'REFUND TO',
        ...(method === null
          ? {}
          : {
              mode: method.detail === null ? method.label : `${method.label} · ${method.detail}`,
            }),
        idEyebrow: 'REFUND ID',
        ...(refund === null ? {} : { refundId: refund.refundId }),
        steps: [
          {
            title: 'Refund initiated',
            ...(refund !== null
              ? { when: day(refund.requestedAt) }
              : at === null
                ? {}
                : { when: day(at) }),
          },
          ...(refund?.state === 'failed_terminal'
            ? []
            : [{ title: REFUND_CREDIT_NOTE, note: true }]),
        ],
      }
    : null;
  // `2342:4201` — cancelled by Spoon: "Refund started" on the Neutral badge, "Full refund, no
  // deductions", and the refund tracker in place of the mode and timeline.
  const shownRefund: VisitRefundData | null =
    refundData === null || !spoon
      ? refundData
      : {
          ...refundData,
          badge:
            refund?.state === 'succeeded'
              ? 'Refunded'
              : refund?.state === 'failed_terminal'
                ? 'Refund failed'
                : 'Refund started',
          badgeTone: refund?.state === 'succeeded' ? 'positive' : 'neutral',
          total: { ...refundData.total, detail: 'Full refund, no deductions' },
        };

  return {
    ...base,
    variant: 'cancelled',
    // An Instant visit has no booked time: "Instant · 1 hr" where a scheduled one has its slot.
    banner:
      booking.slotType === 'instant'
        ? {
            date: start === null ? `Instant · ${length}` : day(start),
            slot: `Instant · ${length}`,
          }
        : {
            date: start === null ? length : day(start),
            slot:
              start === null || end === null
                ? length
                : `${clock(start)} – ${clock(end)} · ${length}`,
          },
    menu: [],
    cancelled: {
      ...base.cancelled,
      byline: at === null ? by : `${by} · ${day(at)}, ${clock(at)}`,
      nextVisit: null,
    },
    recipe: null,
    prep: null,
    prepChecked: [],
    charge: {
      ...base.charge,
      amount: formatPaise(0),
      title: 'Nothing charged',
      body: 'This visit was cancelled before payment, so nothing was charged.',
    },
    refund: shownRefund,
    paymentSheet: paymentSheetFrom(booking, cookName),
    modifySheet: null,
    paymentFailed: false,
  };
}
