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

describe('My bookings tabs (31 Oct 2026: a cancelled booking is Past, whatever its date)', () => {
  const live = dto('live', {});
  const cancelledAhead = dto('cancelled-ahead', {
    status: 'cancelled',
    scheduledStart: '2026-10-12T06:00:00.000Z',
  });
  const cancelledPast = dto('cancelled-past', {
    status: 'cancelled',
    scheduledStart: '2026-10-01T06:00:00.000Z',
  });
  const completedAhead = dto('completed-ahead', {
    status: 'completed',
    scheduledStart: '2026-10-11T05:30:00.000Z',
  });
  const instantDone = dto('instant-done', { status: 'completed', scheduledStart: null });

  it('draws a booking cancelled for a later date on Past, not Upcoming', () => {
    const history = [cancelledAhead, cancelledPast, instantDone];
    expect(upcomingBookingsFrom([live], history, NOW).map((b) => b.id)).toEqual(['live']);
    expect(pastBookingsFrom(history, NOW).map((b) => b.id)).toEqual([
      'cancelled-ahead',
      'cancelled-past',
      'instant-done',
    ]);
  });

  it('keeps a cancelled booking off Upcoming even when the live list still carries it', () => {
    const apology = dto('apology', { status: 'cancelled' });
    expect(upcomingBookingsFrom([apology, live], [apology], NOW).map((b) => b.id)).toEqual([
      'live',
    ]);
    expect(pastBookingsFrom([apology], NOW)).toEqual([apology]);
  });

  it('still keeps a visit completed before its window closed on Upcoming until the slot passes', () => {
    expect(upcomingBookingsFrom([], [completedAhead], NOW).map((b) => b.id)).toEqual([
      'completed-ahead',
    ]);
    const later = new Date('2026-10-11T07:00:00.000Z');
    expect(upcomingBookingsFrom([], [completedAhead], later)).toEqual([]);
    expect(pastBookingsFrom([completedAhead], later)).toEqual([completedAhead]);
  });

  it('never lists a booking twice when both endpoints carry it', () => {
    expect(upcomingBookingsFrom([live], [live], NOW).map((b) => b.id)).toEqual(['live']);
  });
});
