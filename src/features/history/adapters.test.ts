import { bookingCardFrom, headlineFor, myBookingPresentationFor } from './adapters';
import type { BookingSummaryDto } from '@features/booking';

/**
 * What a booking card is allowed to claim.
 *
 * The date-read defect lived here too: it was read on the DEVICE clock, so the same instant
 * printed as two different days depending on the handset's timezone.
 */

const BASE: BookingSummaryDto = {
  id: 'booking-1',
  status: 'assigned',
  slotType: 'scheduled',
  // 26 August 2026, 10:00 IST — the real booking.
  scheduledStart: '2026-08-26T04:30:00.000Z',
  durationMinutes: 30,
  price: {
    amountPaise: 7245,
    durationMinutes: 30,
    serviceAmountPaise: 6900,
    taxRateBps: 500,
    taxAmountPaise: 345,
    totalAmountPaise: 7245,
    currency: 'INR',
    pricingVersion: 'pricing-policy-v0',
  },
};

const IST = 'Asia/Kolkata';

const at = (over: Partial<BookingSummaryDto>): BookingSummaryDto => ({ ...BASE, ...over });

describe('myBookingPresentationFor — the six My-bookings states', () => {
  /**
   * These are the REAL, Postgres-verified rows the backend handed over when confirming
   * `cancelledBy`/`policyBand`/`rescheduleCount` shipped on both list endpoints — not
   * synthesized cases. Locking the function down against them is what proves the precedence
   * order actually matches what backend implemented, not just what was asked for.
   */
  it.each([
    [{ status: 'assigned', cancelledBy: null, policyBand: null, rescheduleCount: 0 }, 'Confirmed'],
    [
      { status: 'assigned', cancelledBy: null, policyBand: null, rescheduleCount: 1 },
      'Rescheduled',
    ],
    [
      {
        status: 'cancelled',
        cancelledBy: 'system',
        policyBand: 'SERVICE_FAILURE_FULL_REFUND',
        rescheduleCount: 0,
      },
      'Unfulfilled',
    ],
    [
      {
        status: 'cancelled',
        cancelledBy: 'customer',
        policyBand: 'SCHEDULED_FULL_REFUND',
        rescheduleCount: 0,
      },
      'Cancelled',
    ],
    // `cancelledBy: 'system'` here too — proves cancelledBy ALONE is not enough; only
    // `policyBand` decides Unfulfilled, and CHECKOUT_EXPIRED_NO_PAYMENT is not that band.
    [
      {
        status: 'cancelled',
        cancelledBy: 'system',
        policyBand: 'CHECKOUT_EXPIRED_NO_PAYMENT',
        rescheduleCount: 0,
      },
      'Cancelled',
    ],
    [{ status: 'completed', cancelledBy: null, policyBand: null, rescheduleCount: 0 }, 'Completed'],
  ] as const)('reads %o as %s', (fields, label) => {
    expect(myBookingPresentationFor(fields).label).toBe(label);
  });

  it('reads Completed, not Rescheduled, for a booking that was rescheduled and then completed', () => {
    // Order matters: rescheduling is history once the meal happened. Checking `status` before
    // `rescheduleCount` is what this test pins down, not just the individual branches above.
    const label = myBookingPresentationFor({
      status: 'completed',
      cancelledBy: null,
      policyBand: null,
      rescheduleCount: 1,
    }).label;

    expect(label).toBe('Completed');
    expect(label).not.toBe('Rescheduled');
  });

  it('reads Rescheduled for an admin-moved booking, even though rescheduleCount is still 0', () => {
    // An admin move deliberately never spends the customer's own one-time budget
    // (`reschedule-service.ts`), so `rescheduleCount` alone would read this as plain
    // "Confirmed" — identical to a booking that was always at its current time.
    const label = myBookingPresentationFor({
      status: 'assigned',
      cancelledBy: null,
      policyBand: null,
      rescheduleCount: 0,
      rescheduledByOps: true,
    }).label;

    expect(label).toBe('Rescheduled');
  });

  it('collapses every SETTLED live status to one Confirmed/Rescheduled pill, not four distinct ones', () => {
    // Deliberate: this screen is a flat historical index; Home already owns live-tracking detail
    // (arriving/arrived/in-service), so this screen must not draw that granularity again.
    // `created` is excluded on purpose — it is not a settled booking; see the test below.
    for (const status of ['assigned', 'cook_en_route', 'cook_arrived', 'cooking'] as const) {
      expect(
        myBookingPresentationFor({
          status,
          cancelledBy: null,
          policyBand: null,
          rescheduleCount: 0,
        }).label,
      ).toBe('Confirmed');
    }
  });

  /**
   * An unpaid hold is listed by `GET /v1/me/bookings/active` alongside real bookings, and this
   * list is how a customer reaches one -- Home draws no banner for it. Calling it Confirmed was
   * the same untruth the detail screen told before `paymentPending`.
   */
  it('does not call an unpaid hold Confirmed', () => {
    expect(
      myBookingPresentationFor({
        status: 'created',
        cancelledBy: null,
        policyBand: null,
        rescheduleCount: 0,
      }),
    ).toEqual({ label: 'Payment pending', tone: 'warning' });
  });

  /** Unpaid outranks moved, exactly as the detail banner orders them. */
  it('says payment is pending on a hold that was also rescheduled', () => {
    expect(
      myBookingPresentationFor({
        status: 'created',
        cancelledBy: null,
        policyBand: null,
        rescheduleCount: 1,
      }).label,
    ).toBe('Payment pending');
  });
});

describe('bookingCardFrom', () => {
  it("sources the rating from ratingStars — the customer's own rating for THIS booking", () => {
    const card = bookingCardFrom(
      at({
        status: 'completed',
        ratingStars: 5,
        cook: { displayName: 'Cook Asha', ratingAverage: 4.2 },
      }),
      IST,
    );

    // Never the cook's aggregate average — a different fact this card must not show instead.
    expect(card.rating).toBe(5);
    expect(card.rating).not.toBe(4.2);
  });

  it('omits rating entirely when ratingStars is absent, rather than falling back to the cook average', () => {
    const card = bookingCardFrom(
      at({ status: 'completed', cook: { displayName: 'Cook Asha', ratingAverage: 4.2 } }),
      IST,
    );

    expect(card.rating).toBeUndefined();
  });

  it('reads the subtitle as "Scheduled • <time>" for a scheduled booking, on the service clock', () => {
    // BASE.scheduledStart is 10:00 IST — asserting the IST reading, not the runner's own zone.
    expect(bookingCardFrom(BASE, IST).subtitle).toBe('Scheduled • 10:00 AM');
  });

  it('reads the subtitle as plain "Instant" for an instant booking, never a time', () => {
    expect(bookingCardFrom(at({ slotType: 'instant' }), IST).subtitle).toBe('Instant');
  });

  it('falls back to "Scheduled" alone when a scheduled booking has no start time', () => {
    expect(bookingCardFrom(at({ scheduledStart: null }), IST).subtitle).toBe('Scheduled');
  });
});

describe('the date is read on the service clock, not the device', () => {
  it('writes the India day for a booking just after IST midnight', () => {
    // 2026-08-26T00:30+05:30 is 2026-08-25T19:00Z. A device reading would call this the 25th —
    // which is precisely how tomorrow's booking came to look like yesterday's.
    const headline = headlineFor(at({ scheduledStart: '2026-08-25T19:00:00.000Z' }), IST);

    expect(headline).toContain('26');
    expect(headline).not.toContain('25');
  });

  it('writes the India day for a booking just before IST midnight', () => {
    // 2026-08-25T23:30+05:30 is 2026-08-25T18:00Z — still the 25th in India.
    const headline = headlineFor(at({ scheduledStart: '2026-08-25T18:00:00.000Z' }), IST);

    expect(headline).toContain('25');
  });

  it('gives the same answer whatever timezone the reader passes, for the same instant', () => {
    // The service clock is the authority, so the label cannot vary by caller.
    expect(headlineFor(BASE, IST)).toBe(headlineFor(BASE, IST));
    expect(headlineFor(BASE, IST)).toContain('26');
  });

  it('still renders when the catalogue has not published a timezone yet', () => {
    // Degrades to the device reading rather than blanking the label, which is what it did
    // everywhere before the service clock was threaded in.
    expect(headlineFor(BASE, undefined)).toMatch(/\d/);
  });

  it('keeps the duration half of the headline', () => {
    expect(headlineFor(at({ durationMinutes: 60 }), IST)).toContain('1 hr');
    expect(headlineFor(at({ durationMinutes: 30 }), IST)).toContain('30 mins');
  });

  it('falls back to the duration alone for an instant booking with no scheduled start', () => {
    expect(headlineFor(at({ scheduledStart: null, durationMinutes: 60 }), IST)).toBe('1 hr');
  });
});
