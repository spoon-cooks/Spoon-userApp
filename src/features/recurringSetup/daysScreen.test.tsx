import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { RecurringDaysScreen } from './screens/RecurringDaysScreen';

/** The screen hands Android's back button to the stack, which needs a navigator; none is mounted. */
jest.mock('expo-router', () => ({
  __esModule: true,
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(effect, [effect]);
  },
}));

/**
 * Step 1 "Pick your days" (`340:6661`, `334:6406`, `340:6550`): the window, the tiles and "+", the
 * CTA's two states, held days and the 14-day cap. The window is pinned to the frames' date, so it
 * runs Sep 28 – Oct 18.
 */
const TODAY = new Date(2026, 8, 25);

function renderDays(props: Partial<Parameters<typeof RecurringDaysScreen>[0]> = {}) {
  const onContinue = jest.fn();
  render(
    <RecurringDaysScreen onBack={jest.fn()} onContinue={onContinue} today={TODAY} {...props} />,
  );
  return { onContinue };
}

/** A day is toggled the way a screen reader does; touch goes through the grid's pan gesture. */
function toggle(id: string) {
  fireEvent(screen.getByTestId(`recurring-day-${id}`), 'accessibilityAction', {
    nativeEvent: { actionName: 'activate' },
  });
}

const day = (id: string) => screen.getByTestId(`recurring-day-${id}`);

describe('RecurringDaysScreen', () => {
  it('shows the 21 bookable dates with the legend, and an empty Plan 1', () => {
    renderDays();
    expect(screen.getAllByTestId(/^recurring-day-/)).toHaveLength(21);
    expect(screen.getByTestId('recurring-days-screen-plans-plan-1')).toBeTruthy();
    expect(screen.getByText('0 days')).toBeTruthy();
    expect(screen.getByText('Selected', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Start/ End date', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Pick 5 more days')).toBeTruthy();
  });

  it('counts picked days on the tile and in the CTA until five are chosen', () => {
    const { onContinue } = renderDays();
    ['2026-09-28', '2026-09-29', '2026-10-14', '2026-10-15'].forEach((id) => act(() => toggle(id)));
    expect(screen.getByText('4 days')).toBeTruthy();
    expect(screen.getByText('Pick 1 more day')).toBeTruthy();
    expect(
      screen.getByTestId('recurring-days-screen-continue').props.accessibilityState,
    ).toMatchObject({
      disabled: true,
    });

    act(() => toggle('2026-10-02'));
    expect(screen.getByText('Schedule Plan 1')).toBeTruthy();
    fireEvent.press(screen.getByTestId('recurring-days-screen-continue'));
    expect(onContinue).toHaveBeenCalledWith([
      {
        id: 'plan-1',
        label: 'Plan 1',
        dayIds: ['2026-09-28', '2026-09-29', '2026-10-02', '2026-10-14', '2026-10-15'],
      },
    ]);
  });

  it('puts the earliest and latest day on the brand fill and the days between on the tint', () => {
    renderDays();
    ['2026-10-01', '2026-10-02', '2026-10-03'].forEach((id) => act(() => toggle(id)));
    const fill = (id: string) => day(id).children[0] as unknown as { props: { style: unknown } };
    expect(JSON.stringify(fill('2026-10-01').props.style)).toContain('#FFD600');
    expect(JSON.stringify(fill('2026-10-02').props.style)).toContain('#FFE666');
    expect(JSON.stringify(fill('2026-10-03').props.style)).toContain('#FFD600');
  });

  it('keeps the "+" dimmed until the plan has a day, then starts a blank Plan 2', () => {
    renderDays();
    const add = () => screen.getByTestId('recurring-days-screen-plans-add');
    expect(add().props.accessibilityState).toMatchObject({ disabled: true });

    act(() => toggle('2026-10-02'));
    expect(add().props.accessibilityState).toMatchObject({ disabled: false });
    fireEvent.press(add());
    expect(screen.getByTestId('recurring-days-screen-plans-plan-2')).toBeTruthy();
    expect(
      screen.getByTestId('recurring-days-screen-plans-plan-2').props.accessibilityState,
    ).toMatchObject({
      selected: true,
    });
    // Plan 1's day is held: it cannot be picked on Plan 2's calendar.
    expect(day('2026-10-02').props.accessibilityState).toMatchObject({ disabled: true });
    act(() => toggle('2026-10-02'));
    expect(screen.getAllByText('0 days')).toHaveLength(1);
  });

  it("opens on a plan made earlier, with the other plan's days held", () => {
    renderDays({
      initialPlans: [
        { id: 'plan-1', dayIds: ['2026-09-28', '2026-09-29', '2026-10-14', '2026-10-15'] },
        { id: 'plan-2', dayIds: ['2026-10-02', '2026-10-07', '2026-10-17', '2026-10-18'] },
      ],
      initialActiveId: 'plan-2',
    });
    expect(day('2026-09-28').props.accessibilityState).toMatchObject({ disabled: true });
    expect(day('2026-10-14').props.accessibilityState).toMatchObject({ disabled: true });
    expect(day('2026-10-02').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText('Schedule Plan 1')).toBeTruthy();
    // Back on plan 1, plan 2's days are the held ones.
    fireEvent.press(screen.getByTestId('recurring-days-screen-plans-plan-1'));
    expect(day('2026-10-02').props.accessibilityState).toMatchObject({ disabled: true });
    expect(day('2026-09-28').props.accessibilityState).toMatchObject({ selected: true });
  });

  it('refuses a 15th day and says so, until a day is deselected', () => {
    const days = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(2026, 8, 28 + index);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    });
    renderDays({ initialPlans: [{ id: 'plan-1', dayIds: days }] });
    expect(screen.queryByTestId('recurring-days-screen-cap-error')).toBeNull();

    act(() => toggle('2026-10-12'));
    expect(screen.getByText('Max 14 days reached, deselect a day to pick another')).toBeTruthy();
    expect(day('2026-10-12').props.accessibilityState).toMatchObject({ selected: false });

    act(() => toggle('2026-10-11'));
    expect(screen.queryByTestId('recurring-days-screen-cap-error')).toBeNull();
  });

  it('can open with the cap error already showing', () => {
    renderDays({ initialCapError: true });
    expect(screen.getByTestId('recurring-days-screen-cap-error')).toBeTruthy();
  });
});
