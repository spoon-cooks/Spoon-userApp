import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BackHandler } from 'react-native';

import type { RecurringPlanDraft } from '../types';
import { RecurringPlanFlow } from './RecurringPlanFlow';

/** The screens hand Android's back button to the stack, which needs a navigator; none is mounted. */
jest.mock('expo-router', () => ({
  __esModule: true,
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(effect, [effect]);
  },
}));

/**
 * Back through the Recurring flow (device test, 30 Oct 2026): every back — the arrow or Android's
 * — returns to the step it came from, and never strands the customer on a blank plan.
 */
const TODAY = new Date(2026, 8, 25);
const PLAN_1: RecurringPlanDraft = {
  id: 'plan-1',
  dayIds: ['2026-09-28', '2026-09-30', '2026-10-05', '2026-10-07', '2026-10-09'],
  visits: [{ timeOfDay: 'morning', durationId: 'd60', startMinutes: 9 * 60 }],
};

function renderFlow() {
  const onExit = jest.fn();
  render(
    <RecurringPlanFlow
      onExit={onExit}
      today={TODAY}
      seed={{ plans: [PLAN_1], stage: { kind: 'summary', planIndex: 0, visitIndex: 0 } }}
    />,
  );
  return { onExit };
}

const SUMMARY = 'recurring-summary-screen';
const DAYS = 'recurring-days-screen';
const pressBack = (screenId: string) =>
  fireEvent.press(screen.getByTestId(`${screenId}-header-back`));
/** The back listeners registered right now; Android calls the newest first. */
type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
let backListeners: BackListener[] = [];
beforeEach(() => {
  backListeners = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, listener) => {
    backListeners.push(listener);
    return {
      remove: () => {
        backListeners = backListeners.filter((entry) => entry !== listener);
      },
    };
  });
});
afterEach(() => jest.restoreAllMocks());

const androidBack = () => {
  for (const listener of [...backListeners].reverse()) {
    const result: { handled: boolean | null | undefined } = { handled: false };
    act(() => {
      result.handled = listener({} as Parameters<BackListener>[0]);
    });
    if (result.handled === true) return;
  }
};

describe('RecurringPlanFlow back navigation', () => {
  it('returns from "+" plan to the Summary, without the blank plan "+" added', () => {
    const { onExit } = renderFlow();

    fireEvent.press(screen.getByTestId(`${SUMMARY}-switcher-add-plan`));
    expect(screen.getByTestId(DAYS)).toBeTruthy();
    // The calendar opened on a new, empty Plan 2.
    expect(screen.getByTestId(`${DAYS}-plans-plan-2`)).toBeTruthy();

    pressBack(DAYS);

    expect(screen.getByTestId(SUMMARY)).toBeTruthy();
    expect(screen.queryByTestId(`${SUMMARY}-switcher-plan-2`)).toBeNull();
    expect(onExit).not.toHaveBeenCalled();
  });

  it('does the same on Android back', () => {
    renderFlow();
    fireEvent.press(screen.getByTestId(`${SUMMARY}-switcher-add-plan`));
    expect(screen.getByTestId(DAYS)).toBeTruthy();

    androidBack();

    expect(screen.getByTestId(SUMMARY)).toBeTruthy();
    expect(screen.queryByTestId(`${SUMMARY}-switcher-plan-2`)).toBeNull();
  });

  it('leaves the flow from the calendar reached by going back, rather than bouncing forward', () => {
    const { onExit } = renderFlow();

    // The Summary has no back arrow (`1079:3207`): Android back takes it to the calendar…
    androidBack();
    expect(screen.getByTestId(DAYS)).toBeTruthy();
    // …and back from there is back out of the flow, not forward to the Summary again.
    pressBack(DAYS);

    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
