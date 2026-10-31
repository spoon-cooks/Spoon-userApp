import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAndroidBackHandler } from '@core/navigation';
import { useKeyboardAwareScroll, useKeyboardHeight } from '@ui';
import { C, T } from '@ui/v2/theme';

import { FOOD_PROFILE_ART } from '../art';
import {
  CUISINE_MAX,
  CUISINE_QUESTION,
  CUISINE_SEARCH_PLACEHOLDER,
  DIET_OPTIONS,
  GENDER_OPTIONS,
  GENDER_QUESTION,
  GHEE_HINT,
  GHEE_LABEL,
  HASSLES_BY_MEAL,
  HASSLE_NOTE_MAX_LENGTH,
  HASSLE_NOTE_PLACEHOLDER,
  HOUSEHOLD_ROWS,
  MEAL_OPTIONS,
  MEAL_QUESTION,
  NAME_MAX_LENGTH,
  NAME_PLACEHOLDER,
  NON_VEG_OPTIONS,
  NON_VEG_QUESTION,
  OIL_QUESTION,
  OIL_STOPS,
  PEOPLE_QUESTION,
  PEOPLE_TIP,
  REGION_OPTIONS,
  REGION_QUESTION,
  WIZARD_CONTINUE,
  WIZARD_SAVE,
  WIZARD_STEPS,
} from '../fields';
import type { WizardStepId } from '../fields';
import {
  NO_GENDER_PREFERENCE,
  canAddCuisine,
  canContinueStep,
  canDecrement,
  canIncrement,
  canSubmitProfileDetails,
  clampHassleNote,
  clampName,
  cuisineChipRow,
  cuisineMatches,
  hassleSetupOf,
  selectDiet,
  selectMealSetup,
  showsNonVegPreferences,
  stepCount,
  toggleCuisine,
  toggleIn,
  toggleSingle,
} from '../validation';
import type { ProfileDetailsValues } from '../validation';
import {
  Chip,
  ChipScroller,
  CounterRow,
  ListCard,
  ListRow,
  OilSlider,
  OptionTile,
  Question,
  SwitchRow,
  TileRows,
  WizardFooter,
  WizardHeader,
} from './parts';

/**
 * The taste-profile wizard — Figma `cCQlzTeiObQkpVBzwI8mZi` page `1405:448`: Family `1548:3676`,
 * Diet `1548:3786`, Taste `1548:3922` and Cook `1548:4061` / `2522:1049`, with the dev notes
 * beside each frame (`2505:4910` … `2505:4931`).
 *
 * One screen holding the step, rather than four routes, so Back moves between steps without
 * losing an answer and the whole profile is still one object to save.
 *
 * BOUNDARY: this collects, validates and reports each change (for the on-device draft). It does
 * not save, does not navigate and does not decide where the last step leads — the route
 * (`app/(app)/profile/details.tsx`) owns all three.
 *
 * ## Carried over from the V8 page
 *
 *  - The scroll area shrinks by the keyboard's MEASURED height rather than a
 *    `KeyboardAvoidingView` (Android 15's edge-to-edge window no longer resizes), and
 *    `useKeyboardAwareScroll` lifts a focused field the keyboard would still cover: the cuisine
 *    search and the hassle box are both far enough down for that to happen.
 *  - No vertical scroll indicator, as on every other screen.
 *  - Free text is trimmed before it is submitted; a rejected save keeps every answer and says why.
 *  - The grown-up food list is a closed vocabulary: only a listed cuisine can be added.
 */
export interface TasteProfileWizardProps {
  readonly initialValues: ProfileDetailsValues;
  readonly initialStep?: WizardStepId;
  /**
   * What Back does on the FIRST step. Omit it to draw no back control there and to swallow
   * Android's back: first-run onboarding cannot be skipped. Later steps always go back a step.
   */
  readonly onExit?: (() => void) | undefined;
  /** Every change, with the step it was made on — the route keeps the draft from this. */
  readonly onChange?: ((step: WizardStepId, values: ProfileDetailsValues) => void) | undefined;
  readonly onSubmit: (values: ProfileDetailsValues) => void;
  readonly submitting?: boolean;
  readonly errorMessage?: string;
  readonly testID?: string;
}

const STEP_IDS = WIZARD_STEPS.map((step) => step.id);

export function TasteProfileWizard({
  initialValues,
  initialStep = 'family',
  onExit,
  onChange,
  onSubmit,
  submitting = false,
  errorMessage,
  testID = 'taste-profile',
}: TasteProfileWizardProps) {
  const [step, setStep] = useState<WizardStepId>(initialStep);
  const [values, setValues] = useState<ProfileDetailsValues>(initialValues);
  const index = STEP_IDS.indexOf(step);
  const lastStep = index === STEP_IDS.length - 1;

  const keyboardHeight = useKeyboardHeight();
  const { scrollRef, viewportRef, onViewportLayout, onScroll, onInputFocus } =
    useKeyboardAwareScroll(keyboardHeight);

  // Kept in a ref so a new callback identity each render does not re-report an unchanged answer.
  const latestChange = useRef(onChange);
  useEffect(() => {
    latestChange.current = onChange;
  }, [onChange]);
  useEffect(() => {
    latestChange.current?.(step, values);
  }, [step, values]);

  // A new step opens at its top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step, scrollRef]);

  const goBack = index > 0 ? () => setStep(STEP_IDS[index - 1] ?? 'family') : onExit;

  // Android back follows the on-screen Back; with none (first-run step 1) it is swallowed.
  useAndroidBackHandler(() => {
    if (index > 0) {
      setStep(STEP_IDS[index - 1] ?? 'family');
      return true;
    }
    return onExit === undefined;
  });

  const update = (next: (current: ProfileDetailsValues) => ProfileDetailsValues) =>
    setValues((current) => next(current));

  const canContinue = lastStep
    ? canSubmitProfileDetails({ values, submitting })
    : canContinueStep(step, values);

  const advance = () => {
    if (!canContinue) return;
    if (!lastStep) {
      setStep(STEP_IDS[index + 1] ?? 'cook');
      return;
    }
    onSubmit({
      ...values,
      name: values.name.trim(),
      pressingIssue: values.pressingIssue.trim(),
    });
  };

  return (
    <View style={styles.screen} testID={testID}>
      <WizardHeader step={step} onBack={goBack} testID={`${testID}-header`} />
      <View
        ref={viewportRef}
        onLayout={onViewportLayout}
        style={[styles.flex, keyboardHeight === 0 ? null : { marginBottom: keyboardHeight }]}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[styles.body, step === 'cook' && styles.bodyCook]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          testID={`${testID}-scroll`}
        >
          {step === 'family' ? (
            <FamilyStep
              values={values}
              update={update}
              onInputFocus={onInputFocus}
              testID={testID}
            />
          ) : null}
          {step === 'diet' ? <DietStep values={values} update={update} testID={testID} /> : null}
          {step === 'taste' ? (
            <TasteStep
              values={values}
              update={update}
              onInputFocus={onInputFocus}
              testID={testID}
            />
          ) : null}
          {step === 'cook' ? (
            <CookStep
              values={values}
              update={update}
              onInputFocus={onInputFocus}
              scrollTo={(y) => scrollRef.current?.scrollTo({ y, animated: true })}
              testID={testID}
            />
          ) : null}
        </ScrollView>
        <WizardFooter
          label={lastStep ? WIZARD_SAVE : WIZARD_CONTINUE}
          onPress={advance}
          disabled={!canContinue && !submitting}
          loading={submitting}
          errorMessage={lastStep ? errorMessage : undefined}
          testID={`${testID}-continue`}
        />
      </View>
    </View>
  );
}

type Update = (next: (current: ProfileDetailsValues) => ProfileDetailsValues) => void;

/* ---------------------------------------------------------------------------- 1 · family */

function FamilyStep({
  values,
  update,
  onInputFocus,
  testID,
}: {
  values: ProfileDetailsValues;
  update: Update;
  onInputFocus: () => void;
  testID: string;
}) {
  return (
    <>
      {/* `2472:19421` — the Input component: 1.5pt `#FFEF99`, 8pt radius, 48pt tall. */}
      <View style={styles.field}>
        <TextInput
          value={values.name}
          onChangeText={(name) => update((current) => ({ ...current, name: clampName(name) }))}
          onFocus={onInputFocus}
          placeholder={NAME_PLACEHOLDER}
          placeholderTextColor={C.textSecondary}
          maxLength={NAME_MAX_LENGTH}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="done"
          accessibilityLabel={NAME_PLACEHOLDER}
          style={styles.fieldInput}
          testID={`${testID}-name`}
        />
      </View>

      <View style={styles.section}>
        <Question>{PEOPLE_QUESTION}</Question>
        {/* `1548:3755` — the portion tip. */}
        <View style={styles.tip}>
          <Image source={FOOD_PROFILE_ART.dish} style={styles.icon24} />
          <Text style={[styles.caption, styles.flex]}>{PEOPLE_TIP}</Text>
        </View>
        {/* `1548:3718` — the counters card. */}
        <View style={styles.counters}>
          {HOUSEHOLD_ROWS.map((row, at) => (
            <CounterRow
              key={row.id}
              label={row.label}
              hint={row.hint}
              well={row.well}
              iconSize={row.iconSize}
              value={values[row.id]}
              canDecrement={canDecrement(values, row.id)}
              canIncrement={canIncrement(values, row.id)}
              onDecrement={() => update((current) => stepCount(current, row.id, -1))}
              onIncrement={() => update((current) => stepCount(current, row.id, 1))}
              last={at === HOUSEHOLD_ROWS.length - 1}
              testID={`${testID}-${row.id}`}
            />
          ))}
        </View>
      </View>
    </>
  );
}

/* ------------------------------------------------------------------------------ 2 · diet */

function DietStep({
  values,
  update,
  testID,
}: {
  values: ProfileDetailsValues;
  update: Update;
  testID: string;
}) {
  return (
    <>
      <TileRows
        items={DIET_OPTIONS}
        columns={3}
        render={(option) => (
          <OptionTile
            key={option.id}
            option={option}
            selected={values.dietaryPreference === option.id}
            onPress={() => update((current) => selectDiet(current, option.id))}
            testID={`${testID}-diet-${option.id}`}
          />
        )}
      />
      {showsNonVegPreferences(values) ? (
        <View style={styles.section}>
          <Question size="emphasis">{NON_VEG_QUESTION}</Question>
          <ChipScroller testID={`${testID}-meats`}>
            {NON_VEG_OPTIONS.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                selected={values.nonVegPreferences.includes(option.id)}
                onPress={() =>
                  update((current) => ({
                    ...current,
                    nonVegPreferences: toggleIn(current.nonVegPreferences, option.id),
                  }))
                }
                testID={`${testID}-meat-${option.id}`}
              />
            ))}
          </ChipScroller>
        </View>
      ) : null}
    </>
  );
}

/* ----------------------------------------------------------------------------- 3 · taste */

function TasteStep({
  values,
  update,
  onInputFocus,
  testID,
}: {
  values: ProfileDetailsValues;
  update: Update;
  onInputFocus: () => void;
  testID: string;
}) {
  /** The search box's own text — not a collected value. */
  const [query, setQuery] = useState('');
  const matches = cuisineMatches(query, values.grownUpEating);
  const full = !canAddCuisine(values);

  const pick = (label: string) => {
    update((current) => toggleCuisine(current, label));
    setQuery('');
  };

  return (
    <>
      <View style={styles.section}>
        <Question>{CUISINE_QUESTION}</Question>
        {/* `1548:3969` — a pill outlined in black at 25 %, the 18pt magnifier 8pt clear. */}
        <View style={styles.search}>
          <Image source={FOOD_PROFILE_ART.search} style={styles.icon18} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onFocus={onInputFocus}
            placeholder={CUISINE_SEARCH_PLACEHOLDER}
            placeholderTextColor={C.textSecondary}
            accessibilityLabel={`${CUISINE_SEARCH_PLACEHOLDER} cuisines`}
            returnKeyType="done"
            style={styles.searchInput}
            testID={`${testID}-cuisine-search`}
          />
        </View>

        {/*
          FIGMA_PENDING — the frame draws the field and the chip row, not the results. Typing
          filters the full list (dev note `2505:4926`), so the matches are listed here, in flow,
          in the field's own outline; only a listed cuisine can be added.
        */}
        {query.trim() === '' ? null : matches.length === 0 ? (
          <Text style={[styles.caption, styles.textSecondary]} testID={`${testID}-cuisine-none`}>
            No matching cuisine. Try a region, like Punjabi or Bengali.
          </Text>
        ) : (
          <ScrollView
            style={styles.results}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            testID={`${testID}-cuisine-results`}
          >
            {matches.map((label) => (
              <Pressable
                key={label}
                onPress={() => pick(label)}
                disabled={full}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ disabled: full }}
                style={({ pressed }) => [
                  styles.result,
                  full && styles.disabled,
                  pressed && styles.resultPressed,
                ]}
                testID={`${testID}-cuisine-result-${label}`}
              >
                <Text style={styles.bodyText}>{label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* `2475:19504` — chosen first (with their remove cross), then the featured ten. */}
        <ChipScroller testID={`${testID}-cuisines`}>
          {cuisineChipRow(values.grownUpEating).map((label) => {
            const chosen = values.grownUpEating.includes(label);
            return (
              <Chip
                key={label}
                label={label}
                selected={chosen}
                mark="remove"
                disabled={!chosen && full}
                onPress={() => pick(label)}
                testID={`${testID}-cuisine-${label}`}
              />
            );
          })}
        </ChipScroller>
        {full ? (
          <Text style={[styles.caption, styles.textSecondary]}>
            {`You can pick up to ${CUISINE_MAX}.`}
          </Text>
        ) : null}
      </View>

      <View style={[styles.section, styles.sectionWide]}>
        <Question>{OIL_QUESTION}</Question>
        <OilSlider
          stops={OIL_STOPS}
          value={values.oilLevel}
          onChange={(oilLevel) => update((current) => ({ ...current, oilLevel }))}
          testID={`${testID}-oil`}
        />
        {/*
          Dev note `2505:4929` leaves Ghee + No oil to product; it is kept independent, as
          `2505:4928` says, and read as "ghee at the minimum".
        */}
        <SwitchRow
          label={GHEE_LABEL}
          hint={GHEE_HINT}
          value={values.gheeOnly}
          onChange={(gheeOnly) => update((current) => ({ ...current, gheeOnly }))}
          testID={`${testID}-ghee`}
        />
      </View>
    </>
  );
}

/* ------------------------------------------------------------------------------ 4 · cook */

function CookStep({
  values,
  update,
  onInputFocus,
  scrollTo,
  testID,
}: {
  values: ProfileDetailsValues;
  update: Update;
  onInputFocus: () => void;
  scrollTo: (y: number) => void;
  testID: string;
}) {
  const setup = hassleSetupOf(values);
  const hassles = setup === null ? null : HASSLES_BY_MEAL[setup];
  /** Set when a meal setup is picked, so the hassle section is scrolled to once it has laid out. */
  const revealHassles = useRef(false);

  return (
    <>
      <View style={[styles.section, styles.sectionCook]}>
        <Question>{GENDER_QUESTION}</Question>
        <TileRows
          items={GENDER_OPTIONS}
          columns={3}
          render={(option) => (
            <OptionTile
              key={option.id}
              option={option}
              compact
              // No answer (an older draft, or the picked tile tapped off) is "No preference".
              selected={(values.genderPreference ?? NO_GENDER_PREFERENCE) === option.id}
              onPress={() =>
                update((current) => ({
                  ...current,
                  genderPreference: toggleSingle(current.genderPreference, option.id),
                }))
              }
              testID={`${testID}-gender-${option.id}`}
            />
          )}
        />
      </View>

      <View style={[styles.section, styles.sectionCook]}>
        <Question>{REGION_QUESTION}</Question>
        <TileRows
          items={REGION_OPTIONS}
          columns={2}
          render={(option) => (
            <OptionTile
              key={option.id}
              option={option}
              compact
              selected={values.regionPreference === option.id}
              onPress={() =>
                update((current) => ({
                  ...current,
                  regionPreference: toggleSingle(current.regionPreference, option.id),
                }))
              }
              testID={`${testID}-region-${option.id}`}
            />
          )}
        />
      </View>

      <View style={[styles.section, styles.sectionMeals]}>
        <Question>{MEAL_QUESTION}</Question>
        <ListCard testID={`${testID}-meals`}>
          {MEAL_OPTIONS.map((option, at) => (
            <ListRow
              key={option.id}
              option={option}
              kind="radio"
              selected={values.mealStructure === option.id}
              onPress={() => {
                if (values.mealStructure !== option.id) revealHassles.current = true;
                update((current) => selectMealSetup(current, option.id));
              }}
              last={at === MEAL_OPTIONS.length - 1}
              testID={`${testID}-meal-${option.id}`}
            />
          ))}
        </ListCard>
      </View>

      {/* Dev note `2505:4935`: hidden until a setup is picked, then scrolled to. */}
      {hassles === null ? null : (
        <View
          style={[styles.section, styles.sectionCook]}
          onLayout={(event) => {
            if (!revealHassles.current) return;
            revealHassles.current = false;
            scrollTo(Math.max(0, event.nativeEvent.layout.y - 16));
          }}
          testID={`${testID}-hassles`}
        >
          {/* `2522:1170` draws the per-setup title alone; the older frame's "Optional" tag is gone. */}
          <Question>{hassles.question}</Question>
          <ListCard testID={`${testID}-hassle-list`}>
            {hassles.options.map((option, at) => (
              <ListRow
                key={option.id}
                option={option}
                kind="checkbox"
                selected={values.mealHassles.includes(option.id)}
                onPress={() =>
                  update((current) => ({
                    ...current,
                    mealHassles: toggleIn(current.mealHassles, option.id),
                  }))
                }
                last={at === hassles.options.length - 1}
                testID={`${testID}-hassle-${option.id}`}
              />
            ))}
          </ListCard>
          {/* `2522:1212` — grows to three lines, then scrolls; the counter is live. */}
          <View style={styles.note}>
            <TextInput
              value={values.pressingIssue}
              onChangeText={(text) =>
                update((current) => ({ ...current, pressingIssue: clampHassleNote(text) }))
              }
              onFocus={onInputFocus}
              placeholder={HASSLE_NOTE_PLACEHOLDER}
              placeholderTextColor={C.textSecondary}
              maxLength={HASSLE_NOTE_MAX_LENGTH}
              multiline
              accessibilityLabel={HASSLE_NOTE_PLACEHOLDER}
              style={styles.noteInput}
              testID={`${testID}-hassle-note`}
            />
            <Text style={styles.counter} testID={`${testID}-hassle-note-count`}>
              {`${values.pressingIssue.length}/${HASSLE_NOTE_MAX_LENGTH}`}
            </Text>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.base },
  flex: { flex: 1, minWidth: 0 },
  disabled: { opacity: 0.4 },
  icon18: { width: 18, height: 18 },
  icon24: { width: 24, height: 24 },
  textSecondary: { color: C.textSecondary },
  bodyText: { ...T.body, color: C.text },
  caption: { ...T.caption, color: C.text },

  /** `1548:3824` — 16pt gutters, 24pt down from the header and between sections. */
  body: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 24, gap: 24 },
  /** `1548:4105` — the Cook step is tighter: 16 from the header and between sections. */
  bodyCook: { paddingTop: 16, gap: 16 },
  section: { gap: 8 },
  sectionWide: { gap: 12 },
  sectionCook: { gap: 12 },
  sectionMeals: { gap: 10 },

  field: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.base,
  },
  // No lineHeight on a single-line input: iOS sets its text low when given one (`5eaf2c0`).
  fieldInput: {
    minHeight: 45,
    paddingVertical: 0,
    paddingHorizontal: 0,
    fontFamily: T.body.fontFamily,
    fontSize: T.body.fontSize,
    color: C.text,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  counters: {
    paddingLeft: 16,
    paddingRight: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.base,
  },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 38,
    paddingLeft: 12,
    paddingRight: 16,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: C.textDisabled,
    backgroundColor: C.base,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    fontFamily: T.body.fontFamily,
    fontSize: T.body.fontSize,
    color: C.text,
    includeFontPadding: false,
  },
  results: {
    maxHeight: 200,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.textDisabled,
    backgroundColor: C.base,
  },
  result: { paddingHorizontal: 16, paddingVertical: 10 },
  resultPressed: { backgroundColor: C.subtle },

  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    minHeight: 63,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.textDisabled,
    backgroundColor: C.base,
  },
  /** Three 16pt lines, then it scrolls (dev note `2505:4936`). */
  noteInput: {
    flex: 1,
    minWidth: 0,
    maxHeight: 48,
    padding: 0,
    ...T.caption,
    color: C.text,
    textAlignVertical: 'top',
  },
  counter: { ...T.caption, color: C.textDisabled },
});
