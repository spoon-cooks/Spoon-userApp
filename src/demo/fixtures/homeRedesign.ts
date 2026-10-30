import type { ImageSourcePropType } from 'react-native';

import type { DurationOption, HomeModel, PoolCook } from '@features/homeRedesign';

/**
 * DEMO / TEST FIXTURES — NOT PRODUCTION DATA.
 *
 * The redesigned Home's four Figma frames (`941:4884`, `1255:2973`, `1290:1280`, `1302:3539`) as
 * payloads, plus the edge cases their dev notes call out. Every value is sample data: prices,
 * the ETA, the pool and the waitlist numbers all belong to the server.
 */

const BEAD_A = require('../../../assets/figma/home2/bead-cook-3.png') as ImageSourcePropType;
const BEAD_B = require('../../../assets/figma/home2/bead-cook-1.png') as ImageSourcePropType;

/** `1222:23640` reads "Book now · ₹75" over a ₹69 tile: the payable total includes GST. */
const BOTH = { now: true, later: true } as const;

const DURATIONS: readonly DurationOption[] = [
  {
    id: 'd30',
    minutes: 30,
    label: '30 mins',
    pricePaise: 6900,
    mrpPaise: 15000,
    payablePaise: 7500,
    available: BOTH,
  },
  {
    id: 'd45',
    minutes: 45,
    label: '45 mins',
    pricePaise: 6900,
    mrpPaise: 15000,
    payablePaise: 7500,
    available: BOTH,
  },
  {
    id: 'd60',
    minutes: 60,
    label: '1 hr',
    pricePaise: 6900,
    mrpPaise: 15000,
    payablePaise: 7500,
    available: BOTH,
  },
  {
    id: 'd90',
    minutes: 90,
    label: '1.5 hrs',
    pricePaise: 6900,
    mrpPaise: 15000,
    payablePaise: 7500,
    available: BOTH,
  },
  {
    id: 'd120',
    minutes: 120,
    label: '2 hrs',
    pricePaise: 6900,
    mrpPaise: 15000,
    payablePaise: 7500,
    available: BOTH,
  },
  {
    id: 'd150',
    minutes: 150,
    label: '2.5 hrs',
    pricePaise: 6900,
    mrpPaise: 15000,
    payablePaise: 7500,
    available: BOTH,
  },
];

/** `1260:27817` draws the beads in this order: Cook 3, Cook 1, Cook 2, Cook 4, Cook 5, Cook 6. */
const POOL: readonly PoolCook[] = [
  { id: 'cook-3', name: 'Cook 3', photo: BEAD_A },
  { id: 'cook-1', name: 'Cook 1', photo: BEAD_B },
  { id: 'cook-2', name: 'Cook 2', photo: BEAD_A },
  { id: 'cook-4', name: 'Cook 4', photo: BEAD_A },
  { id: 'cook-5', name: 'Cook 5', photo: BEAD_A },
  { id: 'cook-6', name: 'Cook 6', photo: BEAD_A },
];

/** `941:4884` — live pincode, no booking history, no pool. */
export const DEMO_HOME_FIRST_TIME: HomeModel = {
  serviceability: 'live',
  address: { label: 'Label', detail: 'Building_name · Flat/House #', pincode: '560102' },
  user: { hasCompletedBooking: false },
  instant: { available: true, etaMins: 4 },
  durations: DURATIONS,
  tax: { gstPercent: 5 },
  focusedDurationId: 'd45',
  cookPool: [],
  activeRecurringPlan: null,
  liveHubs: [],
  waitlist: null,
};

/** `1255:2973` / `1290:1280` — a repeat customer with a full pool and no plan. */
export const DEMO_HOME_RETURNING: HomeModel = {
  ...DEMO_HOME_FIRST_TIME,
  user: { hasCompletedBooking: true },
  cookPool: POOL,
};

/** Returning, with a recurring plan running — the chip reads "Recurring · Live". */
export const DEMO_HOME_RETURNING_PLAN: HomeModel = {
  ...DEMO_HOME_RETURNING,
  activeRecurringPlan: { id: 'plan-1' },
};

/** Returning with one pooled cook — the chip reads "Check Recurring" and opens the explainer. */
export const DEMO_HOME_RETURNING_SMALL_POOL: HomeModel = {
  ...DEMO_HOME_RETURNING,
  cookPool: POOL.slice(0, 1),
};

/** Live pincode, instant unavailable — the draft opens on "Later" and "Now" cannot book. */
export const DEMO_HOME_NO_INSTANT: HomeModel = {
  ...DEMO_HOME_FIRST_TIME,
  instant: { available: false, etaMins: null },
};

/** `1302:3539` — pincode not live; the 133 / 296pt meter fill is 128 of a 285 threshold. */
export const DEMO_HOME_NOT_LIVE: HomeModel = {
  ...DEMO_HOME_FIRST_TIME,
  serviceability: 'not_live',
  address: { label: 'Label', detail: 'Building_name · Flat/House #', pincode: '5600XX' },
  instant: { available: false, etaMins: null },
  liveHubs: [
    { id: 'hsr', name: 'HSR Layout' },
    { id: 'haralur', name: 'Haralur' },
  ],
  waitlist: { countForPincode: 128, launchThreshold: 285, joined: false },
};

/** Not live, already on the waitlist — "Notify me" loads as "You're on the list". */
export const DEMO_HOME_NOT_LIVE_JOINED: HomeModel = {
  ...DEMO_HOME_NOT_LIVE,
  waitlist: { countForPincode: 129, launchThreshold: 285, joined: true },
};

/** Some durations cannot be booked: Now can't fit 2 or 2.5 hrs; Later has no 30-min slots. */
export const DEMO_HOME_SOME_UNAVAILABLE: HomeModel = {
  ...DEMO_HOME_FIRST_TIME,
  durations: DURATIONS.map((d) =>
    d.minutes >= 120
      ? { ...d, available: { now: false, later: true } }
      : d.minutes === 30
        ? { ...d, available: { now: true, later: false } }
        : d,
  ),
};

/** Per-duration pricing still loading — six skeleton tiles. */
export const DEMO_HOME_PRICING_LOADING: HomeModel = {
  ...DEMO_HOME_FIRST_TIME,
  pricingStatus: 'loading',
};

/** Pricing failed — a retry in place of the carousel, CTA disabled. */
export const DEMO_HOME_PRICING_ERROR: HomeModel = {
  ...DEMO_HOME_FIRST_TIME,
  pricingStatus: 'error',
};

/** `2243:973` — one booking: a single static card, no count, no "View all", no dots. */
export const DEMO_HOME_ACTIVE_ONE: HomeModel = {
  ...DEMO_HOME_RETURNING,
  activeBookings: [
    {
      key: 'booking:b-1',
      bookingId: 'b-1',
      type: 'recurring',
      state: 'upcoming',
      timeOfDay: 'morning',
      whenLabel: 'Wed, 14 Oct · 9:00 AM',
      duration: { value: '2', unit: 'HRS' },
    },
  ],
};

/** `2243:1120` / `2240:6334` — three bookings: In progress, then Upcoming soonest first. */
export const DEMO_HOME_ACTIVE: HomeModel = {
  ...DEMO_HOME_RETURNING,
  activeBookings: [
    {
      key: 'booking:b-1',
      bookingId: 'b-1',
      type: 'one_time',
      state: 'in_progress',
      timeOfDay: 'morning',
      whenLabel: 'Today · 9:00 AM',
      duration: { value: '2', unit: 'HRS' },
    },
    {
      key: 'booking:b-2',
      bookingId: 'b-2',
      type: 'one_time',
      state: 'upcoming',
      timeOfDay: 'afternoon',
      whenLabel: 'Wed, 14 Oct · 1:00 PM',
      duration: { value: '2', unit: 'HRS' },
    },
    {
      key: 'booking:b-7',
      bookingId: 'b-7',
      type: 'recurring',
      state: 'upcoming',
      timeOfDay: 'evening',
      whenLabel: 'Wed, 14 Oct · 7:00 PM',
      duration: { value: '2', unit: 'HRS' },
    },
  ],
};

/** Every card state on every backdrop: Completed, and In progress on the dark evening card. */
export const DEMO_HOME_ACTIVE_STATES: HomeModel = {
  ...DEMO_HOME_RETURNING,
  activeBookings: [
    {
      key: 'booking:b-3',
      bookingId: 'b-3',
      type: 'recurring',
      state: 'in_progress',
      timeOfDay: 'evening',
      whenLabel: 'Today · 7:00 PM',
      duration: { value: '2', unit: 'HRS' },
    },
    {
      key: 'booking:b-4',
      bookingId: 'b-4',
      type: 'one_time',
      state: 'completed',
      timeOfDay: 'morning',
      whenLabel: 'Mon, 12 Oct · 9:00 AM',
      duration: { value: '45', unit: 'MINS' },
    },
    {
      key: 'booking:b-5',
      bookingId: 'b-5',
      type: 'recurring',
      state: 'completed',
      timeOfDay: 'afternoon',
      whenLabel: 'Mon, 12 Oct · 1:00 PM',
      duration: { value: '1.5', unit: 'HRS' },
    },
    {
      key: 'booking:b-6',
      bookingId: 'b-6',
      type: 'one_time',
      state: 'completed',
      timeOfDay: 'evening',
      whenLabel: 'Mon, 12 Oct · 7:00 PM',
      duration: { value: '1', unit: 'HR' },
    },
  ],
};
