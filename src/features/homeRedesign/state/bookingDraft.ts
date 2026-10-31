import type { DishComplexity } from './recommendDuration';

export type BookingMode = 'now' | 'later' | 'recurring';

/**
 * Everything the customer has chosen on Home but not yet booked.
 *
 * `focusedDurationId` is the tile the carousel is centred on (scroll position);
 * `selectedDurationId` is the booking choice. They are independent: "1 hr" opens focused but NOT
 * selected, so the CTA stays disabled until a tap, and scrolling away from a selected tile keeps
 * the selection (the CTA then names it). A tap selects and centres; tapping the selected tile
 * does not deselect.
 *
 * Switching mode never touches the duration, so leaving Recurring restores what was chosen.
 */
export interface BookingDraft {
  readonly mode: BookingMode;
  readonly focusedDurationId: string;
  readonly selectedDurationId: string | null;
  readonly complexity: DishComplexity;
  readonly dishes: number;
  readonly people: number;
}

export const DISH_LIMITS = { min: 1, max: 5 } as const;
export const PEOPLE_LIMITS = { min: 1, max: 8 } as const;

export type DraftAction =
  | { type: 'setMode'; mode: BookingMode }
  | { type: 'focusDuration'; id: string }
  | { type: 'selectDuration'; id: string }
  | { type: 'clearSelection' }
  | { type: 'setComplexity'; complexity: DishComplexity }
  | { type: 'setDishes'; value: number }
  | { type: 'setPeople'; value: number };

export function initialDraft(input: {
  focusedDurationId: string;
  instantAvailable: boolean;
  mode?: BookingMode;
}): BookingDraft {
  const wanted = input.mode ?? 'now';
  return {
    // Without instant, "Now" cannot book, so the draft opens on "Later" instead.
    mode: wanted === 'now' && !input.instantAvailable ? 'later' : wanted,
    focusedDurationId: input.focusedDurationId,
    selectedDurationId: null,
    // The dial opens on Complex, 3 dishes, 4 people (owner, 31 Oct 2026; `1625:11215` drew 2).
    complexity: 'complex',
    dishes: 3,
    people: 4,
  };
}

const clamp = (value: number, { min, max }: { min: number; max: number }) =>
  Math.min(max, Math.max(min, Math.round(value)));

export function draftReducer(draft: BookingDraft, action: DraftAction): BookingDraft {
  switch (action.type) {
    case 'setMode':
      return draft.mode === action.mode ? draft : { ...draft, mode: action.mode };
    case 'focusDuration':
      if (draft.focusedDurationId === action.id) return draft;
      return { ...draft, focusedDurationId: action.id };
    case 'selectDuration':
      return { ...draft, focusedDurationId: action.id, selectedDurationId: action.id };
    case 'clearSelection':
      return draft.selectedDurationId === null ? draft : { ...draft, selectedDurationId: null };
    case 'setComplexity':
      return { ...draft, complexity: action.complexity };
    case 'setDishes':
      return { ...draft, dishes: clamp(action.value, DISH_LIMITS) };
    case 'setPeople':
      return { ...draft, people: clamp(action.value, PEOPLE_LIMITS) };
  }
}

/**
 * Which CTA the Book section shows (`1222:23630` / `1222:24656` / `1303:1333`):
 *
 *   book      Now with instant available — lime "Book now · ₹payable" → Razorpay, with the
 *             "Check payment details" link
 *   schedule  Later, or Now while instant is unavailable (same SKUs) — yellow "Schedule" → slot
 *             picker, duration carried over, no payment link
 *   none      Recurring hands off to the recurring block instead
 */
export type CtaKind = 'book' | 'schedule' | 'none';

export function ctaKind(mode: BookingMode, instantAvailable: boolean): CtaKind {
  if (mode === 'recurring') return 'none';
  return mode === 'now' && instantAvailable ? 'book' : 'schedule';
}

/** The CTA is live once a duration is selected — on Home, only by a tap or Help me pick. */
export function canBook(draft: BookingDraft): boolean {
  return draft.mode !== 'recurring' && draft.selectedDurationId !== null;
}
