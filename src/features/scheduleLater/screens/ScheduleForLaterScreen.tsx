import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { DataState } from '@core/data';
import { DurationCarousel, TaxDetailsDialog } from '@features/homeRedesign';
import type { DurationOption } from '@features/homeRedesign';
import { Button, NoteCard, QueryBoundary, Screen, ScreenHeader, Text, useBottomGutter } from '@ui';
import { lightTheme } from '@ui/theme/ThemeProvider';
import { SlotChip, TimeGrid, TimeOfDayTabs, TimeTab } from '@ui/v2/TimePicker';

import { rejectionMessageFor } from '@features/scheduled';
import { laterSummaryWhen } from '../later';
import type { LaterDay, LaterModel } from '../later';
import type { LaterSelection } from '../laterData';

/**
 * Schedule for Later — Figma `cCQlzTeiObQkpVBzwI8mZi` `2466:18844` (default), `2466:18864` (day
 * picked), `2466:19025` (slot picked), with the dev notes `2466:19102`…`2466:19124`.
 *
 * Top to bottom: the duration carousel (Home's, the duration chosen on Home already selected),
 * "Pick day & time" over Today / Tomorrow / the third day, then once a day is picked the Morning /
 * Afternoon / Evening tabs and that tab's start times, three to a row; a pinned footer carries the
 * summary ("Thu, 15 Oct · 1:30 PM", "1 hr session", the payable) once a start time is picked, and
 * Confirm Booking.
 *
 * What is free comes from the three-day overview (DEC-094): a duration, a day, a time of day or a
 * start time with nothing free is greyed and cannot be chosen.
 *
 * `mode="reschedule"` is the same screen moving a booked visit (device test, 31 Oct 2026: Reschedule
 * opened the old Schedule screens). A reschedule moves WHEN, never how long, and is free: the
 * carousel holds only the booking's own duration, the CTA reads "Reschedule", and there is no
 * payable or "Check payment details".
 */
export interface ScheduleForLaterViewProps {
  readonly state: DataState<LaterModel>;
  readonly selection: LaterSelection;
  /** A picked start time was taken by a refresh. */
  readonly lostPick: boolean;
  readonly onBack: () => void;
  readonly onRetry: () => void;
  readonly onSelectDuration: (durationId: string) => void;
  readonly onSelectDay: (dayId: string) => void;
  readonly onSelectPeriod: (periodId: string) => void;
  readonly onSelectSlot: (slotId: string) => void;
  readonly onSubmit: () => void;
  /** The route's half of the CTA gate: an address, and a quote for this selection. */
  readonly canSubmit: boolean;
  readonly submitting: boolean;
  readonly submitError: string | null;
  /** `2466:19098` — the quote's payable, formatted. Absent until priced. */
  readonly amountLabel?: string | undefined;
  /** `book` (default) or `reschedule`: moving a booked visit, its duration fixed and no charge. */
  readonly mode?: 'book' | 'reschedule';
}

export function ScheduleForLaterView({
  state,
  selection,
  lostPick,
  onRetry,
  mode = 'book',
  ...actions
}: ScheduleForLaterViewProps) {
  const rescheduling = mode === 'reschedule';
  const [focusedId, setFocusedId] = useState<string | null>(selection.durationId);
  const [taxOpen, setTaxOpen] = useState(false);
  /**
   * The Screen pads its footer by this much below; the card takes that room back so its white runs
   * to the bottom edge, as `2466:19093` does (42 under the link = 8 + the 34pt home indicator).
   */
  const gutter = useBottomGutter(lightTheme.space.lg);

  return (
    <QueryBoundary state={state} onRetry={onRetry}>
      {(model) => {
        const durations: DurationOption[] = model.durations
          // A reschedule keeps the booked length: only that card is offered.
          .filter((duration) => !rescheduling || duration.id === selection.durationId)
          .map((duration) => ({
            id: duration.id,
            minutes: duration.minutes,
            label: duration.label,
            pricePaise: duration.pricePaise,
            mrpPaise: duration.mrpPaise,
            payablePaise: duration.payablePaise,
            available: { now: duration.available, later: duration.available },
          }));
        const chosen = model.durations.find((duration) => duration.id === selection.durationId);
        const period = model.periods.find((candidate) => candidate.id === selection.periodId);
        const slot = model.periods
          .flatMap((candidate) => candidate.slots)
          .find((candidate) => candidate.id === selection.slotId);
        const complete =
          selection.durationId !== null && selection.dayId !== null && selection.slotId !== null;
        const bookable = complete && actions.canSubmit && !actions.submitting;
        const focus = focusedId ?? selection.durationId ?? durations[1]?.id ?? durations[0]?.id;

        return (
          <Screen
            scroll
            padded={false}
            tone="plain"
            testID="schedule-later"
            header={
              <ScreenHeader
                density="nav"
                title={rescheduling ? 'Reschedule' : 'Schedule for Later'}
                onBack={actions.onBack}
                testID="schedule-later-header"
              />
            }
            footer={
              /* `2466:19093` — white, 24 top corners, Elevation/2, 16 in, 4 between rows. */
              <View
                style={[
                  styles.footer,
                  { marginBottom: -gutter, paddingBottom: gutter + lightTheme.space.sm },
                ]}
              >
                {complete && slot !== undefined && selection.dayId !== null ? (
                  <View style={styles.summary} testID="schedule-later-summary">
                    <View style={styles.when}>
                      <Text variant="bodyLargeStrong" color="textPrimary">
                        {laterSummaryWhen(selection.dayId, slot.label)}
                      </Text>
                      {chosen === undefined ? null : (
                        <Text variant="body" color="textSecondarySoft">
                          {`${chosen.label} session`}
                        </Text>
                      )}
                    </View>
                    {rescheduling || actions.amountLabel === undefined ? null : (
                      <Text variant="emphasis" color="textPrimary">
                        {actions.amountLabel}
                      </Text>
                    )}
                  </View>
                ) : null}
                <Button
                  label={rescheduling ? 'Reschedule' : 'Confirm Booking'}
                  onPress={() => {
                    if (bookable) actions.onSubmit();
                  }}
                  disabled={!bookable}
                  loading={actions.submitting}
                  size="pillLg"
                  flat
                  disabledTone="soft"
                  labelColor="textPrimary"
                  testID="schedule-later-confirm"
                />
                {/* `2466:19025` / dev note `2466:19113`: with a slot picked, "Check payment details"
                    sits under Confirm Booking and opens the tax details, as on Home. */}
                {complete && !rescheduling ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => setTaxOpen(true)}
                    hitSlop={8}
                    testID="schedule-later-payment-details"
                  >
                    <Text
                      variant="body"
                      color="textPrimary"
                      align="center"
                      style={styles.underline}
                    >
                      Check payment details
                    </Text>
                  </Pressable>
                ) : null}
                <TaxDetailsDialog
                  visible={taxOpen}
                  onClose={() => setTaxOpen(false)}
                  gstPercent={model.gstPercent}
                />
                {lostPick || actions.submitError !== null ? (
                  <Text
                    variant="body"
                    color="textSecondarySoft"
                    align="center"
                    accessibilityRole="alert"
                    testID="schedule-later-error"
                  >
                    {actions.submitError ?? 'That time is no longer available. Pick another.'}
                  </Text>
                ) : null}
              </View>
            }
          >
            {/* `2466:19028` — Home's carousel, the chosen duration on it. */}
            <View style={styles.carousel}>
              <DurationCarousel
                durations={durations}
                focusedId={focus ?? ''}
                selectedId={selection.durationId}
                isAvailable={(duration) => duration.available.later}
                status="ready"
                onFocus={setFocusedId}
                onSelect={(id) => {
                  setFocusedId(id);
                  if (!rescheduling) actions.onSelectDuration(id);
                }}
                onPressUnavailable={() => undefined}
                onRetry={onRetry}
              />
            </View>

            <View style={styles.body}>
              {model.rejection === null ? null : (
                <NoteCard
                  body={rejectionMessageFor(model.rejection)}
                  icon="alert"
                  testID="schedule-later-rejection"
                />
              )}
              {/* `2466:19030` — "Pick day & time" over the three days. */}
              <View style={styles.day}>
                <Text variant="emphasis" color="textPrimary">
                  Pick day & time
                </Text>
                <View style={styles.days} accessibilityRole="radiogroup">
                  {model.days.map((day) => (
                    <DayChip
                      key={day.id}
                      day={day}
                      selected={day.id === selection.dayId}
                      onPress={() => actions.onSelectDay(day.id)}
                    />
                  ))}
                </View>
              </View>

              {/* `2466:19042` — the tabs and the grid, once a day is picked. */}
              {selection.dayId === null || model.periods.length === 0 ? null : (
                <View style={styles.time}>
                  <TimeOfDayTabs>
                    {model.periods.map((candidate) => (
                      <TimeTab
                        key={candidate.id}
                        id={candidate.timeOfDay}
                        label={candidate.label}
                        selected={candidate.id === selection.periodId}
                        disabled={!candidate.available}
                        onPress={() => actions.onSelectPeriod(candidate.id)}
                        testID={`schedule-later-period-${candidate.timeOfDay}`}
                      />
                    ))}
                  </TimeOfDayTabs>
                  {model.slotsPending ? (
                    <Text variant="body" color="textSecondarySoft" testID="schedule-later-pending">
                      Finding start times…
                    </Text>
                  ) : period === undefined || period.slots.length === 0 ? (
                    <NoteCard
                      body="No start times for this time of day. Try another day or duration."
                      icon="alert"
                      testID="schedule-later-empty"
                    />
                  ) : (
                    <TimeGrid columns={3}>
                      {period.slots.map((candidate) => (
                        <SlotChip
                          key={candidate.id}
                          label={candidate.label}
                          selected={candidate.id === selection.slotId}
                          disabled={!candidate.available}
                          onPress={() => actions.onSelectSlot(candidate.id)}
                          testID={`schedule-later-slot-${candidate.id}`}
                        />
                      ))}
                    </TimeGrid>
                  )}
                </View>
              )}
            </View>
          </Screen>
        );
      }}
    </QueryBoundary>
  );
}

/**
 * `2466:19033` "Day" — 62 tall, 16 radius, a 1.5pt `#FFEF99` edge: the label (14/20, 60 %) over
 * the date (16/24 SemiBold). Picked: `#E2FF68`, a black-25 % edge and Elevation/2. Nothing free that
 * day: the start times' taken treatment — black at 3 %, the text at 25 % — and not pressable.
 */
function DayChip({
  day,
  selected,
  onPress,
}: {
  readonly day: LaterDay;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const disabled = !day.available;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={`${day.caption} ${day.dayNumber}${disabled ? ', full' : ''}`}
      style={[
        styles.dayChip,
        disabled ? styles.dayFull : selected ? styles.dayPicked : styles.dayOpen,
      ]}
      testID={`schedule-later-day-${day.id}`}
    >
      <Text variant="bodyLarge" color={disabled ? 'textDisabledSoft' : 'textSecondarySoft'}>
        {day.caption}
      </Text>
      <Text variant="emphasis" color={disabled ? 'textDisabledSoft' : 'textPrimary'}>
        {day.dayNumber}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  carousel: { paddingTop: lightTheme.space.sm },
  /** `2466:19025` "Check payment details" — Regular 12/16, underlined, centred. */
  underline: { textDecorationLine: 'underline' },
  /** `2466:19029` — 16 in, 16 between the day block and the time block. */
  body: { padding: lightTheme.space.lg, gap: lightTheme.space.lg },
  /** `2466:19030` — the title, 12, the strip. */
  day: { gap: lightTheme.space.md },
  /** `2466:19032` — three equal days, 16 apart. */
  days: { flexDirection: 'row', gap: lightTheme.space.lg },
  dayChip: {
    flex: 1,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    padding: lightTheme.space.sm,
    borderRadius: lightTheme.radius.md,
  },
  dayOpen: {
    borderWidth: 1.5,
    borderColor: lightTheme.colors.borderStartTime,
    backgroundColor: lightTheme.colors.surface,
  },
  dayPicked: {
    borderWidth: 1.5,
    borderColor: lightTheme.colors.borderDurationFocus,
    backgroundColor: lightTheme.colors.surfaceStartTimeSelected,
    boxShadow: '0 0 12px rgba(0,0,0,0.1)',
  },
  dayFull: { backgroundColor: lightTheme.colors.surfaceStartTimeUnavailable },
  /** `2466:19042` — the tabs, 12, the start times. */
  time: { gap: lightTheme.space.md },
  /**
   * `2466:19093` — drawn across the whole width, so the Screen footer's own side and top padding
   * are taken back; the safe-area gutter below stays the Screen's.
   */
  footer: {
    marginHorizontal: -lightTheme.layout.screenPaddingHorizontal,
    marginTop: -lightTheme.space.sm,
    paddingHorizontal: lightTheme.space.lg,
    paddingTop: lightTheme.space.lg,
    gap: lightTheme.space.xs,
    backgroundColor: lightTheme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    boxShadow: '0 0 12px rgba(0,0,0,0.1)',
  },
  /** `2466:19094` — when on the left, the payable on the right. */
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  when: { gap: 2 },
});
