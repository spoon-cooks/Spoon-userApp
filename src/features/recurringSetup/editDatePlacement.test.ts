import { sameVisit, withDayInMatchingPlan } from './data';
import type { RecurringPlanDraft, RecurringVisitChoice } from './types';

/**
 * Editing one date's visit on the Summary (device test, 31 Oct 2026): the date joins the plan that
 * already has exactly that visit, instead of always starting a new, identical plan.
 */
const MORNING_60: RecurringVisitChoice = {
  timeOfDay: 'morning',
  durationId: 'd60',
  startMinutes: 9 * 60,
};
const EVENING_90: RecurringVisitChoice = {
  timeOfDay: 'evening',
  durationId: 'd90',
  startMinutes: 19 * 60,
};
const PLANS: RecurringPlanDraft[] = [
  { id: 'plan-1', dayIds: ['2026-11-02', '2026-11-04'], visits: [MORNING_60] },
  { id: 'plan-2', dayIds: ['2026-11-03', '2026-11-07'], visits: [EVENING_90] },
];

describe('sameVisit', () => {
  it('is the same time of day, duration and start, whatever days it runs on', () => {
    expect(sameVisit(MORNING_60, { ...MORNING_60, dayIds: ['2026-11-02'] })).toBe(true);
    expect(sameVisit(MORNING_60, { ...MORNING_60, durationId: 'd90' })).toBe(false);
    expect(sameVisit(MORNING_60, { ...MORNING_60, startMinutes: 10 * 60 })).toBe(false);
  });
});

describe('withDayInMatchingPlan', () => {
  it('adds the date to the plan whose visit it now has, in date order', () => {
    const joined = withDayInMatchingPlan(PLANS, '2026-11-05', EVENING_90);
    expect(joined?.planIndex).toBe(1);
    expect(joined?.plans).toHaveLength(2);
    expect(joined?.plans[1]?.dayIds).toEqual(['2026-11-03', '2026-11-05', '2026-11-07']);
    expect(joined?.plans[0]).toBe(PLANS[0]);
  });

  it('does not repeat a date the plan already has', () => {
    expect(withDayInMatchingPlan(PLANS, '2026-11-03', EVENING_90)?.plans[1]?.dayIds).toEqual([
      '2026-11-03',
      '2026-11-07',
    ]);
  });

  it('finds no plan for a visit none of them has, so a new plan is started', () => {
    expect(
      withDayInMatchingPlan(PLANS, '2026-11-05', { ...EVENING_90, durationId: 'd120' }),
    ).toBeNull();
  });
});
