import type { BookingSummaryDto } from '@features/booking';

import { bookingRowFrom, countLabel, durationOf, monthGroupsFrom, upcomingFrom } from './model';

const NOW = new Date('2026-10-11T06:00:00.000Z');

const dto = (
  id: string,
  start: string,
  extra: Partial<BookingSummaryDto> = {},
): BookingSummaryDto =>
  ({
    id,
    status: 'assigned',
    slotType: 'scheduled',
    scheduledStart: start,
    durationMinutes: 60,
    price: { totalAmountPaise: 18800 },
    ...extra,
  }) as BookingSummaryDto;

describe('My bookings rows (dev notes 2192:4489 / 2192:4497)', () => {
  it('writes "date · start time · duration" on the service clock, and "status · amount paid"', () => {
    const row = bookingRowFrom(dto('a', '2026-11-12T06:00:00.000Z', { durationMinutes: 90 }), NOW);
    expect(row.when).toBe('12 Nov · 11:30 AM · 1.5 hrs');
    expect(row.statusLine).toBe('Confirmed · ₹188 paid');
    expect(row.kind).toBe('one-time');
    expect(row.dimmed).toBe(false);
  });

  it('writes the start OTP time once the visit has started, not the booked slot (31 Oct 2026)', () => {
    const started = dto('a', '2026-11-12T06:00:00.000Z', {
      timing: {
        actualStart: '2026-11-12T05:50:00.000Z',
        expectedEnd: '2026-11-12T06:50:00.000Z',
        actualEnd: null,
      },
    });
    expect(bookingRowFrom(started, NOW).when).toBe('12 Nov · 11:20 AM · 1 hr');
  });

  it('tags a visit of a recurring plan as Recurring', () => {
    expect(
      bookingRowFrom(dto('a', '2026-11-12T06:00:00.000Z', { recurringBookingId: 'r1' }), NOW).kind,
    ).toBe('recurring');
  });

  it('dims Cancelled and Unfulfilled, never Completed', () => {
    const at = '2026-09-12T06:00:00.000Z';
    expect(bookingRowFrom(dto('a', at, { status: 'cancelled' }), NOW)).toMatchObject({
      status: 'Cancelled',
      dimmed: true,
    });
    expect(
      bookingRowFrom(
        dto('b', at, { status: 'cancelled', policyBand: 'SERVICE_FAILURE_FULL_REFUND' }),
        NOW,
      ),
    ).toMatchObject({ status: 'Unfulfilled', dimmed: true });
    expect(bookingRowFrom(dto('c', at, { status: 'completed' }), NOW)).toMatchObject({
      status: 'Completed',
      dimmed: false,
    });
  });

  it('does not call an unpaid hold "paid"', () => {
    expect(
      bookingRowFrom(dto('a', '2026-11-12T06:00:00.000Z', { status: 'created' }), NOW).statusLine,
    ).toBe('Payment pending · ₹188');
  });

  it('lifts the nearest booking that is not cancelled into Next visit', () => {
    const { next, later } = upcomingFrom(
      [
        dto('cancelled', '2026-10-12T06:00:00.000Z', { status: 'cancelled' }),
        dto('next', '2026-10-13T11:30:00.000Z'),
        dto('after', '2026-10-14T06:00:00.000Z'),
      ],
      NOW,
    );
    expect(next).toMatchObject({
      id: 'next',
      date: 'Tue, 13 Oct',
      slot: '5:00 PM · 1 hr',
      badge: 'CONFIRMED',
    });
    expect(later.map((row) => row.id)).toEqual(['cancelled', 'after']);
  });

  it('groups Past under month headers, adding the year outside the current one', () => {
    const rows = [
      dto('a', '2026-10-02T06:00:00.000Z'),
      dto('b', '2026-10-01T06:00:00.000Z'),
      dto('c', '2025-12-12T06:00:00.000Z'),
    ].map((booking) => bookingRowFrom(booking, NOW));
    expect(monthGroupsFrom(rows).map((group) => [group.month, group.rows.length])).toEqual([
      ['OCTOBER', 2],
      ['DECEMBER 2025', 1],
    ]);
  });

  it('counts what is loaded, with "+" while older pages remain', () => {
    expect(countLabel(3, false)).toBe('3');
    expect(countLabel(50, true)).toBe('50+');
  });

  it('words durations as the frames do', () => {
    expect([45, 60, 90, 120, 150].map(durationOf)).toEqual([
      '45 mins',
      '1 hr',
      '1.5 hrs',
      '2 hrs',
      '2.5 hrs',
    ]);
  });
});
