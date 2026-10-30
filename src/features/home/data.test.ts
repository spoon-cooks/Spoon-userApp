import { slotHasEnded } from '@core/time';
import { minutesRemainingUntil } from './adapters';
import { homeCookPhotoFor, selectHomeBookings } from './data';

import type { BookingSummaryDto } from '@features/booking';

const booking = (input: Partial<BookingSummaryDto> & Pick<BookingSummaryDto, 'id' | 'status'>) =>
  ({
    id: input.id,
    status: input.status,
    slotType: 'scheduled',
    scheduledStart: input.scheduledStart ?? '2026-08-26T12:00:00.000Z',
    durationMinutes: input.durationMinutes ?? 60,
    price: input.price ?? {
      amountPaise: 12900,
      durationMinutes: 60,
      serviceAmountPaise: 12900,
      taxRateBps: 0,
      taxAmountPaise: 0,
      totalAmountPaise: 12900,
      currency: 'INR',
      pricingVersion: 'pricing-v1',
    },
  }) as BookingSummaryDto;

describe('selectHomeBookings', () => {
  it('orders ascending by scheduled start, regardless of status', () => {
    const selected = selectHomeBookings([
      booking({ id: 'completed', status: 'completed', scheduledStart: '2026-08-26T10:00:00.000Z' }),
      booking({
        id: 'travelling',
        status: 'cook_en_route',
        scheduledStart: '2026-08-26T14:00:00.000Z',
      }),
    ]);

    expect(selected.map((entry) => entry.id)).toEqual(['completed', 'travelling']);
  });

  it('uses id as a deterministic tie-breaker for equal (or absent) timestamps', () => {
    const selected = selectHomeBookings([
      booking({ id: 'z', status: 'assigned', scheduledStart: '2026-08-26T14:00:00.000Z' }),
      booking({ id: 'a', status: 'assigned', scheduledStart: '2026-08-26T12:00:00.000Z' }),
      booking({ id: 'b', status: 'assigned', scheduledStart: '2026-08-26T09:00:00.000Z' }),
    ]);

    expect(selected.map((entry) => entry.id)).toEqual(['b', 'a', 'z']);

    expect(
      selectHomeBookings([
        booking({ id: 'z', status: 'assigned' }),
        booking({ id: 'a', status: 'assigned' }),
      ]).map((entry) => entry.id),
    ).toEqual(['a', 'z']);
  });

  /**
   * The old single-pick version dropped every cancelled row unconditionally. This function no
   * longer does that — a booking the SYSTEM cancelled still needs to reach `homeBannerFor` to get
   * its apology card; distinguishing system from customer cancellation needs `cancelledBy`, which
   * only the per-booking DETAIL carries, not this summary. So a cancelled row passes through here
   * exactly like any other, ordered by its own `scheduledStart`.
   */
  it('does not drop cancelled bookings — that discrimination happens downstream, on detail', () => {
    const selected = selectHomeBookings([
      booking({ id: 'upcoming', status: 'assigned', scheduledStart: '2026-08-26T14:00:00.000Z' }),
      booking({ id: 'cancelled', status: 'cancelled', scheduledStart: '2026-08-26T09:00:00.000Z' }),
    ]);

    expect(selected.map((entry) => entry.id)).toEqual(['cancelled', 'upcoming']);
  });

  it('returns an empty array for an empty input, and does not mutate its argument', () => {
    expect(selectHomeBookings([])).toEqual([]);

    const input = [
      booking({ id: 'b', status: 'assigned' }),
      booking({ id: 'a', status: 'assigned' }),
    ];
    const original = [...input];
    selectHomeBookings(input);
    expect(input).toEqual(original);
  });
});

/**
 * When a cancelled card stops being Home's business.
 *
 * The window is the one the card itself draws — `formatTimeLabel` renders
 * `scheduledStart + durationMinutes` as "5:30 PM • 30 mins" — so the card and its own lifetime
 * are derived from the same two fields and cannot disagree.
 */
describe('slotHasEnded', () => {
  /** The reported case: a 30-minute booking at 5:00 PM, cancelled beforehand. */
  const start = '2026-09-13T17:00:00.000Z';
  const at = (iso: string) => new Date(iso);

  it('keeps the card while the booked slot is still running', () => {
    expect(slotHasEnded(start, 30, at('2026-09-13T16:59:00.000Z'))).toBe(false);
    expect(slotHasEnded(start, 30, at('2026-09-13T17:15:00.000Z'))).toBe(false);
    expect(slotHasEnded(start, 30, at('2026-09-13T17:29:59.000Z'))).toBe(false);
  });

  it('retires the card the moment the slot ends', () => {
    // 5:00 PM + 30 min. The end instant itself counts as ended — the slot is over.
    expect(slotHasEnded(start, 30, at('2026-09-13T17:30:00.000Z'))).toBe(true);
    expect(slotHasEnded(start, 30, at('2026-09-13T17:30:01.000Z'))).toBe(true);
    expect(slotHasEnded(start, 30, at('2026-09-14T09:00:00.000Z'))).toBe(true);
  });

  it('measures from the booking’s own duration, not a fixed window', () => {
    // The same start, two hours long, is still running when the 30-minute one has finished.
    expect(slotHasEnded(start, 120, at('2026-09-13T17:30:00.000Z'))).toBe(false);
    expect(slotHasEnded(start, 120, at('2026-09-13T19:00:00.000Z'))).toBe(true);
  });

  /**
   * Nothing to have ended. An instant booking carries no `scheduledStart`, and hiding a card on
   * the strength of a timestamp that could not be read would be the worse failure.
   */
  it('leaves a card alone when there is no window to judge', () => {
    expect(slotHasEnded(null, 30, at('2026-09-14T09:00:00.000Z'))).toBe(false);
    expect(slotHasEnded(undefined, 30, at('2026-09-14T09:00:00.000Z'))).toBe(false);
    expect(slotHasEnded('not-a-date', 30, at('2026-09-14T09:00:00.000Z'))).toBe(false);
  });
});

/**
 * The live card's "Time left".
 *
 * Rounds UP, unlike `minutesUntil` beside it: this is a countdown against a paid duration, and a
 * 30-minute service whose card reads "29 mins" seconds after it started shows the customer a
 * minute short of what they bought. It is the same rule `formatRemaining` applies on the booking
 * screen, so the two surfaces agree about one booking.
 */
describe('minutesRemainingUntil', () => {
  const end = '2026-09-13T17:30:00.000Z';
  const at = (iso: string) => new Date(iso);

  it('holds at the booked figure until a whole minute has actually gone', () => {
    // The service began three seconds ago. 29:57 left is a 30-minute booking.
    expect(minutesRemainingUntil(end, at('2026-09-13T17:00:03.000Z'))).toBe(30);
    // Still 30 with a second to spare; 29 only once the minute is genuinely spent.
    expect(minutesRemainingUntil(end, at('2026-09-13T17:00:59.000Z'))).toBe(30);
    expect(minutesRemainingUntil(end, at('2026-09-13T17:01:00.000Z'))).toBe(29);
  });

  it('never reports time left that has already run out', () => {
    expect(minutesRemainingUntil(end, at('2026-09-13T17:30:00.000Z'))).toBe(0);
    expect(minutesRemainingUntil(end, at('2026-09-13T17:45:00.000Z'))).toBe(0);
  });

  it('has nothing to count without a server timestamp', () => {
    expect(minutesRemainingUntil(null, at('2026-09-13T17:00:00.000Z'))).toBeNull();
    expect(minutesRemainingUntil(undefined, at('2026-09-13T17:00:00.000Z'))).toBeNull();
    expect(minutesRemainingUntil('not-a-date', at('2026-09-13T17:00:00.000Z'))).toBeNull();
  });
});

/**
 * Home draws the backend's photo for a booking's cook, or none: the app bundles no cook's
 * photograph (DEC-114), so there is no per-cook fallback to pick between.
 */
describe('homeCookPhotoFor', () => {
  it('draws the hosted photo, with no bundled fallback', () => {
    const hosted = 'https://cdn.spoonhelp.com/cooks/meera.png';
    expect(homeCookPhotoFor({ photoUrl: hosted, profileCode: 'COOK_MEERA' })).toEqual({
      cookPhotoUrl: hosted,
      cookPhotoFallbackUrl: null,
    });
  });

  it('draws no photo when the backend sends none, whatever the profile code', () => {
    for (const profileCode of ['COOK_MEERA', null]) {
      expect(homeCookPhotoFor({ photoUrl: null, profileCode })).toEqual({
        cookPhotoUrl: null,
        cookPhotoFallbackUrl: null,
      });
    }
    expect(homeCookPhotoFor(null)).toEqual({ cookPhotoUrl: null, cookPhotoFallbackUrl: null });
  });
});
