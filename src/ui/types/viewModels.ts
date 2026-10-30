/**
 * UI-only view models.
 *
 * These describe what a COMPONENT renders, not what a server returns. No backend contract exists,
 * so every field below is marked with the confirmation it still needs. When the contract lands,
 * the mapping layer lives in the feature modules — these types do not move to `core/api`.
 *
 * Two rules held throughout:
 *  1. Nothing here is computed by the client. Amounts, ETAs, statuses, availability and
 *     eligibility arrive pre-decided and pre-formatted.
 *  2. No personally-sensitive value is a component input. In particular there is deliberately
 *     NO phone number anywhere in this file — the call action is a callback, so a component can
 *     never render, log or leak a number.
 */

import type { DishGlyphKey } from '@ui/components/dishGlyphs';

/** A dish chip in the "What {name} cooks best?" grid. */
export interface DishViewModel {
  /** TODO(backend-contract): dish catalogue key. Names drift in Figma (`Gobi` vs `Gobhi`). */
  readonly id: string;
  readonly label: string;
  /**
   * Which mark from the bundled Figma set (`94:905`) to draw. Chosen by the DATA SOURCE — the
   * fixtures today, the backend later — never derived here from the label. See `dishGlyphs.ts`.
   */
  readonly glyph?: DishGlyphKey;
  /**
   * A per-cook glyph supplied by the server. Takes precedence over `glyph`, so the backend can
   * override the bundled catalogue without a client change.
   */
  readonly glyphUrl?: string;
}

/**
 * Trust indicators. Optional and independently rendered: the audit warns that every sample card
 * happens to show all three, which is NOT evidence that every cook has all three. None of them
 * may be hardcoded true.
 *
 * `289:7616` REPLACED the third badge: the clock ("On-time") is gone and the row now reads
 * Spoon Trained · Background Verified · **Hygienic**.
 *
 * TODO(backend-contract): field names and whether these are booleans or qualitative grades.
 */
export interface CookBadgesViewModel {
  readonly spoonTrained?: boolean;
  readonly backgroundVerified?: boolean;
  readonly hygienic?: boolean;
}

export interface CookViewModel {
  /** TODO(backend-contract): cook identifier. */
  readonly id: string;
  /** Rendered verbatim, e.g. "Cook Asha". TODO(backend-contract). */
  readonly displayName: string;
  /**
   * Used for the "What {firstName} cooks best?" heading, which MUST be interpolated: 6 of the 8
   * Figma cards read "What asha cooks best?" regardless of the cook (defect D-4).
   */
  readonly firstName: string;
  /** TODO(backend-contract): photo URL and any sizing parameters. */
  readonly photoUrl?: string;
  /**
   * The bundled photograph to draw if `photoUrl` FAILS TO LOAD, not if it is absent.
   *
   * Set only when `photoUrl` is a hosted URL, because that is the only case with anything behind
   * it: where the bundled asset is already the primary there is nothing to fall back to.
   */
  readonly photoFallbackUrl?: string;
  /** TODO(backend-contract): free text vs enum. */
  readonly gender?: string;
  readonly cuisine?: string;
  /** TODO(backend-contract): Figma disagrees with itself here — `Odisha` vs `Odiya` (D-5). */
  readonly homeState?: string;
  readonly languages?: readonly string[];
  /** Displayed when the card is in `standard` mode. */
  readonly specialties?: readonly DishViewModel[];
  /**
   * Displayed when the card is in `pureVeg` mode. Confirmed C-6: pure veg is a dish filter on the
   * SAME cook, not a separate roster — the two cards are identical apart from this list.
   * TODO(backend-contract): whether the server filters, or sends both lists.
   */
  readonly pureVegSpecialties?: readonly DishViewModel[];
  readonly badges?: CookBadgesViewModel;
  /**
   * The backend's veg/mixed presentation decision for THIS customer, from
   * `booking.cook.profileVariant`. `veg` renders the card's `pureVeg` mode, `mixed` (or absent,
   * for an older deployment) renders `standard` — the default the card has always drawn. It is
   * derived server-side from the customer's stored dietary preference and says nothing about
   * the cook; the client never re-derives it.
   */
  readonly profileVariant?: 'veg' | 'mixed';
}

/** Presentation tone for a status pill. Never a backend status value. */
export type StatusTone = 'neutral' | 'positive' | 'warning' | 'info' | 'danger';

export interface BookingCardViewModel {
  /** TODO(backend-contract): booking identifier. */
  readonly id: string;
  /** Pre-formatted card header, e.g. "12th April • 1 hr". TODO(backend-contract). */
  readonly headline: string;
  /** Secondary line: "Scheduled • 4:00 PM" or "Instant" on My bookings, "Refund expected by 15th
   * Apr" on Refunds. */
  readonly subtitle?: string;
  /**
   * Display text for the status pill — "Completed", "Cancelled", "Unfulfilled", "Confirmed",
   * "Rescheduled" on My bookings; "Processing", "Refunded" on Refunds, which still has no
   * drawn `Failed` state (D-15). The screen maps status → label + tone; the component never does.
   */
  readonly statusLabel?: string;
  readonly statusTone?: StatusTone;
  readonly cookName?: string;
  readonly cookPhotoUrl?: string;
  /** Pre-formatted, server-provided. Never computed here. TODO(backend-contract). */
  readonly amount?: string;
  /** Display-only. TODO(backend-contract): is this the rating the user gave, or the cook's? */
  readonly rating?: number;
  /** Active-booking variant: "Arriving in 18 mins". Server-provided; never computed. */
  readonly etaLabel?: string;
  /** Active-booking variant: "Duration: 60 mins". */
  readonly durationLabel?: string;
}
