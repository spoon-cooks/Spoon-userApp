import type { DurationOption } from '../types';

export type DishComplexity = 'simple' | 'complex';

export interface DialInputs {
  readonly complexity: DishComplexity;
  readonly dishes: number;
  readonly people: number;
}

/**
 * The owner's dish-load table (31 Oct 2026), in minutes. Rows are dish counts — 1-2, 3 and 4-5
 * (the owner put 2 dishes in the 1-2 row) — columns are 1-2, 3-4, 5-6 and 7-8 people. The
 * steppers stop at 5 dishes and 8 people (`DISH_LIMITS`, `PEOPLE_LIMITS`), so every choice is in
 * the table.
 */
const TABLE: Record<DishComplexity, readonly (readonly number[])[]> = {
  simple: [
    [30, 45, 60, 90],
    [60, 90, 90, 120],
    [90, 120, 120, 150],
  ],
  complex: [
    [45, 60, 90, 90],
    [90, 90, 120, 120],
    [120, 120, 150, 150],
  ],
};

const dishRow = (dishes: number) => (dishes <= 2 ? 0 : dishes === 3 ? 1 : 2);
const peopleColumn = (people: number) => Math.min(3, Math.max(0, Math.ceil(people / 2) - 1));

export function recommendedMinutes({ complexity, dishes, people }: DialInputs): number {
  return TABLE[complexity][dishRow(dishes)]![peopleColumn(people)]!;
}

/** The shortest offered duration that covers the recommendation, else the longest one. */
export function recommendDuration(
  inputs: DialInputs,
  durations: readonly DurationOption[],
): DurationOption | null {
  if (durations.length === 0) return null;
  const sorted = durations.slice().sort((a, b) => a.minutes - b.minutes);
  const need = recommendedMinutes(inputs);
  return sorted.find((d) => d.minutes >= need) ?? sorted[sorted.length - 1]!;
}
