import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { useAndroidBackHandler } from '@core/navigation';

import { Screen, ScreenHeader } from '@ui';

import { TRASH_ICON } from '../art';
import { DeleteDateDialog } from '../components/DeleteDateDialog';
import { DurationEditor, StartTimeEditor, TimeOfDayEditor } from '../components/EditDateEditors';
import { EditDateHeader } from '../components/EditDateHeader';
import { HelpFab } from '../components/HelpFab';
import { RecurringFooter } from '../components/RecurringFooter';
import type { RecurringBusyWindow } from '../data';
import {
  EDIT_DATE_TITLES,
  canSave,
  completeDraft,
  draftOf,
  withDuration,
  withStartTime,
  withTimeOfDay,
} from '../editDateDraft';
import type { EditDateDraft, EditDateField } from '../editDateDraft';
import type { RecurringVisitChoice } from '../types';

/**
 * Recurring setup — Edit date. Figma `cCQlzTeiObQkpVBzwI8mZi` (Spoon — User): `494:676`
 * ("Edit duration") and the delete dialog on `586:4315`.
 *
 * Reached from the Summary's edit mode by tapping one date. The header keeps the date's booking
 * as it stands — plan, date, and its time of day, duration and start as chips — while ONE of the
 * three is changed below: the outlined chip is the one open, and tapping another switches the
 * editor and the title ("Edit duration", "Edit time of the day", "Edit start time"). "Save
 * changes" unlocks once the picks make a complete booking that differs from the date's own; the
 * Summary then lands on the new plan the edited date becomes. The bin asks before taking the date
 * off its plan.
 */
export interface RecurringEditDateScreenProps {
  /** 1-based: the plan the date is on. */
  readonly planNumber: number;
  readonly dayId: string;
  /** The visit booked on the date now. */
  readonly visit: RecurringVisitChoice;
  /** The plan's other visits on this date, whose times the new one must not overlap. */
  readonly busy: readonly RecurringBusyWindow[];
  readonly onBack: () => void;
  readonly onSave: (choice: RecurringVisitChoice) => void;
  readonly onDelete: () => void;
  /** The editor open first; the duration one, as `494:676` draws it. */
  readonly initialField?: EditDateField | undefined;
  /** Picks already made — a design state to preview; the date's own booking when left out. */
  readonly initialDraft?: Partial<EditDateDraft> | undefined;
  /** Opens with the delete dialog up (`586:4315`). */
  readonly initialConfirmingDelete?: boolean | undefined;
  readonly testID?: string;
}

export function RecurringEditDateScreen({
  planNumber,
  dayId,
  visit,
  busy,
  onBack,
  onSave,
  onDelete,
  initialField = 'duration',
  initialDraft,
  initialConfirmingDelete = false,
  testID = 'recurring-edit-date-screen',
}: RecurringEditDateScreenProps) {
  // Android back does what the back arrow does, instead of leaving the whole flow.
  useAndroidBackHandler(() => {
    onBack();
    return true;
  });
  const [field, setField] = useState<EditDateField>(initialField);
  const [draft, setDraft] = useState<EditDateDraft>({ ...draftOf(visit), ...initialDraft });
  const [confirmingDelete, setConfirmingDelete] = useState(initialConfirmingDelete);
  const choice = completeDraft(draft);

  return (
    <Screen
      tone="plain"
      padded={false}
      testID={testID}
      header={
        <View>
          {/* `586:4299` — Nav header 5: back, the title, the bin in a 44pt target. */}
          <ScreenHeader
            density="nav"
            title={EDIT_DATE_TITLES[field]}
            onBack={onBack}
            trailing={
              <Pressable
                onPress={() => setConfirmingDelete(true)}
                accessibilityRole="button"
                accessibilityLabel="Delete this date"
                style={styles.trash}
                testID={`${testID}-delete`}
              >
                <Image source={TRASH_ICON} style={styles.icon24} />
              </Pressable>
            }
            testID={`${testID}-header`}
          />
          <EditDateHeader
            planNumber={planNumber}
            dayId={dayId}
            visit={visit}
            active={field}
            onSelect={setField}
            testID={`${testID}-details`}
          />
        </View>
      }
      footer={
        <RecurringFooter
          label="Save changes"
          disabled={!canSave(draft, visit)}
          onPress={() => {
            if (choice !== null && canSave(draft, visit)) onSave(choice);
          }}
          testID={`${testID}-save`}
        />
      }
    >
      {field === 'timeOfDay' ? (
        <TimeOfDayEditor
          value={draft.timeOfDay}
          onPick={(next) => setDraft(withTimeOfDay(draft, next, busy))}
        />
      ) : field === 'duration' ? (
        <DurationEditor
          draft={draft}
          busy={busy}
          onPick={(next) => setDraft(withDuration(draft, next, busy))}
        />
      ) : (
        <StartTimeEditor
          draft={draft}
          busy={busy}
          dayId={dayId}
          onPick={(next) => setDraft(withStartTime(draft, next))}
        />
      )}
      <HelpFab />
      <DeleteDateDialog
        visible={confirmingDelete}
        dayId={dayId}
        visit={visit}
        onKeep={() => setConfirmingDelete(false)}
        onDelete={() => {
          setConfirmingDelete(false);
          onDelete();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  /** `586:4299` — the bin's 44pt hit area sits 6 from the frame's right edge, past the gutter. */
  trash: {
    marginLeft: 'auto',
    marginRight: -10,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon24: { width: 24, height: 24 },
});
