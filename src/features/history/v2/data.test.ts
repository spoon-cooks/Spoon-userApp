import type { BookingSummaryDto } from '@features/booking';

import { pastBookingsFrom, upcomingBookingsFrom } from './data';

const NOW = new Date('2026-10-11T06:00:00.000Z');

const dto = (id: string, extra: Partial<BookingSummaryDto>): BookingSummaryDto =>
  ({
    id,
    status: 'assigned',
    slotType: 'scheduled',
    scheduledStart: '2026-10-20T06:00:00.000Z',
    durationMinutes: 60,
    price: { totalAmountPaise: 18800 },
    ...extra,
  }) as BookingSummaryDto;

describe('My bookings tabs (dev note 2192:4489: Cancelled stays on Upcoming until its date)', () => {
  const live = dto('live', {});
  const cancelledAhead = dto('cancelled-ahead', {
    status: 'cancelled',
    scheduledStart: '2026-10-12T06:00:00.000Z',
  });
  const cancelledPast = dto('cancelled-past', {
    status: 'cancelled',
    scheduledStart: '2026-10-01T06:00:00.000Z',
  });
  const instantDone = dto('instant-done', { status: 'completed', scheduledStart: null });

  it('draws a booking cancelled for a later date on Upcoming, not Past', () => {
    const history = [cancelledAhead, cancelledPast, instantDone];
    expect(upcomingBookingsFrom([live], history, NOW).map((b) => b.id)).toEqual([
      'cancelled-ahead',
      'live',
    ]);
    expect(pastBookingsFrom(history, NOW).map((b) => b.id)).toEqual([
      'cancelled-past',
      'instant-done',
    ]);
  });

  it('moves it to Past once its slot has passed', () => {
    const later = new Date('2026-10-12T07:30:00.000Z');
    expect(upcomingBookingsFrom([], [cancelledAhead], later)).toEqual([]);
    expect(pastBookingsFrom([cancelledAhead], later)).toEqual([cancelledAhead]);
  });

  it('never lists a booking twice when both endpoints carry it', () => {
    const apology = dto('apology', { status: 'cancelled' });
    expect(upcomingBookingsFrom([apology], [apology], NOW).map((b) => b.id)).toEqual(['apology']);
  });
});
