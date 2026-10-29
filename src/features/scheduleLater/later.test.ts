import type { ScheduledOverviewDto } from '@features/availability';
import type { Catalogue } from '@features/catalogue';

import {
  firstOpenPeriodId,
  laterDurationLabel,
  laterModelFrom,
  laterSummaryWhen,
  minutesOfDurationId,
} from './later';

/**
 * Schedule for Later's model (DEC-094, Figma `2466:18844`): a duration with nothing free on any of
 * the three days, a day with nothing free, and a time of day with nothing free are greyed; until
 * the overview answers nothing is.
 */
const CATALOGUE = {
  durations: [60, 90].map((durationMinutes) => ({
    durationMinutes,
    serviceAmountPaise: durationMinutes * 115,
    taxAmountPaise: durationMinutes * 6,
    totalAmountPaise: durationMinutes * 121,
    latestStartLocalMinute: 1260,
  })),
  operatingWindow: { timeZone: 'Asia/Kolkata', openLocalMinute: 300, closeLocalMinute: 1320 },
  scheduled: {
    horizonDays: 3,
    slotIntervalMinutes: 30,
    periods: [
      { id: 'MORNING', startMinute: 300, endMinute: 720 },
      { id: 'NOON', startMinute: 720, endMinute: 960 },
      { id: 'EVENING', startMinute: 960, endMinute: 1320 },
    ],
  },
} as unknown as Catalogue;

/** Tue 13 Oct 2026, 10:00 in Bengaluru. */
const NOW = new Date('2026-10-13T04:30:00.000Z');
const DATES = ['2026-10-13', '2026-10-14', '2026-10-15'];

/** A slot at `HH:MM` IST on `date`. */
const at = (date: string, time: string, available: boolean) => ({
  start: new Date(`${date}T${time}:00+05:30`).toISOString(),
  available,
  reason: available ? 'AVAILABLE' : 'NO_PRESENT_COOK',
});

function overview(): ScheduledOverviewDto {
  const day = (date: string, free: boolean) => ({
    date,
    available: free,
    slots: [
      at(date, '10:30', false),
      at(date, '13:00', free),
      at(date, '13:30', false),
      at(date, '17:00', false),
    ],
  });
  return {
    addressId: 'addr-1',
    dates: DATES,
    validUntil: '2026-10-13T04:30:30.000Z',
    durations: [
      {
        durationMinutes: 60,
        available: true,
        days: [day(DATES[0]!, true), day(DATES[1]!, false), day(DATES[2]!, true)],
      },
      {
        durationMinutes: 90,
        available: false,
        days: DATES.map((date) => day(date, false)),
      },
    ],
  };
}

describe('Schedule for Later model', () => {
  it('greys a duration with nothing free on any of the three days', () => {
    const model = laterModelFrom({
      catalogue: CATALOGUE,
      overview: overview(),
      durationMinutes: 60,
      dayId: null,
      now: NOW,
    });
    expect(model.durations.map((d) => [d.id, d.label, d.available])).toEqual([
      ['dur-60', '1 hr', true],
      ['dur-90', '1.5 hrs', false],
    ]);
  });

  it('names the days and greys one with nothing free for the chosen duration', () => {
    const model = laterModelFrom({
      catalogue: CATALOGUE,
      overview: overview(),
      durationMinutes: 60,
      dayId: null,
      now: NOW,
    });
    expect(model.days.map((d) => [d.caption, d.dayNumber, d.available])).toEqual([
      ['Today', '13', true],
      ['Tomorrow', '14', false],
      ['Thursday', '15', true],
    ]);
    expect(model.periods).toEqual([]);
  });

  it('names the first day "Tomorrow" when the server has rolled today over (R-SLOT-16)', () => {
    const rolled = overview();
    const model = laterModelFrom({
      catalogue: CATALOGUE,
      overview: {
        ...rolled,
        dates: DATES.slice(1),
        durations: rolled.durations.map((d) => ({ ...d, days: d.days.slice(1) })),
      },
      durationMinutes: 60,
      dayId: null,
      now: NOW,
    });
    expect(model.days.map((d) => d.caption)).toEqual(['Tomorrow', 'Thursday']);
  });

  it('greys a time of day with nothing free, and opens on the first one that has', () => {
    const model = laterModelFrom({
      catalogue: CATALOGUE,
      overview: overview(),
      durationMinutes: 60,
      dayId: DATES[2]!,
      now: NOW,
    });
    expect(model.periods.map((p) => [p.id, p.timeOfDay, p.available])).toEqual([
      ['MORNING', 'morning', false],
      ['NOON', 'afternoon', true],
      ['EVENING', 'evening', false],
    ]);
    expect(firstOpenPeriodId(model.periods)).toBe('NOON');
    // Only the start times that can be booked are shown.
    expect(model.periods[1]?.slots.map((s) => s.label)).toEqual(['1:00 PM']);
  });

  it('hides a time of day that has already passed today', () => {
    const late = new Date('2026-10-13T08:30:00.000Z'); // 14:00 IST
    const model = laterModelFrom({
      catalogue: CATALOGUE,
      overview: overview(),
      durationMinutes: 60,
      dayId: DATES[0]!,
      now: late,
    });
    expect(model.periods.map((p) => p.timeOfDay)).toEqual(['afternoon', 'evening']);
  });

  it('greys nothing before the overview answers, and waits for the chosen day', () => {
    const model = laterModelFrom({
      catalogue: CATALOGUE,
      overview: undefined,
      durationMinutes: 90,
      dayId: '2026-10-14',
      now: NOW,
    });
    expect(model.durations.every((d) => d.available)).toBe(true);
    expect(model.days.map((d) => d.id)).toEqual(DATES);
    expect(model.days.every((d) => d.available)).toBe(true);
    expect(model.slotsPending).toBe(true);
    expect(model.periods.every((p) => p.available)).toBe(true);
  });

  it('reads the chosen day from the single-day answer on a server without the overview', () => {
    const model = laterModelFrom({
      catalogue: CATALOGUE,
      overview: undefined,
      fallbackDay: {
        date: '2026-10-14',
        durationMinutes: 60,
        slots: [at('2026-10-14', '18:00', true)],
        rejection: null,
        validUntil: '2026-10-13T04:30:30.000Z',
      },
      durationMinutes: 60,
      dayId: '2026-10-14',
      now: NOW,
    });
    expect(model.slotsPending).toBe(false);
    expect(model.periods.map((p) => [p.timeOfDay, p.available])).toEqual([
      ['morning', false],
      ['afternoon', false],
      ['evening', true],
    ]);
  });

  it('carries a refusal of the whole address', () => {
    const refused = { ...overview(), rejection: 'NOT_SERVICEABLE' };
    expect(
      laterModelFrom({
        catalogue: CATALOGUE,
        overview: refused,
        durationMinutes: 60,
        dayId: null,
        now: NOW,
      }).rejection,
    ).toBe('NOT_SERVICEABLE');
  });
});

describe('Schedule for Later wording', () => {
  it('writes the carousel lengths and the footer summary as the frames do', () => {
    expect([30, 45, 60, 90, 120].map(laterDurationLabel)).toEqual([
      '30 mins',
      '45 mins',
      '1 hr',
      '1.5 hrs',
      '2 hrs',
    ]);
    expect(laterSummaryWhen('2026-10-15', '1:30 PM')).toBe('Thu, 15 Oct · 1:30 PM');
    expect(minutesOfDurationId('dur-90')).toBe(90);
    expect(minutesOfDurationId('d90')).toBeNull();
  });
});
