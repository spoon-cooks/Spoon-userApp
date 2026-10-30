import type { AddressDto } from '@features/address';
import type { InstantAvailabilityDto } from '@features/availability';
import { durationIdFor, strikePaiseFor } from '@features/booking';
import type { BookingSummaryDto } from '@features/booking';
import { priceForSlot, type Catalogue } from '@features/catalogue';
import type { CookPoolListDto } from '@features/cookPool';
import type { RecurringEligibilityDto } from '@features/recurringSetup';
import type { FeaturedCookDto } from './api/featuredCooksApi';

import type {
  ActiveBookingCard,
  DurationOption,
  DurationTilePrice,
  HomeModel,
  LiveHub,
  PoolCook,
} from './types';

/**
 * Real responses → `HomeModel`. Pure, so every rule below is testable without a network.
 *
 * What is wired today, and from where:
 *   serviceability     the current address's `serviceability.status` (GET /v1/me/addresses)
 *   address            label; building · flat; pincode (same row)
 *   hasCompletedBooking  any `completed` row in GET /v1/me/bookings
 *   instant / ETA      GET /v1/availability/instant, one read per catalogue duration
 *   durations          GET /v1/catalogue — price, GST-inclusive total; MRP is the shared ₹5/min
 *                      anchor (`strikePaiseFor`), as the old Home drew it
 *   tax                catalogue `taxRateBps`
 *   cookPool           GET /v1/me/cooks, newest first — every pooled cook, paused ones included
 *                      (the pool's count is what unlocks Recurring, available or not)
 *   activeRecurringPlan / recurringChip
 *                      GET /v1/recurring/eligibility `liveBookings` and `chip`
 *   activeBookings     built by `activeBookingCardsFrom` (`activeBookings.ts`)
 *
 * TODO(backend-contract) — not available yet, so deliberately empty:
 *   mostBooked (no flag), serves (no field). The waitlist count comes from GET /v1/me/waitlist.
 */

function poolCookOf(row: CookPoolListDto['cooks'][number]): PoolCook {
  return {
    id: row.cook.cookId,
    name: row.cook.displayName,
    photo: row.cook.profileImageUrl === null ? null : { uri: row.cook.profileImageUrl },
  };
}

/** The dev note: map pins are static — HSR Layout and Haralur are the live hubs. */
export const STATIC_LIVE_HUBS: readonly LiveHub[] = [
  { id: 'hsr', name: 'HSR Layout' },
  { id: 'haralur', name: 'Haralur' },
];

/** The tile the carousel opens centred on, when the catalogue offers it. */
const FOCUS_MINUTES = 45;

/** "30 mins", "1 hr", "1.5 hrs", "2 hrs" — the redesign's own tile copy (`1555:10724`). */
export function homeDurationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} mins`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} ${hours === 1 ? 'hr' : 'hrs'}`;
}

/**
 * `1625:11069` — the header's second line, "Building_name · Flat/House #": the most specific
 * building part present, then the flat. `null` when the address carries neither.
 */
export function addressDetailOf(address: AddressDto): string | null {
  const building = [address.society, address.tower, address.street]
    .map((part) => part?.trim() ?? '')
    .find((part) => part.length > 0);
  const flat = address.flat?.trim() ?? '';
  const parts = [building ?? '', flat].filter((part) => part.length > 0);
  return parts.length === 0 ? null : parts.join(' · ');
}

/** One instant read per duration; `undefined` while it is still loading or it failed. */
export type InstantReads = ReadonlyMap<number, InstantAvailabilityDto | undefined>;

export interface HomeSources {
  /** `GET /v1/cooks/featured`; empty while it loads or if it failed. */
  readonly featuredCooks?: readonly FeaturedCookDto[];
  readonly address: AddressDto;
  readonly catalogue: Catalogue | undefined;
  readonly catalogueStatus: 'ready' | 'loading' | 'error';
  readonly instant: InstantReads;
  readonly history: readonly BookingSummaryDto[] | undefined;
  /** Joined in this session — shown at once, before the server's state is re-read. */
  readonly waitlistJoined: boolean;
  /** `GET /v1/me/waitlist`, or `undefined` while it loads or if it failed. */
  readonly waitlistState?: WaitlistServerState | undefined;
  /** `undefined` while loading or failed — Home then shows no beads. */
  readonly pool?: CookPoolListDto | undefined;
  /** `undefined` while loading or failed — the chip then counts the pool itself. */
  readonly recurring?: RecurringEligibilityDto | undefined;
  /** The Active bookings carousel, already built (`activeBookingCardsFrom`). */
  readonly activeBookings?: readonly ActiveBookingCard[];
  /**
   * Per duration in minutes, whether ANY start time is free on any of the next three days
   * (`GET /v1/availability/scheduled/overview`, DEC-094). Absent while it loads, if it failed, or
   * on a server without it: every Later tile then stays bookable, as before.
   */
  readonly later?: ReadonlyMap<number, boolean> | undefined;
}

/** The carousel's tiles, from the catalogue and whatever instant and Later reads have landed. */
function durationsFrom(
  catalogue: Catalogue | undefined,
  instant: InstantReads,
  later?: ReadonlyMap<number, boolean>,
): DurationOption[] {
  return (catalogue?.durations ?? [])
    .slice()
    .sort((a, b) => a.durationMinutes - b.durationMinutes)
    .map((d): DurationOption => {
      const tile = (slotType: 'instant' | 'scheduled'): DurationTilePrice => {
        const price = priceForSlot(d, slotType);
        return {
          pricePaise: price.serviceAmountPaise,
          mrpPaise: strikePaiseFor({
            durationMinutes: d.durationMinutes,
            serviceAmountPaise: price.serviceAmountPaise,
            strikePricePaise: price.strikePricePaise,
          }),
          payablePaise: price.totalAmountPaise,
        };
      };
      const scheduled = tile('scheduled');
      return {
        id: durationIdFor(d.durationMinutes),
        minutes: d.durationMinutes,
        label: homeDurationLabel(d.durationMinutes),
        // The Scheduled price by default; the screen swaps in `bySlotType.instant` for "Book Now".
        ...scheduled,
        bySlotType: { instant: tile('instant'), scheduled },
        available: {
          // Unknown (still loading, or the read failed) is treated as bookable: the booking
          // itself is the authoritative refusal, and greying every tile on a slow read is worse.
          now: instant.get(d.durationMinutes)?.available ?? true,
          // Free on any of the next three days (DEC-094). Unknown is bookable, as for Now.
          later: later?.get(d.durationMinutes) ?? true,
        },
      };
    });
}

function focusIdOf(durations: readonly DurationOption[]): string {
  const focus =
    durations.find((d) => d.minutes === FOCUS_MINUTES) ??
    durations[Math.floor(durations.length / 2)];
  return focus?.id ?? '';
}

export function homeModelFrom(sources: HomeSources): HomeModel {
  const { address, catalogue } = sources;
  const durations = durationsFrom(catalogue, sources.instant, sources.later);

  // Instant is "available" when any duration can go now; the ETA is the shortest such one's.
  const instantNow = durations
    .map((d) => sources.instant.get(d.minutes))
    .filter((read): read is InstantAvailabilityDto => read?.available === true);
  const first = instantNow[0];
  const instantKnown = durations.some((d) => sources.instant.get(d.minutes) !== undefined);

  const live = address.serviceability.status !== 'outside_service_area';
  // An active booking first; one still waiting on Autopay is live too (it holds its cooks).
  const liveBookings = sources.recurring?.liveBookings ?? [];
  const liveBooking = liveBookings.find((b) => b.status === 'active') ?? liveBookings[0];

  return {
    serviceability: live ? 'live' : 'not_live',
    featuredCooks: sources.featuredCooks ?? [],
    address: {
      label: address.label,
      detail: addressDetailOf(address),
      pincode: address.pincode,
    },
    user: {
      hasCompletedBooking: (sources.history ?? []).some((b) => b.status === 'completed'),
    },
    instant: {
      available: first !== undefined || !instantKnown,
      etaMins:
        first === undefined
          ? null
          : (first.projectedArrival?.etaMinutes ?? first.arrivalTargetMinutes),
    },
    durations,
    pricingStatus: sources.catalogueStatus,
    tax: { gstPercent: (catalogue?.taxRateBps ?? 0) / 100 },
    focusedDurationId: focusIdOf(durations),
    cookPool: (sources.pool?.cooks ?? []).map(poolCookOf),
    activeRecurringPlan: liveBooking === undefined ? null : { id: liveBooking.recurringBookingId },
    ...(sources.recurring === undefined ? {} : { recurringChip: sources.recurring.chip }),
    activeBookings: sources.activeBookings ?? [],
    liveHubs: live ? [] : STATIC_LIVE_HUBS,
    waitlist: live ? null : waitlistFrom(sources.waitlistJoined, sources.waitlistState),
  };
}

/**
 * The header a guest sees: there is no account, so no saved address. Tapping it asks them to
 * sign in, like every other action on guest Home.
 */
export const GUEST_ADDRESS: HomeModel['address'] = {
  label: 'Add address',
  detail: 'Set your delivery location',
  pincode: '',
};

/**
 * Home for a GUEST — a customer who skipped Login (iOS only, required by App Store review).
 *
 * Built from the catalogue alone, which `GET /v1/catalogue` serves without a token: the real
 * durations and prices. Everything else is per-account and absent — no address, so no
 * serviceability (treated as live: the guest has not said where they are yet) and no instant
 * reads (unknown, which the carousel treats as bookable; the booking is the real refusal). No
 * history, pool or plan, so the variant is always `default`.
 */
export function guestHomeModelFrom(sources: {
  readonly catalogue: Catalogue | undefined;
  readonly catalogueStatus: 'ready' | 'loading' | 'error';
  readonly featuredCooks?: readonly FeaturedCookDto[];
}): HomeModel {
  const durations = durationsFrom(sources.catalogue, new Map());
  return {
    serviceability: 'live',
    featuredCooks: sources.featuredCooks ?? [],
    address: GUEST_ADDRESS,
    user: { hasCompletedBooking: false },
    instant: { available: true, etaMins: null },
    durations,
    pricingStatus: sources.catalogueStatus,
    tax: { gstPercent: (sources.catalogue?.taxRateBps ?? 0) / 100 },
    focusedDurationId: focusIdOf(durations),
    cookPool: [],
    activeRecurringPlan: null,
    liveHubs: [],
    waitlist: null,
  };
}

/**
 * Home for a customer with NO saved address who was refused at a place (`1302:3539`, dev note
 * `2214:4364`: Not serviceable redirects to "Home page/ inactive pincode"). Nothing was saved, so
 * the header names the place they tried, the variant is `inactive`, and Notify me joins the
 * waitlist with no address. The lower sections render read-only, as for any inactive Home.
 */
export function triedPlaceHomeModelFrom(sources: {
  readonly place: {
    readonly title: string;
    readonly line: string;
    readonly locality: string | null;
  };
  readonly catalogue: Catalogue | undefined;
  readonly catalogueStatus: 'ready' | 'loading' | 'error';
  readonly waitlistJoined: boolean;
  readonly waitlistState?: WaitlistServerState | undefined;
}): HomeModel {
  const durations = durationsFrom(sources.catalogue, new Map());
  return {
    serviceability: 'not_live',
    address: {
      label: sources.place.title,
      detail: sources.place.line === '' ? null : sources.place.line,
      // No saved row, so no pincode: the card names the area instead ("You · Indiranagar").
      pincode: sources.place.locality ?? sources.place.title,
    },
    user: { hasCompletedBooking: false },
    instant: { available: false, etaMins: null },
    durations,
    pricingStatus: sources.catalogueStatus,
    tax: { gstPercent: (sources.catalogue?.taxRateBps ?? 0) / 100 },
    focusedDurationId: focusIdOf(durations),
    cookPool: [],
    activeRecurringPlan: null,
    liveHubs: STATIC_LIVE_HUBS,
    waitlist: waitlistFrom(sources.waitlistJoined, sources.waitlistState),
  };
}

/** The waitlist as `GET /v1/me/waitlist` states it; see `useWaitlistState`. */
export interface WaitlistServerState {
  readonly joined: boolean;
  readonly countForArea: number | null;
  readonly launchThreshold: number | null;
}

/**
 * Home's waitlist (`1302:3539`): joined if the server says so or the customer tapped Notify me in
 * this session. The meter counts the OTHER people waiting — the server's figure includes the
 * customer — and stays hidden (null) when nobody else is.
 */
export function waitlistFrom(
  joinedHere: boolean,
  state: WaitlistServerState | undefined,
): NonNullable<HomeModel['waitlist']> {
  const others =
    state?.countForArea === null || state === undefined ? null : state.countForArea - 1;
  return {
    countForPincode: others === null || others < 1 ? null : others,
    launchThreshold: state?.launchThreshold ?? null,
    joined: joinedHere || state?.joined === true,
  };
}
