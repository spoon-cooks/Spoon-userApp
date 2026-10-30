import type { BookingDetailDto, BookingSummaryDto } from '@features/booking';
import type { RecurringBookingDto, VisitSummaryDto } from '@features/recurringSetup';

import {
  activeBookingCardsFrom,
  activeBookingIdsNeedingDetail,
  bannerDuration,
  timeOfDayAt,
} from './activeBookings';
import type { ActiveBookingSources } from './activeBookings';

const TZ = 'Asia/Kolkata';
/** Mon 12 Oct 2026, 10:00 IST. */
const NOW = new Date('2026-10-12T04:30:00Z');

const booking = (
  id: string,
  status: BookingSummaryDto['status'],
  scheduledStart: string,
  durationMinutes = 120,
) => ({ id, status, scheduledStart, durationMinutes }) as unknown as BookingSummaryDto;

const detail = (id: string, timing: Partial<BookingDetailDto['timing']>, total?: number) =>
  ({
    id,
    durationMinutes: 120,
    totalDurationMinutes: total ?? null,
    timing: { actualStart: null, expectedEnd: null, actualEnd: null, ...timing },
  }) as unknown as BookingDetailDto;

const visit = (overrides: Partial<VisitSummaryDto>): VisitSummaryDto =>
  ({
    visitId: 'v-1',
    start: '2026-10-14T13:30:00Z',
    durationMinutes: 120,
    status: 'scheduled',
    bookingId: null,
    ...overrides,
  }) as VisitSummaryDto;

const plan = (visits: VisitSummaryDto[], upNext: VisitSummaryDto | null): RecurringBookingDto =>
  ({
    recurringBookingId: 'rb-1',
    status: 'active',
    days: [{ date: '2026-10-12', group: 'today', visits }],
    upNext,
  }) as unknown as RecurringBookingDto;

function sources(overrides: Partial<ActiveBookingSources>): ActiveBookingSources {
  return {
    bookings: [],
    details: new Map(),
    recurring: undefined,
    timeZone: TZ,
    now: NOW,
    ...overrides,
  };
}

describe('activeBookingCardsFrom', () => {
  it('maps statuses onto the three states and drops created and cancelled', () => {
    const cards = activeBookingCardsFrom(
      sources({
        bookings: [
          booking('a', 'assigned', '2026-10-12T07:30:00Z'),
          booking('b', 'cook_arrived', '2026-10-12T06:30:00Z'),
          booking('c', 'cooking', '2026-10-12T03:30:00Z'),
          booking('d', 'completed', '2026-10-11T03:30:00Z'),
          booking('e', 'created', '2026-10-12T08:30:00Z'),
          booking('f', 'cancelled', '2026-10-12T09:30:00Z'),
        ],
      }),
    );
    expect(cards.map((c) => [c.key, c.state])).toEqual([
      // In progress first, then Upcoming by start time, then Completed.
      ['booking:c', 'in_progress'],
      ['booking:b', 'upcoming'],
      ['booking:a', 'upcoming'],
      ['booking:d', 'completed'],
    ]);
  });

  it('writes the date line on the service clock: Today, Tomorrow, else "Wed, 14 Oct"', () => {
    const cards = activeBookingCardsFrom(
      sources({
        bookings: [
          booking('today', 'assigned', '2026-10-12T07:30:00Z'),
          booking('tomorrow', 'assigned', '2026-10-13T07:30:00Z'),
          booking('later', 'assigned', '2026-10-14T13:30:00Z'),
          booking('done', 'completed', '2026-10-10T03:30:00Z'),
        ],
      }),
    );
    expect(cards.map((c) => c.whenLabel.replace(/\s/g, ' '))).toEqual([
      'Today · 1:00 PM',
      'Tomorrow · 1:00 PM',
      'Wed, 14 Oct · 7:00 PM',
      'Sat, 10 Oct · 9:00 AM',
    ]);
  });

  it('reads In progress as "Today · start time" and its duration from the detail', () => {
    const [card] = activeBookingCardsFrom(
      sources({
        bookings: [booking('c', 'cooking', '2026-10-12T03:30:00Z')],
        details: new Map([
          [
            'c',
            detail(
              'c',
              { actualStart: '2026-10-12T03:35:00Z', expectedEnd: '2026-10-12T06:05:00Z' },
              150,
            ),
          ],
        ]),
      }),
    );
    expect(card?.whenLabel.replace(/\s/g, ' ')).toBe('Today · 9:00 AM');
    // Extended to 2.5 hrs: the duration follows the detail, not the original booking.
    expect(card?.duration).toEqual({ value: '2.5', unit: 'HRS' });
  });

  it('tags a booking that is a Recurring visit, and every other one ONE-TIME', () => {
    const cards = activeBookingCardsFrom(
      sources({
        bookings: [
          booking('visit-booking', 'assigned', '2026-10-12T07:30:00Z'),
          booking('one-off', 'assigned', '2026-10-12T08:30:00Z'),
        ],
        recurring: [plan([visit({ bookingId: 'visit-booking' })], null)],
      }),
    );
    expect(cards.map((c) => [c.key, c.type])).toEqual([
      ['booking:visit-booking', 'recurring'],
      ['booking:one-off', 'one_time'],
    ]);
  });

  it('shows a Recurring visit only once it is a booking (its T−3h debit), never from the plan', () => {
    // Two days out: still only on the plan's schedule, so Home draws nothing for it.
    const next = visit({ visitId: 'v-9', start: '2026-10-14T13:30:00Z' });
    expect(activeBookingCardsFrom(sources({ recurring: [plan([next], next)] }))).toEqual([]);

    // Debited at T−3h: it is a booking now, and arrives through the active list.
    const booked = visit({ visitId: 'v-9', start: '2026-10-12T07:30:00Z', bookingId: 'b-9' });
    const [card] = activeBookingCardsFrom(
      sources({
        bookings: [booking('b-9', 'assigned', '2026-10-12T07:30:00Z')],
        recurring: [plan([booked], booked)],
      }),
    );
    expect(card).toMatchObject({ bookingId: 'b-9', type: 'recurring', state: 'upcoming' });
  });

  it('asks for details only where the card draws from them', () => {
    expect(
      activeBookingIdsNeedingDetail([
        booking('a', 'assigned', '2026-10-12T07:30:00Z'),
        booking('c', 'cooking', '2026-10-12T03:30:00Z'),
        booking('d', 'completed', '2026-10-11T03:30:00Z'),
      ]),
    ).toEqual(['c', 'd']);
  });
});

describe('banner helpers', () => {
  it('reads minutes under an hour as MINS and hours as HR / HRS', () => {
    expect(bannerDuration(45)).toEqual({ value: '45', unit: 'MINS' });
    expect(bannerDuration(60)).toEqual({ value: '1', unit: 'HR' });
    expect(bannerDuration(90)).toEqual({ value: '1.5', unit: 'HRS' });
    expect(bannerDuration(120)).toEqual({ value: '2', unit: 'HRS' });
  });

  it('bands the backdrop at 12:00 and 17:00 on the service clock', () => {
    expect(timeOfDayAt(TZ, new Date('2026-10-12T06:29:00Z'))).toBe('morning'); // 11:59
    expect(timeOfDayAt(TZ, new Date('2026-10-12T06:30:00Z'))).toBe('afternoon'); // 12:00
    expect(timeOfDayAt(TZ, new Date('2026-10-12T11:29:00Z'))).toBe('afternoon'); // 16:59
    expect(timeOfDayAt(TZ, new Date('2026-10-12T11:30:00Z'))).toBe('evening'); // 17:00
  });
});
