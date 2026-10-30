import { fireEvent, render, screen } from '@testing-library/react-native';

import { RecurringInfoProvider } from './components/HelpFab';
import { RecurringScheduleScreen } from './screens/RecurringScheduleScreen';
import { RecurringVisitDaysScreen } from './screens/RecurringVisitDaysScreen';
import type { RecurringVisitChoice } from './types';

/** The screen hands Android's back button to the stack, which needs a navigator; none is mounted. */
jest.mock('expo-router', () => ({
  __esModule: true,
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(effect, [effect]);
  },
}));

/** The start times come from the backend; with no answer yet, every start in the band is offered. */
jest.mock('./api', () => ({
  useRecurringStartTimes: () => ({ state: { status: 'loading' } }),
}));

/**
 * Schedule (`229:1802` → `288:401` → `288:516`, `332:5921` → `332:5718`): the time of the day
 * first, the Duration carousel it opens ABOVE the pills, then the start times; and the visit's days
 * before it (`332:6093`, `332:5869`).
 */
const DAYS = ['2026-09-28', '2026-09-29', '2026-10-01', '2026-10-02'];

function renderSchedule(props: Partial<Parameters<typeof RecurringScheduleScreen>[0]> = {}) {
  const onSave = jest.fn();
  const onInfo = jest.fn();
  render(
    <RecurringInfoProvider onOpen={onInfo}>
      <RecurringScheduleScreen
        planNumber={1}
        visitNumber={1}
        dayIds={DAYS}
        ctaLabel="Save & Schedule Plan 2"
        onBack={jest.fn()}
        onSave={onSave}
        {...props}
      />
    </RecurringInfoProvider>,
  );
  return { onSave, onInfo };
}

const save = () => screen.getByTestId('recurring-schedule-screen-save');
const saveDisabled = () => save().props.accessibilityState?.disabled === true;
const radio = (name: string | RegExp) => screen.getByRole('radio', { name });
const tab = (name: string) => screen.getByRole('tab', { name });
const disabled = (name: string) => radio(name).props.accessibilityState?.disabled === true;

describe('Schedule', () => {
  it('opens on the duration alone, under "Pick duration & time", with the CTA waiting', () => {
    renderSchedule();

    expect(screen.getByText('Pick duration & time')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Morning' })).toBeNull();
    expect(screen.queryByRole('radio', { name: '9:00 AM' })).toBeNull();
    expect(screen.getByText('Save & Schedule Plan 2')).toBeTruthy();
    expect(saveDisabled()).toBe(true);
  });

  it('opens the times once a duration is chosen, on the first time of day with a start free', () => {
    renderSchedule();

    fireEvent.press(radio(/^1 hour/));

    expect(tab('Morning').props.accessibilityState?.selected).toBe(true);
    expect(radio('9:00 AM')).toBeTruthy();
    expect(saveDisabled()).toBe(true);
  });

  it('marks only the chosen duration card with the tick', () => {
    renderSchedule();
    const checked = () =>
      screen.queryAllByRole('radio').filter((r) => r.props.accessibilityState?.checked === true);
    expect(checked()).toHaveLength(0);

    fireEvent.press(radio(/^1 hour/));

    // The shared (Home) tile draws its lime liquid and tick from `checked`.
    expect(checked()).toHaveLength(1);
  });

  it('saves the chosen visit once a start time is picked', () => {
    const { onSave } = renderSchedule();

    fireEvent.press(radio(/^1 hour/));
    fireEvent.press(radio('9:00 AM'));

    expect(saveDisabled()).toBe(false);
    fireEvent.press(save());
    expect(onSave).toHaveBeenCalledWith({
      timeOfDay: 'morning',
      durationId: 'd60',
      startMinutes: 9 * 60,
    });
  });

  it('keeps the duration across a new time of the day, and clears the start time', () => {
    renderSchedule();

    fireEvent.press(radio(/^1 hour/));
    fireEvent.press(radio('9:00 AM'));
    fireEvent.press(tab('Afternoon'));

    expect(saveDisabled()).toBe(true);
    expect(radio('12:00 PM').props.accessibilityState?.selected).toBe(false);
    expect(radio(/^1 hour/).props.accessibilityState?.checked).toBe(true);
  });

  it('keeps the start time when a longer duration still fits', () => {
    renderSchedule({ initial: { durationId: 'd60', timeOfDay: 'morning', startMinutes: 9 * 60 } });

    expect(saveDisabled()).toBe(false);
    fireEvent.press(radio(/^1.5 hours/));

    expect(saveDisabled()).toBe(false);
  });

  it('opens at the step a part-made choice has reached', () => {
    renderSchedule({ initial: { durationId: 'd60', timeOfDay: 'evening' } });

    expect(tab('Evening').props.accessibilityState?.selected).toBe(true);
    expect(saveDisabled()).toBe(true);
  });

  it('draws the help button, which opens the Recurring landing', () => {
    const { onInfo } = renderSchedule();

    fireEvent.press(screen.getByRole('button', { name: 'About Recurring' }));

    expect(onInfo).toHaveBeenCalledTimes(1);
  });

  describe('adding a further visit', () => {
    const FIRST: RecurringVisitChoice = {
      timeOfDay: 'morning',
      durationId: 'd60',
      startMinutes: 9 * 60,
    };
    const adding = {
      visitNumber: 2,
      dayIds: DAYS.slice(0, 3),
      ctaLabel: 'Add this visit',
      addingVisit: {
        planDayIds: DAYS,
        visitsBefore: [FIRST],
        otherVisits: [FIRST],
      },
    };

    it('heads the screen with the plan and its visits, under "Pick duration & time"', () => {
      renderSchedule(adding);

      expect(screen.getByText('Pick duration & time')).toBeTruthy();
      expect(screen.getByText('1st Visit')).toBeTruthy();
      expect(screen.getByText('1 hr · 9:00 AM')).toBeTruthy();
      expect(screen.getByText('2nd Visit')).toBeTruthy();
      expect(screen.getByText('Scheduling')).toBeTruthy();
      expect(screen.getByText('Add this visit')).toBeTruthy();
    });

    it('hides what the first visit takes: 9 AM for an hour leaves no start from 8:15 to 9:45', () => {
      renderSchedule(adding);
      fireEvent.press(radio(/^1 hour/));
      fireEvent.press(tab('Morning'));

      for (const taken of [
        '8:15 AM',
        '8:30 AM',
        '8:45 AM',
        '9:00 AM',
        '9:15 AM',
        '9:30 AM',
        '9:45 AM',
      ]) {
        expect(screen.queryByRole('radio', { name: taken })).toBeNull();
      }
      expect(disabled('8:00 AM')).toBe(false);
      expect(disabled('10:00 AM')).toBe(false);
    });
  });
});

describe('Visit days', () => {
  function renderDays(initialDayIds?: readonly string[]) {
    const onContinue = jest.fn();
    const onInfo = jest.fn();
    render(
      <RecurringInfoProvider onOpen={onInfo}>
        <RecurringVisitDaysScreen
          planNumber={1}
          planDayIds={['2026-10-02', '2026-10-07', '2026-10-17', '2026-10-18']}
          bookedVisits={['1 hr · 9:00 AM']}
          initialDayIds={initialDayIds}
          onBack={jest.fn()}
          onContinue={onContinue}
        />
      </RecurringInfoProvider>,
    );
    return { onContinue, onInfo };
  }

  const cta = () => screen.getByTestId('recurring-visit-days-screen-continue');

  it('asks which of the plan’s days the next visit runs on, with Continue waiting', () => {
    renderDays();

    expect(screen.getByText('Plan 1: Selected days')).toBeTruthy();
    expect(screen.getByText('Select days on which 2nd visit is needed')).toBeTruthy();
    expect(screen.getByText('Scheduling')).toBeTruthy();
    expect(cta().props.accessibilityState?.disabled).toBe(true);
  });

  it('unlocks Continue once a day is picked, and hands over the picked days in order', () => {
    const { onContinue } = renderDays(['2026-10-17', '2026-10-02']);

    expect(cta().props.accessibilityState?.disabled).not.toBe(true);
    fireEvent.press(cta());

    expect(onContinue).toHaveBeenCalledWith(['2026-10-02', '2026-10-17']);
  });

  it('draws the help button', () => {
    const { onInfo } = renderDays();

    fireEvent.press(screen.getByRole('button', { name: 'About Recurring' }));

    expect(onInfo).toHaveBeenCalledTimes(1);
  });
});
