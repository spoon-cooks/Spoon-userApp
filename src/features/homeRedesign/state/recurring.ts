import type { HomeModel } from '../types';

/** Below this many pooled cooks the chip reads "Check Recurring" instead of "Book Recurring". */
export const RECURRING_MIN_POOL = 2;

/** Beads shown on Home. */
export const MAX_POOL_BEADS = 6;

export type RecurringTarget = 'recurringFlow' | 'planTracker' | 'explainer';

export interface RecurringChip {
  readonly label: string;
  readonly target: RecurringTarget;
  /** `1290:1162` lime for a live plan or an eligible pool; `1290:1183` white + yellow hairline. */
  readonly tone: 'lime' | 'outline';
}

type RecurringInput = Pick<HomeModel, 'cookPool' | 'activeRecurringPlan' | 'recurringChip'>;

/**
 * The lime chip on the pool block:
 *   plan active            → "Recurring · Live" → plan tracker
 *   pool qualifies (≥ 2)   → "Book Recurring"   → recurring flow, via the landing (Home opens it)
 *   pool under 2           → "Check Recurring"  → explainer  (proposed in the dev note)
 *
 * The backend's `chip` (eligibility) decides when it has answered — its unlock threshold is policy,
 * not this file's constant. Until then the pool is counted locally.
 */
export function recurringChipFor(model: RecurringInput): RecurringChip {
  const chip = model.recurringChip;
  if (chip === 'live' || (chip === undefined && model.activeRecurringPlan !== null)) {
    return { label: 'Recurring · Live', target: 'planTracker', tone: 'lime' };
  }
  if (chip === 'book' || (chip === undefined && model.cookPool.length >= RECURRING_MIN_POOL)) {
    return { label: 'Book Recurring', target: 'recurringFlow', tone: 'lime' };
  }
  return { label: 'Check Recurring', target: 'explainer', tone: 'outline' };
}

/** Real cooks only, capped at six. A cook without a photo is never drawn as a placeholder face. */
export function poolBeads(model: Pick<HomeModel, 'cookPool'>): HomeModel['cookPool'] {
  return model.cookPool.filter((cook) => cook.photo !== null).slice(0, MAX_POOL_BEADS);
}
