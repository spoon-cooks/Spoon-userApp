import {
  ALL_CUISINES,
  CUISINE_MAX,
  DEFAULT_OIL_LEVEL,
  FEATURED_CUISINES,
  HOUSEHOLD_MAX,
  HOUSEHOLD_ROWS,
  MEAT_EATING_DIETS,
  NAME_MAX_LENGTH,
  HASSLE_NOTE_MAX_LENGTH,
  isMealSetup,
} from './fields';
import type { HouseholdCountId, WizardStepId } from './fields';

/**
 * The taste-profile wizard's answers and the rules over them. Pure: the screen renders from these
 * and asks these, so a rule exists once (the address form's `validation.ts` is the precedent).
 *
 * Required (dev notes `2505:4913` … `2505:4934`): Name, at least one person, Diet and the meal
 * setup. Everything else is optional, so the Taste step's Continue is always enabled.
 */
export interface ProfileDetailsValues {
  readonly name: string;
  readonly householdAdults: number;
  readonly householdKids: number;
  readonly householdElders: number;
  readonly dietaryPreference: string | null;
  readonly nonVegPreferences: readonly string[];
  /** Cuisine LABELS, in the order chosen (V0 stores this list open-vocabulary). */
  readonly grownUpEating: readonly string[];
  readonly oilLevel: string;
  readonly gheeOnly: boolean;
  readonly genderPreference: string | null;
  readonly regionPreference: string | null;
  readonly mealStructure: string | null;
  readonly mealHassles: readonly string[];
  /** The "Something else? Tell us" box; V0's `pressingIssue`. */
  readonly pressingIssue: string;
}

/** V0's `either`, drawn as "No preference": the cook gender answer when none is picked. */
export const NO_GENDER_PREFERENCE = 'either';

/** Adults 1, others 0, Light oil, ghee off; no diet and no meal setup (dev notes). */
export const EMPTY_PROFILE_DETAILS: ProfileDetailsValues = {
  name: '',
  householdAdults: 1,
  householdKids: 0,
  householdElders: 0,
  dietaryPreference: null,
  nonVegPreferences: [],
  grownUpEating: [],
  oilLevel: DEFAULT_OIL_LEVEL,
  gheeOnly: false,
  // "No preference" is chosen until the customer picks a cook gender (31 Oct 2026).
  genderPreference: NO_GENDER_PREFERENCE,
  regionPreference: null,
  mealStructure: null,
  mealHassles: [],
  pressingIssue: '',
};

/** Whether this step's Continue may be pressed. */
export function canContinueStep(step: WizardStepId, values: ProfileDetailsValues): boolean {
  switch (step) {
    case 'family':
      return (
        values.name.trim() !== '' &&
        values.householdAdults + values.householdKids + values.householdElders >= 1
      );
    case 'diet':
      return values.dietaryPreference !== null;
    case 'taste':
      return true;
    case 'cook':
      return values.mealStructure !== null;
  }
}

/** The whole profile is submittable: every step's gate holds, and nothing is mid-save. */
export function canSubmitProfileDetails(gate: {
  readonly values: ProfileDetailsValues;
  readonly submitting: boolean;
}): boolean {
  if (gate.submitting) return false;
  return (['family', 'diet', 'taste', 'cook'] as const).every((step) =>
    canContinueStep(step, gate.values),
  );
}

/** The first step whose gate fails — where a restored draft resumes. */
export function firstIncompleteStep(values: ProfileDetailsValues): WizardStepId {
  for (const step of ['family', 'diet', 'taste', 'cook'] as const) {
    if (!canContinueStep(step, values)) return step;
  }
  return 'cook';
}

/* ------------------------------------------------------------------------------- family */

export function clampName(name: string): string {
  return name.slice(0, NAME_MAX_LENGTH);
}

function minFor(id: HouseholdCountId): number {
  return HOUSEHOLD_ROWS.find((row) => row.id === id)?.min ?? 0;
}

export function canDecrement(values: ProfileDetailsValues, id: HouseholdCountId): boolean {
  return values[id] > minFor(id);
}

export function canIncrement(values: ProfileDetailsValues, id: HouseholdCountId): boolean {
  return values[id] < HOUSEHOLD_MAX;
}

export function stepCount(
  values: ProfileDetailsValues,
  id: HouseholdCountId,
  delta: 1 | -1,
): ProfileDetailsValues {
  const next = Math.min(HOUSEHOLD_MAX, Math.max(minFor(id), values[id] + delta));
  return next === values[id] ? values : { ...values, [id]: next };
}

/* --------------------------------------------------------------------------------- diet */

export function showsNonVegPreferences(values: ProfileDetailsValues): boolean {
  return values.dietaryPreference !== null && MEAT_EATING_DIETS.has(values.dietaryPreference);
}

/**
 * Dev note `2505:4919`: tapping the selected tile does not deselect it. Dev note `2505:4921`:
 * switching to a diet without meat clears the meat chips.
 */
export function selectDiet(values: ProfileDetailsValues, id: string): ProfileDetailsValues {
  if (values.dietaryPreference === id) return values;
  return {
    ...values,
    dietaryPreference: id,
    nonVegPreferences: MEAT_EATING_DIETS.has(id) ? values.nonVegPreferences : [],
  };
}

export function toggleIn(list: readonly string[], id: string): readonly string[] {
  return list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];
}

/** Single-select tiles that CAN be cleared by tapping again (gender, region: both optional). */
export function toggleSingle(current: string | null, id: string): string | null {
  return current === id ? null : id;
}

/* -------------------------------------------------------------------------------- taste */

export function canAddCuisine(values: ProfileDetailsValues): boolean {
  return values.grownUpEating.length < CUISINE_MAX;
}

/** Adds a cuisine (at most `CUISINE_MAX`), or removes it when already chosen. */
export function toggleCuisine(values: ProfileDetailsValues, label: string): ProfileDetailsValues {
  const chosen = values.grownUpEating;
  if (chosen.includes(label)) {
    return { ...values, grownUpEating: chosen.filter((entry) => entry !== label) };
  }
  if (chosen.length >= CUISINE_MAX) return values;
  return { ...values, grownUpEating: [...chosen, label] };
}

/**
 * The chip row (dev note `2505:4926`): selected chips float to the front in the order chosen,
 * followed by the ten featured cuisines not yet chosen.
 */
export function cuisineChipRow(chosen: readonly string[]): readonly string[] {
  return [...chosen, ...FEATURED_CUISINES.filter((label) => !chosen.includes(label))];
}

/** Typing filters the FULL list; an empty query shows nothing (the chip row covers that case). */
export function cuisineMatches(query: string, chosen: readonly string[]): readonly string[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];
  return ALL_CUISINES.filter(
    (label) => !chosen.includes(label) && label.toLowerCase().includes(needle),
  );
}

/* --------------------------------------------------------------------------------- cook */

/**
 * Picking a different meal setup swaps the hassle list for that setup's, so the old ticks cannot
 * be submitted against a list they do not belong to (V0 refuses that pair).
 */
export function selectMealSetup(values: ProfileDetailsValues, id: string): ProfileDetailsValues {
  if (values.mealStructure === id) return values;
  return { ...values, mealStructure: id, mealHassles: [] };
}

export function hassleSetupOf(values: ProfileDetailsValues) {
  return isMealSetup(values.mealStructure) ? values.mealStructure : null;
}

export function clampHassleNote(text: string): string {
  return text.slice(0, HASSLE_NOTE_MAX_LENGTH);
}
