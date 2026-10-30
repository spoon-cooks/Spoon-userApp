import type { RecurringBookingDto, VisitSummaryDto } from '@features/recurringSetup';

import { planHasLiveVisit, plansSummaryFrom } from './plansSummary';

/** Today is Thu 8 Oct 2026; the booking runs 28 Sept → 18 Oct with two plans. */
const TODAY = '2026-10-08';
const PRICE = {
  basePricePaise: 33814,
  pricePaise: 25339,
  gstPaise: 4561,
  totalPaise: 29900,
  pricingVersion: 'v1',
};

function past(
  overrides: Partial<VisitSummaryDto> & Pick<VisitSummaryDto, 'date'>,
): VisitSummaryDto {
  return {
    visitId: `v-${overrides.date}-${overrides.visitNumber ?? 1}`,
    planNumber: 2,
    visitNumber: 1,
    timeOfDay: 'morning',
    startTime: '09:00',
    start: `${overrides.date}T03:30:00.000Z`,
    durationMinutes: 60,
    status: 'completed',
    displayState: 'completed',
    cookConfirmBy: `${overrides.date}T00:30:00.000Z`,
    cook: {
      cookId: 'c1',
      displayName: 'Cook Meera',
      profileImageUrl: null,
      rating: { average: 4.5, count: 3 },
    },
    bookingId: 'b-1',
    totalPaise: 29900,
    cancelledBy: null,
    ...overrides,
  } as VisitSummaryDto;
}

const BOOKING = {
  recurringBookingId: 'rb-1',
  status: 'active',
  addressId: 'a-1',
  window: { startDate: '2026-09-28', endDate: '2026-10-18' },
  policyVersion: 'v',
  mandate: null,
  banner: null,
  counts: { done: 2, cancelled: 1, toGo: 3 },
  plans: [
    {
      planNumber: 2,
      days: ['2026-10-02', '2026-10-07', '2026-10-17', '2026-10-18'],
      visits: [
        {
          visitNumber: 2,
          timeOfDay: 'evening',
          durationMinutes: 90,
          startTime: '19:00',
          days: [],
          price: PRICE,
        },
        {
          visitNumber: 1,
          timeOfDay: 'morning',
          durationMinutes: 60,
          startTime: '09:00',
          days: [],
          price: PRICE,
        },
      ],
      history: [
        past({ date: '2026-10-02' }),
        past({ date: TODAY }),
        past({
          date: '2026-10-02',
          visitNumber: 2,
          startTime: '19:00',
          start: '2026-10-02T13:30:00.000Z',
          status: 'cancelled',
          displayState: 'cancelled',
          cancelledBy: 'customer',
          cook: null,
        }),
      ],
    },
    { planNumber: 1, days: ['2026-09-28'], visits: [], history: [] },
  ],
  days: [],
  upNext: null,
  chargeRange: { minPaise: 0, maxPaise: 0 },
  support: { whatsappUrl: null },
  createdAt: '2026-09-20T00:00:00.000Z',
  cancelledAt: null,
  cancelledBy: null,
} as unknown as RecurringBookingDto;

describe('plansSummaryFrom', () => {
  const model = plansSummaryFrom(BOOKING, TODAY);
  const plan2 = model.plans.find((plan) => plan.id === 'plan-2')!;

  it('makes one tab per plan in order, opening on the first', () => {
    expect(model.plans.map((plan) => plan.label)).toEqual(['Plan 1', 'Plan 2']);
    expect(model.activePlanId).toBe('plan-1');
  });

  it('marks the plan’s dates on the booking’s calendar, first and last apart', () => {
    expect(plan2.calendar.title).toBe('Plan 2 selected dates');
    const cells = plan2.calendar.rows.flatMap((row) => row.cells).filter((cell) => cell !== null);
    const marked = cells
      .filter((cell) => cell!.mark !== undefined)
      .map((cell) => [cell!.day, cell!.mark]);
    expect(marked).toEqual([
      [2, 'start'],
      [7, 'selected'],
      [17, 'selected'],
      [18, 'end'],
    ]);
    expect(plan2.calendar.rows[0]!.month).toBe('Sept');
  });

  it('draws each visit’s time of day, length and start time', () => {
    expect(plan2.visits.map((visit) => visit.label)).toEqual(['1st Visit', '2nd Visit']);
    expect(plan2.visits[1]!.details.map((tile) => [tile.key, tile.caption])).toEqual([
      ['evening', 'Evening'],
      ['duration', '90 minutes'],
      ['startTime', '7:00 PM'],
    ]);
  });

  it('lists each visit’s own past visits, newest first', () => {
    const [first, second] = plan2.visits;
    expect(first!.historyCount).toBe('2 past visits');
    expect(first!.history.map((row) => [row.status, row.title, row.meta])).toEqual([
      ['done', 'Today, 8 Oct · 9:00 AM', 'Completed · Cook Meera'],
      ['done', 'Fri, 2 Oct · 9:00 AM', 'Completed · Cook Meera'],
    ]);
    expect(second!.historyCount).toBe('1 past visit');
    expect(second!.history[0]).toMatchObject({ status: 'cancelled', meta: 'Cancelled by you' });
  });
});

describe('a booking whose Autopay was never approved', () => {
  const spoonCancelled = past({
    date: '2026-10-02',
    status: 'cancelled',
    displayState: 'cancelled',
    cancelledBy: 'spoon',
    cook: null,
  });
  const withHistory = (booking: Partial<RecurringBookingDto>) =>
    ({
      ...BOOKING,
      ...booking,
      plans: [{ ...BOOKING.plans[0]!, history: [spoonCancelled] }],
    }) as RecurringBookingDto;
  const metaOf = (booking: RecurringBookingDto) =>
    plansSummaryFrom(booking, TODAY).plans[0]?.visits.find((v) => v.id === 'visit-1')?.history[0]
      ?.meta;

  it('reads "Autopay not approved", not "Cancelled by Spoon"', () => {
    expect(metaOf(withHistory({ status: 'cancelled', cancelledBy: 'system' }))).toBe(
      'Cancelled · Autopay not approved',
    );
  });

  it('reads "Cancelled by Spoon" when an approved booking closed itself', () => {
    const approved = withHistory({
      status: 'cancelled',
      cancelledBy: 'system',
      mandate: {
        mandateId: 'm-1',
        method: 'upi',
        status: 'revoked',
        handleMasked: 'ra••••@okhdfc',
        maxAmountPaise: 100000,
      },
    } as Partial<RecurringBookingDto>);
    expect(metaOf(approved)).toBe('Cancelled by Spoon');
  });

  it('still reads "Cancelled by Spoon" when Spoon cancelled it', () => {
    expect(metaOf(withHistory({ status: 'active', cancelledBy: null }))).toBe('Cancelled by Spoon');
  });
});

describe('after a Plan is deleted or one day’s duration changed', () => {
  const upcoming = (date: string, overrides: Partial<VisitSummaryDto> = {}) =>
    past({
      date,
      status: 'scheduled',
      displayState: 'cook_pending',
      cook: null,
      bookingId: null,
      ...overrides,
    });
  const withPlan1 = (visits: readonly VisitSummaryDto[]) =>
    ({
      ...BOOKING,
      plans: BOOKING.plans.map((plan) =>
        plan.planNumber === 1
          ? {
              ...plan,
              visits: [{ ...BOOKING.plans[0]!.visits[1]!, visitNumber: 1 }],
            }
          : plan,
      ),
      days: visits.map((visit) => ({ date: visit.date, group: 'upcoming', visits: [visit] })),
    }) as unknown as RecurringBookingDto;
  const cancelled = {
    status: 'cancelled',
    displayState: 'cancelled',
    cancelledBy: 'customer',
  } as const;

  it('leaves out a live booking’s Plan whose every visit is cancelled', () => {
    const booking = withPlan1([
      upcoming('2026-10-20', { planNumber: 1, ...cancelled }),
      upcoming('2026-10-21', { planNumber: 1, ...cancelled }),
    ]);
    expect(planHasLiveVisit(booking, 1)).toBe(false);
    expect(planHasLiveVisit(booking, 2)).toBe(true);
    const model = plansSummaryFrom(booking, TODAY);
    expect(model.plans.map((plan) => plan.label)).toEqual(['Plan 2']);
    expect(model.activePlanId).toBe('plan-2');
  });

  it('keeps every Plan on a closed booking, as its record', () => {
    const booking = {
      ...withPlan1([upcoming('2026-10-20', { planNumber: 1, ...cancelled })]),
      status: 'cancelled',
    } as RecurringBookingDto;
    expect(plansSummaryFrom(booking, TODAY).plans.map((plan) => plan.label)).toEqual([
      'Plan 1',
      'Plan 2',
    ]);
  });

  it('names the range of lengths once one day runs longer', () => {
    const booking = withPlan1([
      upcoming('2026-10-20', { planNumber: 1 }),
      upcoming('2026-10-21', { planNumber: 1, durationMinutes: 90 }),
    ]);
    const plan1 = plansSummaryFrom(booking, TODAY).plans.find((plan) => plan.id === 'plan-1')!;
    expect(plan1.visits[0]!.details.find((tile) => tile.key === 'duration')!.caption).toBe(
      '60–90 mins',
    );
  });
});
