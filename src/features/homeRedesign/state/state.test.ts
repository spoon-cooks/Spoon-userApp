import { canBook, ctaKind, draftReducer, initialDraft } from './bookingDraft';
import {
  forCta,
  isDurationAvailable,
  liquidHeight,
  nearestAvailableId,
  showsMrp,
} from './durations';
import { recommendDuration } from './recommendDuration';
import type { DishComplexity } from './recommendDuration';
import { poolBeads, recurringChipFor } from './recurring';
import { resolveHomeVariant } from './variant';
import { joinWaitlist, waitlistProgress } from './waitlist';
import type { DurationOption, PoolCook } from '../types';

const DURATIONS: DurationOption[] = [30, 45, 60, 90, 120, 150].map((minutes) => ({
  id: `${minutes}`,
  minutes,
  label: `${minutes}`,
  pricePaise: 6900,
  mrpPaise: 15000,
  payablePaise: 7500,
  available: { now: true, later: true },
}));
const cook = (id: string, photo = true): PoolCook => ({ id, name: id, photo: photo ? 1 : null });

describe('resolveHomeVariant', () => {
  it('sends a not-live pincode to the inactive home, whatever the booking history', () => {
    expect(
      resolveHomeVariant({ serviceability: 'not_live', user: { hasCompletedBooking: true } }),
    ).toBe('inactive');
  });
  it('picks returning for a live pincode with a completed booking', () => {
    expect(
      resolveHomeVariant({ serviceability: 'live', user: { hasCompletedBooking: true } }),
    ).toBe('returning');
  });
  it('falls back to default', () => {
    expect(
      resolveHomeVariant({ serviceability: 'live', user: { hasCompletedBooking: false } }),
    ).toBe('default');
  });
});

describe('booking draft', () => {
  const start = initialDraft({ focusedDurationId: '60', instantAvailable: true });

  it('opens focused on the default tile but with nothing selected, so the CTA is off', () => {
    expect(start.focusedDurationId).toBe('60');
    expect(start.selectedDurationId).toBeNull();
    expect(canBook(start)).toBe(false);
  });

  it('enables the CTA once a tile is tapped', () => {
    const next = draftReducer(start, { type: 'selectDuration', id: '90' });
    expect(next).toMatchObject({ focusedDurationId: '90', selectedDurationId: '90' });
    expect(canBook(next)).toBe(true);
  });

  it('only moves focus when scrolling before a tap', () => {
    const next = draftReducer(start, { type: 'focusDuration', id: '45' });
    expect(next).toMatchObject({ focusedDurationId: '45', selectedDurationId: null });
  });

  it('keeps the selection when the carousel is scrolled away', () => {
    const tapped = draftReducer(start, { type: 'selectDuration', id: '90' });
    expect(draftReducer(tapped, { type: 'focusDuration', id: '120' })).toMatchObject({
      focusedDurationId: '120',
      selectedDurationId: '90',
    });
  });

  it('does not deselect when the selected tile is tapped again', () => {
    const tapped = draftReducer(start, { type: 'selectDuration', id: '90' });
    expect(draftReducer(tapped, { type: 'selectDuration', id: '90' }).selectedDurationId).toBe(
      '90',
    );
  });

  it('clears a selection that became unavailable', () => {
    const tapped = draftReducer(start, { type: 'selectDuration', id: '90' });
    expect(draftReducer(tapped, { type: 'clearSelection' }).selectedDurationId).toBeNull();
  });

  it('keeps the duration when leaving recurring and going back to now', () => {
    const tapped = draftReducer(start, { type: 'selectDuration', id: '90' });
    const recurring = draftReducer(tapped, { type: 'setMode', mode: 'recurring' });
    expect(canBook(recurring)).toBe(false);
    const back = draftReducer(recurring, { type: 'setMode', mode: 'now' });
    expect(back.selectedDurationId).toBe('90');
    expect(canBook(back)).toBe(true);
  });

  it('starts on Later when instant is unavailable', () => {
    expect(initialDraft({ focusedDurationId: '60', instantAvailable: false }).mode).toBe('later');
  });

  it('books on Now with instant, schedules otherwise, and hands Recurring off', () => {
    expect(ctaKind('now', true)).toBe('book');
    expect(ctaKind('now', false)).toBe('schedule');
    expect(ctaKind('later', true)).toBe('schedule');
    expect(ctaKind('recurring', true)).toBe('none');
  });

  it('clamps the counters', () => {
    expect(draftReducer(start, { type: 'setDishes', value: 0 }).dishes).toBe(1);
    expect(draftReducer(start, { type: 'setDishes', value: 9 }).dishes).toBe(5);
    expect(draftReducer(start, { type: 'setPeople', value: 99 }).people).toBe(8);
  });
});

describe('recommendDuration', () => {
  const minutes = (complexity: 'simple' | 'complex', dishes: number, people: number) =>
    recommendDuration({ complexity, dishes, people }, DURATIONS)?.minutes;

  it("reads the owner's dish-load table, every cell", () => {
    // Columns: 1-2, 3-4, 5-6, 7-8 people; checked at both ends of each band.
    const table: [DishComplexity, number[], number[]][] = [
      ['simple', [1, 2], [30, 45, 60, 90]],
      ['complex', [1, 2], [45, 60, 90, 90]],
      ['simple', [3], [60, 90, 90, 120]],
      ['complex', [3], [90, 90, 120, 120]],
      ['simple', [4, 5], [90, 120, 120, 150]],
      ['complex', [4, 5], [120, 120, 150, 150]],
    ];
    for (const [complexity, dishCounts, row] of table) {
      for (const dishes of dishCounts) {
        row.forEach((expected, column) => {
          expect(minutes(complexity, dishes, column * 2 + 1)).toBe(expected);
          expect(minutes(complexity, dishes, column * 2 + 2)).toBe(expected);
        });
      }
    }
  });

  it('puts 2 dishes in the 1-2 row: Complex, 2 dishes, 4 people is 1 hr', () => {
    expect(minutes('complex', 2, 4)).toBe(60);
  });
  it('caps at the longest duration on offer', () => {
    expect(
      recommendDuration({ complexity: 'complex', dishes: 5, people: 8 }, [
        DURATIONS[0]!,
        DURATIONS[3]!,
      ])?.minutes,
    ).toBe(90);
  });
  it('returns null with nothing on offer', () => {
    expect(recommendDuration({ complexity: 'simple', dishes: 1, people: 1 }, [])).toBeNull();
  });
});

describe('recurring', () => {
  it('shows the live plan first', () => {
    expect(recurringChipFor({ cookPool: [], activeRecurringPlan: { id: 'p' } })).toEqual({
      label: 'Recurring · Live',
      target: 'planTracker',
      tone: 'lime',
    });
  });
  it('offers Book Recurring from two pooled cooks', () => {
    const model = { cookPool: [cook('a'), cook('b')], activeRecurringPlan: null };
    expect(recurringChipFor(model).target).toBe('recurringFlow');
  });
  it('points at the explainer under two cooks', () => {
    const model = { cookPool: [cook('a')], activeRecurringPlan: null };
    expect(recurringChipFor(model)).toEqual({
      label: 'Check Recurring',
      target: 'explainer',
      tone: 'outline',
    });
  });
  it("follows the backend's chip over the local pool count once it has answered", () => {
    const two = [cook('a'), cook('b')];
    expect(
      recurringChipFor({ cookPool: two, activeRecurringPlan: null, recurringChip: 'locked' })
        .target,
    ).toBe('explainer');
    expect(
      recurringChipFor({ cookPool: [], activeRecurringPlan: null, recurringChip: 'book' }).target,
    ).toBe('recurringFlow');
    expect(
      recurringChipFor({ cookPool: two, activeRecurringPlan: null, recurringChip: 'live' }).target,
    ).toBe('planTracker');
  });
  it('draws only real cooks, at most six', () => {
    const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => cook(id));
    expect(poolBeads({ cookPool: [cook('x', false), ...pool] }).map((c) => c.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
    ]);
  });
});

describe('waitlist', () => {
  it('fills by count over threshold, capped at 100 %', () => {
    expect(waitlistProgress({ countForPincode: 50, launchThreshold: 200 })).toBe(0.25);
    expect(waitlistProgress({ countForPincode: 500, launchThreshold: 200 })).toBe(1);
    expect(waitlistProgress({ countForPincode: 5, launchThreshold: 0 })).toBe(0);
  });

  it('asks for permission at tap and registers for push when granted', async () => {
    const register = jest.fn().mockResolvedValue(undefined);
    const result = await joinWaitlist(
      { pincode: '560001', alreadyJoined: false },
      { requestPushPermission: () => Promise.resolve(true), register },
    );
    expect(result.channel).toBe('push');
    expect(register).toHaveBeenCalledWith({ pincode: '560001', channel: 'push' });
  });

  it('falls back to SMS when permission is refused or the prompt fails', async () => {
    const register = jest.fn().mockResolvedValue(undefined);
    await joinWaitlist(
      { pincode: '560001', alreadyJoined: false },
      { requestPushPermission: () => Promise.reject(new Error('x')), register },
    );
    expect(register).toHaveBeenCalledWith({ pincode: '560001', channel: 'sms' });
  });

  it('does nothing once joined', async () => {
    const register = jest.fn();
    const requestPushPermission = jest.fn();
    await joinWaitlist(
      { pincode: '560001', alreadyJoined: true },
      { requestPushPermission, register },
    );
    expect(requestPushPermission).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });
});

describe('durations', () => {
  const mixed = DURATIONS.map((d) =>
    d.minutes === 60 ? { ...d, available: { now: false, later: true } } : d,
  );

  it('judges Now on instant availability and everything else on slots', () => {
    const hour = mixed.find((d) => d.minutes === 60)!;
    expect(isDurationAvailable(hour, 'book')).toBe(false);
    expect(isDurationAvailable(hour, 'schedule')).toBe(true);
  });

  it('snaps focus to the nearest bookable tile, shorter first on a tie', () => {
    expect(nearestAvailableId(mixed, '60', 'book')).toBe('45');
    expect(nearestAvailableId(mixed, '60', 'schedule')).toBe('60');
  });

  it("keeps liquid proportional to minutes, landing on the frames' heights", () => {
    expect([30, 45, 60, 90, 120, 150].map((m) => liquidHeight(m, false))).toEqual([
      22, 33, 43, 65, 87, 108,
    ]);
    expect([30, 45, 60, 90, 120, 150].map((m) => liquidHeight(m, true))).toEqual([
      27, 40, 53, 80, 107, 133,
    ]);
  });

  it('hides the MRP when missing or equal to the price', () => {
    expect(showsMrp({ pricePaise: 6900, mrpPaise: 15000 })).toBe(true);
    expect(showsMrp({ pricePaise: 6900, mrpPaise: 6900 })).toBe(false);
    expect(showsMrp({ pricePaise: 6900, mrpPaise: null })).toBe(false);
  });
});

describe('forCta', () => {
  const tile = {
    id: 'dur-60',
    minutes: 60,
    label: '1 hr',
    pricePaise: 9_900,
    mrpPaise: 30_000,
    payablePaise: 10_395,
    bySlotType: {
      instant: { pricePaise: 14_900, mrpPaise: 30_000, payablePaise: 15_645 },
      scheduled: { pricePaise: 9_900, mrpPaise: 30_000, payablePaise: 10_395 },
    },
    available: { now: true, later: true },
  } as DurationOption;

  it('shows the Instant price while the CTA is Book Now', () => {
    expect(forCta(tile, 'book')).toMatchObject({ pricePaise: 14_900, payablePaise: 15_645 });
  });

  it('shows the Scheduled price for Book for later and for Recurring', () => {
    expect(forCta(tile, 'schedule').payablePaise).toBe(10_395);
    expect(forCta(tile, 'none').pricePaise).toBe(9_900);
  });

  it('leaves a tile without per-type prices as it is', () => {
    const { bySlotType: _ignored, ...plain } = tile;
    expect(forCta(plain as DurationOption, 'book')).toEqual(plain);
  });
});
