import type { RecurringBookingDto, VisitSummaryDto } from '@features/recurringSetup';

import { clockText, durationText, liveCalendarFrom, todayInKolkata } from './adapters';

/**
 * The Live booking tab on a real booking. Today is Thu 8 Oct 2026 (Asia/Kolkata); the booking runs
 * 28 Sept → 18 Oct, so the calendar spans Sept and Oct as `1286:6575` draws them.
 */

const TODAY = '2026-10-08';

function visit(
  overrides: Partial<VisitSummaryDto> & Pick<VisitSummaryDto, 'date'>,
): VisitSummaryDto {
  return {
    visitId: `v-${overrides.date}-${overrides.visitNumber ?? 1}`,
    planNumber: 1,
    visitNumber: 1,
    timeOfDay: 'evening',
    startTime: '19:00',
    start: `${overrides.date}T13:30:00.000Z`,
    durationMinutes: 60,
    status: 'scheduled',
    displayState: 'cook_pending',
    cookConfirmBy: `${overrides.date}T10:30:00.000Z`,
    cook: null,
    bookingId: null,
    totalPaise: 13545,
    cancelledBy: null,
    ...overrides,
  };
}

const MEERA = {
  cookId: 'cook-1',
  displayName: 'Cook Meera',
  profileImageUrl: null,
  rating: { average: 4.5, count: 12 },
};

function booking(overrides: Partial<RecurringBookingDto> = {}): RecurringBookingDto {
  const past = [
    visit({ date: '2026-09-28', status: 'completed', displayState: 'completed', cook: MEERA }),
    visit({
      date: '2026-09-28',
      visitNumber: 2,
      startTime: '08:00',
      start: '2026-09-28T02:30:00.000Z',
      status: 'cancelled',
      displayState: 'cancelled',
      cancelledBy: 'customer',
    }),
  ];
  const today = [
    visit({ date: TODAY, status: 'charged', displayState: 'cook_assigned', cook: MEERA }),
  ];
  const upcoming = [visit({ date: '2026-10-14', durationMinutes: 150, startTime: '20:00' })];
  return {
    recurringBookingId: 'rb-1',
    status: 'active',
    addressId: 'addr-1',
    window: { startDate: '2026-09-28', endDate: '2026-10-18' },
    policyVersion: 'recurring-v2-spec-1',
    mandate: null,
    banner: null,
    counts: { done: 1, cancelled: 1, toGo: 2 },
    plans: [],
    days: [
      { date: '2026-09-28', group: 'past', visits: past },
      { date: TODAY, group: 'today', visits: today },
      { date: '2026-10-14', group: 'upcoming', visits: upcoming },
    ],
    upNext: today[0] ?? null,
    chargeRange: { minPaise: 13545, maxPaise: 13545 },
    support: { whatsappUrl: null },
    createdAt: '2026-09-20T06:00:00.000Z',
    cancelledAt: null,
    cancelledBy: null,
    ...overrides,
  } as RecurringBookingDto;
}

describe('liveCalendarFrom', () => {
  it('lays out Mon → Sun rows from the first visit’s week to the last’s, never mixing months', () => {
    const { weeks } = liveCalendarFrom(booking(), TODAY);

    // Visits on 28 Sept, today (8 Oct) and 14 Oct: Sept's last week, then Oct to 14's week.
    expect(weeks[0]?.monthLabel).toBe('Sept');
    expect(weeks).toHaveLength(4);

    // 28 Sept 2026 is a Monday: Sept's last row is 28, 29, 30 then blanks; Oct opens on a Thursday.
    const sept = weeks.filter((week) => week.monthLabel === 'Sept');
    expect(sept.at(-1)?.days.map((day) => day?.day ?? null)).toEqual([
      28,
      29,
      30,
      null,
      null,
      null,
      null,
    ]);
    const oct = weeks.filter((week) => week.monthLabel === 'Oct');
    expect(oct[0]?.days.map((day) => day?.day ?? null)).toEqual([null, null, null, 1, 2, 3, 4]);
    expect(oct.at(-1)?.days.map((day) => day?.day ?? null)).toEqual([12, 13, 14, 15, 16, 17, 18]);
    expect(weeks.every((week) => week.days.length === 7)).toBe(true);
  });

  it("keeps a mid-week window's first and last rows whole, and draws no months beyond it", () => {
    const { weeks } = liveCalendarFrom(
      booking({ window: { startDate: '2026-10-24', endDate: '2026-11-13' }, days: [] }),
      '2026-10-21',
    );
    const numbers = (week: (typeof weeks)[number] | undefined) =>
      week?.days.map((day) => day?.day ?? null);
    // 24 Oct 2026 is a Saturday and 13 Nov a Friday: their weeks are drawn whole, nothing more.
    expect(weeks.map((week) => week.monthLabel)).toEqual(['Oct', 'Oct', 'Nov', 'Nov', 'Nov']);
    expect(numbers(weeks[0])).toEqual([19, 20, 21, 22, 23, 24, 25]);
    expect(numbers(weeks.at(-1))).toEqual([9, 10, 11, 12, 13, 14, 15]);
  });

  it("marks dates by the backend's own grouping, and leaves dates without visits unmarked", () => {
    const days = liveCalendarFrom(booking(), TODAY).weeks.flatMap((week) => week.days);
    const kindOf = (id: string) => days.find((day) => day?.id === id)?.kind;

    expect(kindOf('2026-09-28')).toBe('past');
    expect(kindOf(TODAY)).toBe('today');
    expect(kindOf('2026-10-14')).toBe('upcoming');
    expect(kindOf('2026-10-09')).toBe('none');
  });

  it('lists a date’s visits in start order, worded per state', () => {
    const model = liveCalendarFrom(booking(), TODAY);

    expect(model.visitsByDay['2026-09-28']).toEqual({
      planLabel: 'Plan 1 · 2 visits',
      visits: [
        expect.objectContaining({
          status: 'cancelled',
          title: '2nd Visit · 8:00 AM · 1 hr',
          meta: 'Cancelled by you',
        }),
        expect.objectContaining({
          status: 'completed',
          title: '1st Visit · 7:00 PM · 1 hr',
          meta: 'Completed · Cook Meera',
        }),
      ],
    });
    expect(model.visitsByDay[TODAY]?.visits[0]).toMatchObject({
      status: 'assigned',
      meta: 'Upcoming · Cook Meera',
    });
    expect(model.visitsByDay[TODAY]?.visits[0]?.pool).toBeUndefined();
  });

  it('shows the confirm-by card for a visit with no cook yet, and invents no faces', () => {
    const pending = liveCalendarFrom(booking(), TODAY).visitsByDay['2026-10-14']?.visits[0];

    expect(pending).toMatchObject({
      status: 'unassigned',
      title: '1st Visit · 8:00 PM · 2.5 hrs',
      meta: 'Upcoming · Cook pending',
      // 10:30 UTC is 4 PM in Kolkata.
      pool: { title: 'Cook confirmed by 4 PM', subtitle: 'Familiar cooks from your Pool' },
    });
    expect(pending?.pool?.photos).toBeUndefined();
  });

  it('builds Up next and the progress thread from the booking', () => {
    const model = liveCalendarFrom(booking(), TODAY);

    expect(model.upNext).toEqual({
      label: 'UP NEXT · TODAY',
      title: '1st Visit, 7:00 PM',
      meta: '1 hr • Cook Meera',
    });
    // No `profileImageUrl` for this cook: the banner draws no face rather than a stock one.
    expect(model.upNext?.photo).toBeUndefined();
    expect(model.progressLabel).toBe('1 done · 1 cancelled · 2 to go');
    expect(model.progressFraction).toBe(0.25);
  });

  it('names a later Up next by its date, and draws none when nothing is left', () => {
    const later = visit({ date: '2026-10-14' });
    expect(liveCalendarFrom(booking({ upNext: later }), TODAY).upNext?.label).toBe(
      'UP NEXT · WED, 14 OCT',
    );
    expect(
      liveCalendarFrom(booking({ upNext: visit({ date: '2026-10-09' }) }), TODAY).upNext?.label,
    ).toBe('UP NEXT · TOMORROW');
    expect(liveCalendarFrom(booking({ upNext: null }), TODAY).upNext).toBeNull();
    const pictured = visit({
      date: TODAY,
      cook: { ...MEERA, profileImageUrl: 'https://img/meera.jpg' },
    });
    expect(liveCalendarFrom(booking({ upNext: pictured }), TODAY).upNext?.photo).toEqual({
      uri: 'https://img/meera.jpg',
    });
  });

  it('draws an empty thread rather than dividing by zero', () => {
    const model = liveCalendarFrom(booking({ counts: { done: 0, cancelled: 0, toGo: 0 } }), TODAY);
    expect(model.progressFraction).toBe(0);
  });
});

describe('labels', () => {
  it('writes durations and clock times the Live booking way', () => {
    expect([30, 45, 60, 90, 120, 150].map(durationText)).toEqual([
      '30 mins',
      '45 mins',
      '1 hr',
      '1.5 hrs',
      '2 hrs',
      '2.5 hrs',
    ]);
    expect(['00:30', '09:05', '12:00', '19:00'].map(clockText)).toEqual([
      '12:30 AM',
      '9:05 AM',
      '12:00 PM',
      '7:00 PM',
    ]);
  });

  it("takes today's date in Asia/Kolkata, not UTC", () => {
    // 20:00 UTC on 7 Oct is 01:30 on 8 Oct in Kolkata.
    expect(todayInKolkata(new Date('2026-10-07T20:00:00.000Z'))).toBe('2026-10-08');
  });
});

describe('a day still to come with every visit cancelled', () => {
  it('is drawn as a plain date, not an Upcoming ring, and opens nothing', () => {
    const cancelled = visit({
      date: '2026-10-14',
      status: 'cancelled',
      displayState: 'cancelled',
      cancelledBy: 'customer',
    });
    const model = liveCalendarFrom(
      booking({
        days: [
          { date: TODAY, group: 'today', visits: [visit({ date: TODAY, status: 'charged' })] },
          { date: '2026-10-14', group: 'upcoming', visits: [cancelled] },
        ],
      }),
      TODAY,
    );
    const day14 = model.weeks.flatMap((week) => week.days).find((day) => day?.id === '2026-10-14');
    // Its week drops out with it: the calendar ends at the last date still marked.
    expect(day14 === undefined || day14?.kind === 'none').toBe(true);
    expect(model.visitsByDay['2026-10-14']).toBeUndefined();
  });
});
