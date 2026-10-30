import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { DeleteDateDialog } from './components/DeleteDateDialog';
import { RecurringDialog } from './components/RecurringDialog';
import { COOK_VISIT_ICON } from './art';
import {
  canSave,
  completeDraft,
  draftOf,
  withDuration,
  withStartTime,
  withTimeOfDay,
} from './editDateDraft';
import { RecurringEditDateScreen } from './screens/RecurringEditDateScreen';
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
 * Edit date (`494:676`, `586:4315`): the header's three chips pick which part of the date's booking
 * is edited, "Save changes" waits for a complete booking that differs from the date's own, and the
 * bin asks first ("Caution! Delete this date?").
 */
const VISIT: RecurringVisitChoice = {
  timeOfDay: 'morning',
  durationId: 'd60',
  startMinutes: 8 * 60 + 30,
};

function renderEdit(props: Partial<Parameters<typeof RecurringEditDateScreen>[0]> = {}) {
  const onSave = jest.fn();
  const onDelete = jest.fn();
  const onBack = jest.fn();
  render(
    <RecurringEditDateScreen
      planNumber={1}
      dayId="2026-10-07"
      visit={VISIT}
      busy={[]}
      onBack={onBack}
      onSave={onSave}
      onDelete={onDelete}
      {...props}
    />,
  );
  return { onSave, onDelete, onBack };
}

const id = (suffix: string) => screen.getByTestId(`recurring-edit-date-screen-${suffix}`);
const saveState = () => id('save').props.accessibilityState;

describe('edit date draft', () => {
  it("starts as the date's own booking, which is not worth saving", () => {
    expect(draftOf(VISIT)).toEqual(VISIT);
    expect(canSave(draftOf(VISIT), VISIT)).toBe(false);
  });

  it('a new duration keeps the start while it clears the other visits, and drops it when not', () => {
    const kept = withDuration(draftOf(VISIT), 'd90', []);
    expect(kept).toMatchObject({ durationId: 'd90', startMinutes: 8 * 60 + 30 });
    expect(canSave(kept, VISIT)).toBe(true);
    // Another visit from 9:30 leaves 8:30 room for 60 minutes, but not for 90.
    const busy = [{ fromMinutes: 9 * 60 + 30, toMinutes: 10 * 60 + 30 }];
    expect(withDuration(draftOf(VISIT), 'd90', busy).startMinutes).toBeNull();
  });

  it('a new time of the day clears the start, so there is nothing to save until one is picked', () => {
    const moved = withTimeOfDay(draftOf(VISIT), 'afternoon', []);
    expect(moved).toEqual({ timeOfDay: 'afternoon', durationId: 'd60', startMinutes: null });
    expect(completeDraft(moved)).toBeNull();
    expect(canSave(moved, VISIT)).toBe(false);
    const picked = withStartTime(moved, 12 * 60);
    expect(completeDraft(picked)).toEqual({
      timeOfDay: 'afternoon',
      durationId: 'd60',
      startMinutes: 12 * 60,
    });
    expect(canSave(picked, VISIT)).toBe(true);
  });

  it('putting everything back as it was is not a change', () => {
    const away = withDuration(draftOf(VISIT), 'd90', []);
    expect(canSave(withDuration(away, 'd60', []), VISIT)).toBe(false);
  });
});

describe('RecurringEditDateScreen', () => {
  it('opens on the duration, as Figma draws it, over a header of the original details', () => {
    renderEdit();
    expect(screen.getByText('Edit duration')).toBeTruthy();
    expect(screen.getByText('Plan 1')).toBeTruthy();
    expect(screen.getByText('Wed, 7 Oct')).toBeTruthy();
    expect(screen.getByText('Morning')).toBeTruthy();
    expect(screen.getByText('8:30 AM')).toBeTruthy();
    expect(id('details-duration').props.accessibilityState).toMatchObject({ selected: true });
    expect(id('details-time-of-day').props.accessibilityState).toMatchObject({ selected: false });
    expect(saveState()).toMatchObject({ disabled: true });
  });

  it('each chip opens its own editor and title, and the header keeps the original details', () => {
    renderEdit();
    fireEvent.press(id('details-time-of-day'));
    expect(screen.getByText('Edit time of the day')).toBeTruthy();
    expect(screen.getByTestId('recurring-edit-date-time-afternoon')).toBeTruthy();
    fireEvent.press(id('details-start-time'));
    expect(screen.getByText('Edit start time')).toBeTruthy();
    expect(screen.getByTestId('recurring-edit-date-start-8:30 AM')).toBeTruthy();
    // The morning's slots only.
    expect(screen.queryByTestId('recurring-edit-date-start-12:00 PM')).toBeNull();
    expect(id('details-duration')).toHaveTextContent('1 hr');
  });

  it("saves a new duration once the carousel moves off the date's own", () => {
    const { onSave } = renderEdit({ initialDraft: { durationId: 'd90' } });
    expect(saveState()).toMatchObject({ disabled: false });
    fireEvent.press(id('save'));
    expect(onSave).toHaveBeenCalledWith({
      timeOfDay: 'morning',
      durationId: 'd90',
      startMinutes: 8 * 60 + 30,
    });
  });

  it('moving to the afternoon needs a start time before it can be saved', () => {
    const { onSave } = renderEdit({ initialField: 'timeOfDay' });
    fireEvent.press(screen.getByTestId('recurring-edit-date-time-afternoon'));
    expect(saveState()).toMatchObject({ disabled: true });
    fireEvent.press(id('details-start-time'));
    fireEvent.press(screen.getByTestId('recurring-edit-date-start-1:00 PM'));
    expect(saveState()).toMatchObject({ disabled: false });
    fireEvent.press(id('save'));
    expect(onSave).toHaveBeenCalledWith({
      timeOfDay: 'afternoon',
      durationId: 'd60',
      startMinutes: 13 * 60,
    });
  });

  it('the bin asks before deleting, and Keep date backs out', () => {
    const { onDelete } = renderEdit();
    expect(screen.queryByText('Caution! Delete this date?')).toBeNull();
    fireEvent.press(id('delete'));
    expect(screen.getByText('Caution! Delete this date?')).toBeTruthy();
    expect(screen.getByText('Deleted dates can’t be restored')).toBeTruthy();
    fireEvent.press(screen.getByText('Keep date'));
    expect(screen.queryByText('Caution! Delete this date?')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('Delete date confirms', () => {
    const { onDelete } = renderEdit({ initialConfirmingDelete: true });
    fireEvent.press(screen.getByText('Delete date'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe('DeleteDateDialog', () => {
  it('names the date as a disc and the visit as tags', () => {
    render(
      <DeleteDateDialog
        visible
        dayId="2026-10-02"
        visit={{ timeOfDay: 'afternoon', durationId: 'd60', startMinutes: 9 * 60 }}
        onKeep={jest.fn()}
        onDelete={jest.fn()}
      />,
    );
    expect(screen.getByText('Fri')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Afternoon')).toBeTruthy();
    expect(screen.getByText('60 minutes')).toBeTruthy();
    expect(screen.getByText('9:00 AM')).toBeTruthy();
  });
});

describe('RecurringDialog', () => {
  it('draws nothing while closed, and a tap on the scrim keeps', () => {
    const onKeep = jest.fn();
    const props = {
      icon: COOK_VISIT_ICON,
      title: 'Delete Plan 2?',
      keepLabel: 'Keep plan',
      confirmLabel: 'Delete plan',
      onKeep,
      onConfirm: jest.fn(),
      testID: 'dialog',
    };
    const { rerender } = render(<RecurringDialog visible={false} {...props} />);
    expect(screen.queryByText('Delete Plan 2?')).toBeNull();
    rerender(<RecurringDialog visible {...props} note="Gone for good" />);
    expect(screen.getByText('Gone for good')).toBeTruthy();
    act(() => {
      fireEvent.press(screen.getByTestId('dialog-backdrop'));
    });
    expect(onKeep).toHaveBeenCalled();
  });
});
