import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import {
  DEFAULT_API_STUBS,
  createStubApi,
  createTestRuntime,
  renderWithRuntime,
} from '@/test/renderWithRuntime';
import ScheduledRoute from '@/app/(app)/scheduled';

/**
 * Schedule for Later (Figma `2466:18844` / `2466:18864` / `2466:19025`, DEC-094) on Home's
 * "Book for later": everything comes from the three-day overview, so a duration, a day, a time of
 * day or a start time with nothing free is greyed before it is tapped, and each day the customer
 * opens is logged as one search.
 */
jest.mock('react-native-worklets', () =>
  jest.requireActual('react-native-worklets/lib/module/mock'),
);
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    dismissTo: jest.fn(),
  }),
  useLocalSearchParams: () => ({ durationId: 'dur-60' }),
  useFocusEffect: () => undefined,
}));

// Days far from the real clock, so no time of day is "already passed".
const DATES = ['2030-01-01', '2030-01-02', '2030-01-03'];
const at = (date: string, time: string, available: boolean) => ({
  start: new Date(`${date}T${time}:00+05:30`).toISOString(),
  available,
  reason: available ? 'AVAILABLE' : 'NO_PRESENT_COOK',
});

const OVERVIEW = {
  addressId: 'addr-1',
  dates: DATES,
  validUntil: '2030-01-01T00:00:30.000Z',
  durations: [
    {
      durationMinutes: 30,
      available: false,
      days: DATES.map((date) => ({ date, available: false, slots: [at(date, '13:00', false)] })),
    },
    {
      durationMinutes: 60,
      available: true,
      days: [
        { date: DATES[0], available: true, slots: [at(DATES[0]!, '18:00', true)] },
        { date: DATES[1], available: false, slots: [at(DATES[1]!, '13:00', false)] },
        {
          date: DATES[2],
          available: true,
          slots: [
            at(DATES[2]!, '09:00', false),
            at(DATES[2]!, '13:00', true),
            at(DATES[2]!, '13:30', false),
          ],
        },
      ],
    },
  ],
};

function render() {
  const searches: unknown[] = [];
  renderWithRuntime(<ScheduledRoute />, {
    runtime: createTestRuntime({
      api: createStubApi({
        ...DEFAULT_API_STUBS,
        'GET /v1/availability/scheduled/overview': () => OVERVIEW,
        'POST /v1/availability/scheduled/searches': (body) => {
          searches.push(body);
          return undefined;
        },
      }),
    }),
  });
  return { searches };
}

const day = (date: string) => screen.getByTestId(`schedule-later-day-${date}`);

describe('Schedule for Later', () => {
  it('opens on the chosen duration with the three days and no day picked', async () => {
    render();
    expect(await screen.findByText('Schedule for Later')).toBeTruthy();
    // The overview's own days (before it lands, the next three days by the device clock show).
    await waitFor(() => expect(day(DATES[2]!)).toBeTruthy());
    // Days are named by date (R-SLOT-16); these are far from the clock, so none is Today/Tomorrow.
    expect(screen.queryByText('Today')).toBeNull();
    expect(screen.queryByText('Tomorrow')).toBeNull();
    expect(screen.getByText('Tuesday')).toBeTruthy();
    expect(screen.getByText('Wednesday')).toBeTruthy();
    expect(screen.getByText('Thursday')).toBeTruthy();
    expect(screen.queryByTestId('schedule-later-period-afternoon')).toBeNull();
    expect(screen.getByTestId('schedule-later-confirm').props.accessibilityState?.disabled).toBe(
      true,
    );
  });

  it('greys a day with nothing free and does not open it', async () => {
    render();
    await waitFor(() =>
      expect(day(DATES[1]!).props.accessibilityState).toMatchObject({ disabled: true }),
    );
    fireEvent.press(day(DATES[1]!));
    expect(screen.queryByTestId('schedule-later-period-afternoon')).toBeNull();
  });

  it('opens a day on its first time of day with something free, greying the rest', async () => {
    const { searches } = render();
    await waitFor(() => expect(day(DATES[2]!).props.accessibilityState?.disabled).toBe(false));
    fireEvent.press(day(DATES[2]!));

    const afternoon = await screen.findByTestId('schedule-later-period-afternoon');
    expect(afternoon.props.accessibilityState).toMatchObject({ selected: true, disabled: false });
    expect(
      screen.getByTestId('schedule-later-period-morning').props.accessibilityState?.disabled,
    ).toBe(true);
    expect(
      screen.getByTestId('schedule-later-period-evening').props.accessibilityState?.disabled,
    ).toBe(true);
    // The day the customer opened is one search.
    await waitFor(() =>
      expect(searches).toEqual([{ addressId: 'addr-1', date: DATES[2], durationMinutes: 60 }]),
    );
  });

  it('shows only the free start times, and states the pick in the footer', async () => {
    render();
    await waitFor(() => expect(day(DATES[2]!).props.accessibilityState?.disabled).toBe(false));
    fireEvent.press(day(DATES[2]!));
    fireEvent.press(await screen.findByLabelText('1:00 PM'));
    expect(screen.queryByLabelText('1:30 PM')).toBeNull();

    expect(await screen.findByTestId('schedule-later-summary')).toBeTruthy();
    expect(screen.getByText('Thu, 3 Jan · 1:00 PM')).toBeTruthy();
    expect(screen.getByText('1 hr session')).toBeTruthy();
  });
});
