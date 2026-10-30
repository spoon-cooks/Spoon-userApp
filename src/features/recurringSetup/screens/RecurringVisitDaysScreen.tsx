import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAndroidBackHandler } from '@core/navigation';

import { Screen, ScreenHeader, Text } from '@ui';
import { lightTheme } from '@ui/theme/ThemeProvider';

import { PlanVisitsHeader } from '../components/PlanVisitsHeader';
import { RecurringFooter } from '../components/RecurringFooter';
import { RecurringScrollBody } from '../components/RecurringScrollBody';
import { VisitDaysPicker } from '../components/VisitDaysPicker';
import { ordinal, planSubtitle } from '../data';

/**
 * Recurring setup — the days for a further visit on a plan. Figma `cCQlzTeiObQkpVBzwI8mZi`
 * (Spoon — User): `332:6093` (none picked) and `332:5869` (days picked).
 *
 * Opened by the Summary's visit "+". The plan and its visits so far head the screen, the new
 * visit marked "Scheduling"; below, the plan's own days — a further visit can only run on days
 * the plan already has — to tap or drag across. "Continue" unlocks once a day is picked.
 *
 * `332:5869` titles the screen "Schedule" once days are picked; it stays "Pick your days" here,
 * as `332:6093` has it, so the title doesn't change under the user's finger.
 */
export interface RecurringVisitDaysScreenProps {
  /** 1-based. */
  readonly planNumber: number;
  /** The plan's days, earliest first. */
  readonly planDayIds: readonly string[];
  /** Captions of the plan's booked visits, in order: "1 hr · 9:00 AM". */
  readonly bookedVisits: readonly string[];
  /** Days already picked for this visit, when coming back to it. */
  readonly initialDayIds?: readonly string[] | undefined;
  readonly onBack: () => void;
  readonly onContinue: (dayIds: readonly string[]) => void;
  readonly testID?: string;
}

export function RecurringVisitDaysScreen({
  planNumber,
  planDayIds,
  bookedVisits,
  initialDayIds,
  onBack,
  onContinue,
  testID = 'recurring-visit-days-screen',
}: RecurringVisitDaysScreenProps) {
  // Android back does what the back arrow does, instead of leaving the whole flow.
  useAndroidBackHandler(() => {
    onBack();
    return true;
  });
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(initialDayIds ?? []));
  const visitLabel = `${ordinal(bookedVisits.length + 1)} visit`;

  return (
    <Screen
      tone="plain"
      padded={false}
      testID={testID}
      header={
        <ScreenHeader
          density="nav"
          title="Pick your days"
          onBack={onBack}
          testID={`${testID}-header`}
        />
      }
      footer={
        <RecurringFooter
          label="Continue"
          disabled={selected.size === 0}
          onPress={() => onContinue(planDayIds.filter((id) => selected.has(id)))}
          testID={`${testID}-continue`}
        />
      }
    >
      <RecurringScrollBody contentStyle={styles.content} testID={`${testID}-body`}>
        <PlanVisitsHeader
          planNumber={planNumber}
          subtitle={planSubtitle(planDayIds.length, bookedVisits.length)}
          bookedVisits={bookedVisits}
          testID={`${testID}-plan`}
        />
        {/* `365:8618` — the heading, the ask, then the plan's days; 12 apart. */}
        <View style={styles.section}>
          <Text variant="headingSection" color="textPrimary">
            Plan {planNumber}: Selected days
          </Text>
          <Text variant="body" color="textPrimary">
            Select days on which {visitLabel} is needed
          </Text>
          <VisitDaysPicker
            dayIds={planDayIds}
            selected={selected}
            onChange={setSelected}
            testID={`${testID}-days`}
          />
        </View>
      </RecurringScrollBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  /** `332:6096` — p 16, 24 between the header and the days. */
  content: { padding: lightTheme.space.lg, gap: lightTheme.space.xl },
  section: { gap: lightTheme.space.md },
});
