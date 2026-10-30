import type { ImageSourcePropType } from 'react-native';

import type { FeaturedCookDto } from './api/featuredCooksApi';

/**
 * The redesigned Home's payload — the shape the Figma dev notes describe. Every field is
 * server-owned; the client only renders it and derives presentation from it (`state/`).
 *
 * TODO(backend-contract): no endpoint exists yet. `data.ts` serves fixtures from
 * `@/demo/fixtures/homeRedesign` until one does.
 */

export type Serviceability = 'live' | 'not_live';

/** What a tile shows for one booking type: the price, its struck anchor, and the GST total. */
export interface DurationTilePrice {
  readonly pricePaise: number;
  readonly mrpPaise: number | null;
  readonly payablePaise: number;
}

/** One carousel tile. Prices come from the API in paise and are never computed here. */
export interface DurationOption {
  readonly id: string;
  readonly minutes: number;
  readonly label: string;
  readonly pricePaise: number;
  readonly mrpPaise: number | null;
  /**
   * What "Book now" charges for this duration — the price plus GST, as the SERVER totals it.
   * The client never adds tax (see `@core/format/money`).
   */
  readonly payablePaise: number;
  /**
   * The tile's prices per booking type. The top-level three are the Scheduled ones; `forCta`
   * (`state/durations.ts`) swaps in Instant's while the CTA is "Book Now".
   */
  readonly bySlotType?: {
    readonly instant: DurationTilePrice;
    readonly scheduled: DurationTilePrice;
  };
  /** Server flag; one tile only. */
  readonly mostBooked?: boolean;
  /**
   * Bookable per mode: Now fails when no cook can arrive and stay that long, Later on slot
   * capacity. An unavailable tile stays in the track but cannot be selected or snapped to.
   */
  readonly available: { readonly now: boolean; readonly later: boolean };
  /** "Serves" — what fits in this duration. Announced to screen readers; not drawn yet. */
  readonly serves?: { readonly dishes: number; readonly people: number };
}

export interface PoolCook {
  readonly id: string;
  readonly name: string;
  /** A real cook's photo. Cooks without one are not rendered as beads (no placeholder faces). */
  readonly photo: ImageSourcePropType | null;
}

export interface RecurringPlan {
  readonly id: string;
}

export interface LiveHub {
  readonly id: string;
  readonly name: string;
}

export interface Waitlist {
  /** `null` until the backend publishes the pincode's demand — the meter is then hidden. */
  readonly countForPincode: number | null;
  readonly launchThreshold: number | null;
  readonly joined: boolean;
}

/**
 * `2240:5822` Home banner — one card per active booking. Only these three states reach Home:
 * cancelled bookings never do.
 */
export type ActiveBookingState = 'upcoming' | 'in_progress' | 'completed';

/** The card's backdrop, by the visit's start time: before 12:00, 12:00–17:00, after 17:00. */
export type ActiveBookingTimeOfDay = 'morning' | 'afternoon' | 'evening';

export interface ActiveBookingCard {
  /** Stable across refreshes, so a state change updates the card in place. */
  readonly key: string;
  /** The booking the card opens. */
  readonly bookingId: string;
  readonly type: 'recurring' | 'one_time';
  readonly state: ActiveBookingState;
  readonly timeOfDay: ActiveBookingTimeOfDay;
  /** "Today · 9:00 AM", "Tomorrow · 1:00 PM", "Wed, 14 Oct · 7:00 PM". */
  readonly whenLabel: string;
  /** "2" over "HRS", "45" over "MINS" — the booked time, extensions included. */
  readonly duration: { readonly value: string; readonly unit: string };
}

export interface HomeModel {
  readonly serviceability: Serviceability;
  /**
   * "Cooks you can trust" — `GET /v1/cooks/featured`, in the backend's order (DEC-114). Empty
   * (or absent) while it loads or if it failed: the section is then not drawn.
   */
  readonly featuredCooks?: readonly FeaturedCookDto[];
  /** `1625:11065` — "Label ⌄" over "Building_name · Flat/House #" (`null`: no such parts). */
  readonly address: {
    readonly label: string;
    readonly detail: string | null;
    readonly pincode: string;
  };
  readonly user: { readonly hasCompletedBooking: boolean };
  readonly instant: { readonly available: boolean; readonly etaMins: number | null };
  readonly durations: readonly DurationOption[];
  /** Per-duration pricing: six skeleton tiles while loading; retry (and no CTA) when it fails. */
  readonly pricingStatus?: 'ready' | 'loading' | 'error';
  /** The GST rate the tax dialog states, from config — never a literal in copy. */
  readonly tax: { readonly gstPercent: number };
  /** The tile the carousel opens centred on ("1 hr"); the front tile is also the selection. */
  readonly focusedDurationId: string;
  /** Returning users only; up to 6 beads. */
  readonly cookPool: readonly PoolCook[];
  readonly activeRecurringPlan: RecurringPlan | null;
  /**
   * The backend's own answer for the chip (`GET /v1/recurring/eligibility` `chip`). Absent until
   * that read lands; the chip then falls back to counting `cookPool`.
   */
  readonly recurringChip?: 'locked' | 'book' | 'live';
  /**
   * `2243:1120` Active bookings, in carousel order (in progress, upcoming by start, completed).
   * Absent or empty: the section is hidden.
   */
  readonly activeBookings?: readonly ActiveBookingCard[];
  /** Not-live only. */
  readonly liveHubs: readonly LiveHub[];
  readonly waitlist: Waitlist | null;
}

export type HomeVariant = 'default' | 'returning' | 'inactive';
