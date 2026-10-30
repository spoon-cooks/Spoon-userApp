import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { useAndroidBackHandler } from '@core/navigation';

import { Screen, ScreenHeader } from '@ui';
import { lightTheme } from '@ui/theme/ThemeProvider';

import { PlanBanner } from '../components/PlanBanner';
import { PlanVisitsHeader } from '../components/PlanVisitsHeader';
import { RecurringFooter } from '../components/RecurringFooter';
import { RecurringScrollBody } from '../components/RecurringScrollBody';
import { SelectedDays } from '../components/SelectedDays';
import { VisitChoices } from '../components/VisitChoices';
import { busyWindowsFor, ordinal, planSubtitle, visitCaption } from '../data';
import type { RecurringVisitChoice } from '../types';

/**
 * Recurring setup — Schedule, one plan's visit at a time.
 *
 * Source: Figma `cCQlzTeiObQkpVBzwI8mZi` (Spoon — User): `229:1802` / `288:401` / `288:516` (Plan 1)
 * and `340:7110` / `340:7455` / `340:7539` (the last plan).
 *
 * The Plan banner names the plan and its visit, then the plan's days, then "Pick duration & time"
 * (`VisitChoices`): the Duration carousel, and once a duration is chosen the time-of-day tabs and
 * their start times. The CTA unlocks once a start time is picked.
 *
 * Spacing follows the frames: 24 between blocks while only the carousel shows (`340:7110`),
 * tightening to 16 once the times open (`340:7539`, whose content runs past the fold and fades
 * into the footer).
 *
 * CTA copy is the frames': "Save & Schedule Plan N+1" while plans remain, "Save & Continue" on the
 * last. (The notes under `340:7539` / `485:391` word them "Move to Plan (i+1)" / "Continue", and
 * `288:401` draws the stray "Move Save & Schedule Plan 2"; the first-hand frames win.)
 *
 * Start times are every 30 minutes across the band; once the backend answers for these days, the
 * ones no pool Cook can take on all of them are greyed (`VisitChoices`).
 *
 * Adding a further visit to a plan (`addingVisit`) — `332:5921` / `332:5681` / `332:5718`: the
 * Plan card and its visits replace the banner, and anything
 * that would overlap the plan's other visits on these days is greyed out — a 1 hr 9 AM 1st visit
 * takes 9 to 10 AM away from the 2nd. A duration with no start time left in the band greys too.
 */
export interface RecurringScheduleScreenProps {
  /** 1-based. */
  readonly planNumber: number;
  /** 1-based: which visit on the plan's days this schedules. */
  readonly visitNumber: number;
  readonly dayIds: readonly string[];
  /**
   * A choice already saved for this visit, to edit rather than start blank — or, for the dev
   * preview, the part of one already made.
   */
  readonly initial?: Partial<RecurringVisitChoice> | undefined;
  /** "Save & Schedule Plan 3", or "Save & Continue" on the last plan. */
  readonly ctaLabel: string;
  readonly onBack: () => void;
  readonly onSave: (choice: RecurringVisitChoice) => void;
  /** Set when this schedules a further visit on a plan. */
  readonly addingVisit?:
    | {
        readonly planDayIds: readonly string[];
        /** The visits numbered before this one — the header's greyed cards. */
        readonly visitsBefore: readonly RecurringVisitChoice[];
        /** Every other visit on the plan, whose times this one must not overlap. */
        readonly otherVisits: readonly RecurringVisitChoice[];
      }
    | undefined;
  readonly testID?: string;
}

export function RecurringScheduleScreen({
  planNumber,
  visitNumber,
  dayIds,
  initial,
  ctaLabel,
  onBack,
  onSave,
  addingVisit,
  testID = 'recurring-schedule-screen',
}: RecurringScheduleScreenProps) {
  // Android back does what the back arrow does, instead of leaving the whole flow.
  useAndroidBackHandler(() => {
    onBack();
    return true;
  });
  const [choice, setChoice] = useState<RecurringVisitChoice | null>(() => completeChoice(initial));
  /** `288:516` — spacing tightens from 24 to 16 once the Start time grid is on screen. */
  const [startShown, setStartShown] = useState(false);

  const busy = useMemo(
    () =>
      addingVisit === undefined
        ? []
        : busyWindowsFor(addingVisit.planDayIds, addingVisit.otherVisits, dayIds),
    [addingVisit, dayIds],
  );

  return (
    <Screen
      tone="plain"
      padded={false}
      testID={testID}
      header={
        <ScreenHeader density="nav" title="Schedule" onBack={onBack} testID={`${testID}-header`} />
      }
      footer={
        <RecurringFooter
          label={ctaLabel}
          disabled={choice === null}
          onPress={() => {
            if (choice !== null) onSave(choice);
          }}
          testID={`${testID}-save`}
        />
      }
    >
      <RecurringScrollBody
        contentStyle={[styles.content, startShown ? styles.contentCompact : null]}
        testID={`${testID}-body`}
      >
        {addingVisit === undefined ? (
          <PlanBanner
            planNumber={planNumber}
            subtitle={`${dayIds.length} day${dayIds.length === 1 ? '' : 's'} · ${ordinal(visitNumber)} Visit`}
            testID={`${testID}-banner`}
          />
        ) : (
          <PlanVisitsHeader
            planNumber={planNumber}
            subtitle={planSubtitle(addingVisit.planDayIds.length, addingVisit.visitsBefore.length)}
            bookedVisits={addingVisit.visitsBefore.map(visitCaption)}
            testID={`${testID}-plan`}
          />
        )}

        <SelectedDays dayIds={dayIds} testID={`${testID}-days`} />

        <VisitChoices
          initial={initial}
          busy={busy}
          dayIds={dayIds}
          onChange={setChoice}
          onStartTimesShown={setStartShown}
        />
      </RecurringScrollBody>
    </Screen>
  );
}

/** The choice, when `partial` already holds all three parts of one. */
function completeChoice(partial: Partial<RecurringVisitChoice> | undefined) {
  const { timeOfDay, durationId, startMinutes } = partial ?? {};
  return timeOfDay === undefined || durationId === undefined || startMinutes === undefined
    ? null
    : ({ ...partial, timeOfDay, durationId, startMinutes } as RecurringVisitChoice);
}

const styles = StyleSheet.create({
  /** `340:7113` — p 16, 24 between blocks. */
  content: { padding: lightTheme.space.lg, gap: lightTheme.space.xl },
  /** `288:519` — the same column at 16 between blocks, once the Start time grid is in. */
  contentCompact: { gap: lightTheme.space.lg },
});
