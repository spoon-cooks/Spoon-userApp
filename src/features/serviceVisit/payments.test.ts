import type { BookingDetailDto, RefundDto } from '@features/booking';

import { cancelledVisitModelFrom } from './cancelledVisit';
import { paidTipOf, paymentSheetFrom, recurringPaymentSheetFrom } from './model';

const START = '2026-10-14T03:30:00.000Z';

function booking(overrides: Partial<BookingDetailDto> = {}): BookingDetailDto {
  return {
    id: 'bk-1',
    status: 'completed',
    slotType: 'scheduled',
    scheduledStart: START,
    durationMinutes: 60,
    totalDurationMinutes: 60,
    price: {
      amountPaise: 29900,
      durationMinutes: 60,
      serviceAmountPaise: 25339,
      taxRateBps: 1800,
      taxAmountPaise: 4561,
      totalAmountPaise: 29900,
      currency: 'INR',
      pricingVersion: 'v1',
    },
    timing: { arrivedAt: null, actualStart: null, expectedEnd: null, actualEnd: null },
    cancellation: null,
    cook: null,
    ...overrides,
  } as BookingDetailDto;
}

describe('Payment details sheet (2257:3939, dev note 2255:3939)', () => {
  it('itemises extensions, folds their tax into GST, adds the tip and totals what was charged', () => {
    const sheet = paymentSheetFrom(
      booking({
        charges: {
          extensions: [
            { minutes: 20, baseAmountPaise: 5932, chargedAmountPaise: 7000 },
            { minutes: 10, baseAmountPaise: 2966, chargedAmountPaise: 3500 },
          ],
          tipAmountPaise: 5000,
        },
        paymentMethod: { type: 'upi', label: 'UPI', detail: '••••@okhdfcbank' },
      }),
      'Cook Meera',
    );
    expect(sheet.subtitle).toBe('Wed, 14 Oct · 9:00 AM');
    expect(sheet.visitLine).toEqual({
      label: 'Cook visit · 1 hr',
      caption: 'One-time',
      amount: '₹253.39',
    });
    expect(sheet.extraLines).toEqual([
      { label: 'Extension 1 · +20 mins', caption: 'Added during the visit', amount: '₹59.32' },
      { label: 'Extension 2 · +10 mins', caption: 'Added during the visit', amount: '₹29.66' },
    ]);
    expect(sheet.taxLine.amount).toBe('₹61.63');
    expect(sheet.tipLine).toEqual({ label: 'Tip for Cook Meera', amount: '₹50' });
    expect(sheet.total).toBe('₹454');
    expect(sheet).toMatchObject({
      methodType: 'upi',
      methodName: 'UPI',
      methodDetail: '••••@okhdfcbank',
    });
  });

  it('shows a single visit line and no Mode of payment until the server knows it', () => {
    const sheet = paymentSheetFrom(booking(), null);
    expect(sheet.extraLines).toEqual([]);
    expect(sheet.tipLine).toBeUndefined();
    expect(sheet.total).toBe('₹299');
    expect(sheet.methodName).toBe('');
  });

  it('strikes the list price beside the visit when the booking had one (DEC-088)', () => {
    const sheet = paymentSheetFrom(
      booking({ price: { ...booking().price, strikeAmountPaise: 30000 } }),
      null,
    );
    expect(sheet.visitLine.was).toBe('₹300');
    // A strike at or below what was charged is not a discount, so none is drawn.
    expect(
      paymentSheetFrom(booking({ price: { ...booking().price, strikeAmountPaise: 25339 } }), null)
        .visitLine.was,
    ).toBeUndefined();
  });

  it('reports a captured tip from the server', () => {
    expect(
      paidTipOf(
        booking({
          tip: {
            tipId: 't1',
            amountPaise: 5000,
            status: 'captured',
            capturedAt: '2026-10-14T07:52:00.000Z',
          },
          paymentMethod: { type: 'upi', label: 'UPI', detail: null },
        }),
      ),
    ).toEqual({ amountPaise: 5000, when: 'Paid via UPI · Wed, 14 Oct, 1:22 PM' });
    expect(paidTipOf(booking())).toBeNull();
  });
});

describe('Payment details for a Recurring visit’s booking (2165:14262)', () => {
  it('charges what the booking charged, under the plan’s caption, paid by its UPI Autopay', () => {
    const plan = paymentSheetFrom(booking(), null);
    const sheet = recurringPaymentSheetFrom(
      booking({
        charges: {
          extensions: [{ minutes: 20, baseAmountPaise: 5932, chargedAmountPaise: 7000 }],
          tipAmountPaise: 0,
        },
      }),
      'Cook Meera',
      {
        ...plan,
        visitLine: { ...plan.visitLine, caption: 'Recurring · Plan 1, Visit 1' },
        methodName: 'UPI Autopay',
        methodDetail: '••••@okhdfcbank · Mandate active',
        manageLabel: 'Manage',
        reminder:
          'Mandate is shared 27 hrs before & payment is auto-debited 3 hrs before your first visit of the day.',
      },
    );
    expect(sheet.visitLine).toEqual({
      label: 'Cook visit · 1 hr',
      caption: 'Recurring · Plan 1, Visit 1',
      amount: '₹253.39',
    });
    expect(sheet.extraLines).toHaveLength(1);
    expect(sheet.total).toBe('₹369');
    expect(sheet).toMatchObject({
      methodType: 'upi',
      methodName: 'UPI Autopay',
      methodDetail: '••••@okhdfcbank · Mandate active',
      manageLabel: 'Manage',
    });
    expect(sheet.reminder).toContain('auto-debited 3 hrs before');
  });
});

describe('Visit details · Cancelled for a one-time booking (2165:11853, dev note 2226:4224)', () => {
  const cancelled = booking({
    status: 'cancelled',
    cancellation: {
      cancelledBy: 'customer',
      cancelledAt: '2026-10-01T13:10:00.000Z',
      refundAmountPaise: 29900,
      chargeAmountPaise: 0,
    },
    paymentMethod: { type: 'upi', label: 'UPI', detail: '••••@okhdfcbank' },
  });
  const refund = {
    refundId: 'rf_123',
    bookingId: 'bk-1',
    reason: 'customer_cancel',
    amountPaise: 29900,
    currency: 'INR',
    state: 'succeeded',
    requestedAt: '2026-10-01T13:10:00.000Z',
    completedAt: '2026-10-03T13:10:00.000Z',
  } as RefundDto;

  it('says who cancelled and when, with no plan to continue', () => {
    const model = cancelledVisitModelFrom(cancelled, refund, 'Cook Meera');
    expect(model.variant).toBe('cancelled');
    expect(model.banner).toEqual({ date: 'Wed, 14 Oct', slot: '9:00 AM – 10:00 AM · 1 hr' });
    expect(model.cancelled.byline).toBe('By you · Thu, 1 Oct, 6:40 PM');
    expect(model.cancelled.nextVisit).toBeNull();
    expect(model.modifySheet).toBeNull();
  });

  it('itemises the refund, names the masked method and the refund id', () => {
    const refundCard = cancelledVisitModelFrom(cancelled, refund, null).refund;
    expect(refundCard?.badge).toBe('Refunded');
    expect(refundCard?.lines.map((line) => [line.label, line.amount])).toEqual([
      ['Amount paid', '₹299'],
      ['GST', '₹45.61'],
      ['Cancellation fee', '– ₹0'],
    ]);
    expect(refundCard?.total).toMatchObject({
      label: 'Refund amount',
      detail: 'Full refund, inclusive of taxes',
      amount: '₹299',
    });
    expect(refundCard?.mode).toBe('UPI · ••••@okhdfcbank');
    expect(refundCard?.refundId).toBe('rf_123');
    expect(refundCard?.steps[0]).toEqual({ title: 'Refund initiated', when: 'Thu, 1 Oct' });
  });

  it('strikes the list total, tax included, on Amount paid and on a full refund', () => {
    const struck = cancelledVisitModelFrom(
      { ...cancelled, price: { ...cancelled.price, strikeAmountPaise: 30000 } },
      refund,
      null,
    ).refund;
    expect(struck?.lines[0]?.was).toBe('₹354');
    expect(struck?.total.was).toBe('₹354');
  });

  it('reads "Refund initiated" until the refund lands; a Spoon cancellation reads "Refund started" (2342:4201)', () => {
    expect(
      cancelledVisitModelFrom(booking(cancelled), { ...refund, state: 'provider_pending' }, null)
        .refund?.badge,
    ).toBe('Refund initiated');
    const model = cancelledVisitModelFrom(
      booking({
        ...cancelled,
        cancellation: { ...cancelled.cancellation, cancelledBy: 'system' },
      }),
      { ...refund, state: 'provider_pending' },
      null,
    );
    expect(model.refund?.badge).toBe('Refund started');
    expect(model.cancelled.byline.startsWith('By Spoon')).toBe(true);
  });

  it('shows the fee the server kept, not ₹0 (device test, 31 Oct 2026)', () => {
    const partial = booking({
      ...cancelled,
      cancellation: {
        ...cancelled.cancellation,
        refundAmountPaise: 14950,
        chargeAmountPaise: 14950,
      },
    });
    const card = cancelledVisitModelFrom(partial, { ...refund, amountPaise: 14950 }, null).refund;
    expect(card?.lines[2]).toMatchObject({ label: 'Cancellation fee', amount: '– ₹149.50' });
    expect(card?.total).toMatchObject({ detail: 'Inclusive of taxes', amount: '₹149.50' });
    expect(card?.total.was).toBeUndefined();
  });

  it('works the fee out from the refund when the detail does not carry it', () => {
    const older = booking({
      ...cancelled,
      cancellation: { cancelledBy: 'customer', cancelledAt: '2026-10-01T13:10:00.000Z' },
    });
    const card = cancelledVisitModelFrom(older, { ...refund, amountPaise: 22425 }, null).refund;
    expect(card?.lines[2]?.amount).toBe('– ₹74.75');
    expect(card?.total.amount).toBe('₹224.25');
  });

  it('has nothing to refund when the booking was never paid', () => {
    const model = cancelledVisitModelFrom(
      booking({
        status: 'cancelled',
        cancellation: { cancelledBy: 'system', cancelledAt: null },
      }),
      null,
      null,
    );
    expect(model.refund).toBeNull();
    expect(model.charge.amount).toBe('₹0');
  });
});
