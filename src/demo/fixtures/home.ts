import type { HomeBannerVariant, HomeBannerViewModel, HomeViewModel } from '@features/home';

import {
  DEMO_DURATION_GUIDE,
  DEMO_DURATION_GUIDE_COLUMNS,
  DEMO_DURATION_GUIDE_TITLE,
} from './durationGuide';

/**
 * DEMO / TEST FIXTURES — NOT PRODUCTION DATA.
 *
 * Values are transcribed from `1:455` (pre-booking Home) and `59:520` (active-booking Home) so
 * the screens can be checked against the design. They are SAMPLE DATA, not rules: the ETA
 * headline, promo copy, tile copy and the duration guide are all server-owned content.
 */

const MARKETING: NonNullable<HomeViewModel['marketing']> = {
  cuisinesTitle: 'Cooks for every family and every need',
  cuisines: [
    { id: 'daily', label: 'Daily meals' },
    { id: 'north', label: 'North Indian dishes' },
    { id: 'south', label: 'South Indian dishes' },
    { id: 'asian', label: 'Chinese and Asian dishes' },
  ],
  reasonsTitle: 'Reasons to rely on Spoon cooks',
  // `135:71` — reading order is the frame's: Trained · Verified · Hygienic over
  // Reliable · Available · Compliant. Five of the six illustrations changed with the labels, so
  // the ids are now the labels themselves rather than the superseded glyph names.
  reasons: [
    { id: 'trained', label: 'Trained' },
    { id: 'verified', label: 'Verified' },
    { id: 'hygienic', label: 'Hygienic' },
    { id: 'reliable', label: 'Reliable' },
    { id: 'available', label: 'Available' },
    { id: 'compliant', label: 'Compliant' },
  ],
  durationGuideTitle: DEMO_DURATION_GUIDE_TITLE,
  durationGuideColumns: DEMO_DURATION_GUIDE_COLUMNS,
  durationGuide: DEMO_DURATION_GUIDE,
  exclusionsTitle: "What's not included?",
  exclusions: [
    { id: 'utensils', label: 'Stale utensil washing' },
    { id: 'stove', label: 'Deep stove cleaning' },
    { id: 'electronics', label: 'Using fancy electronics' },
    { id: 'kitchen', label: 'Cleaning entire kitchen' },
  ],
  promiseTitle: "Spoon's promise",
  promise: 'Cooking food tailored to your taste, needs and moods',
};

const HEADER = {
  etaHeadline: 'Spoon in 18 mins',
  addressLabel: 'Home',
  addressLine: 'E102, Purva Skydale, Silver Count…',
};

/**
 * Copy transcribed from `209:1242` / `209:1244` and `209:1251` / `209:1253`.
 *
 * The Instant subtitle is ONE paragraph in TWO styles — "Get a cook in" at SemiBold 12/16 and
 * " 18 mins" at Bold 14/20 — so the emphasis is carried as its own field, not inferred.
 */
const TILES: HomeViewModel['tiles'] = [
  {
    id: 'instant',
    title: 'Instant',
    subtitle: 'Get a cook in',
    subtitleEmphasis: ' 18 mins',
    tone: 'positive',
    icon: 'instant',
  },
  {
    id: 'scheduled',
    title: 'Schedule',
    subtitle: 'Plan your meal',
    tone: 'accent',
    icon: 'calendar',
  },
];

/**
 * Page 3a `1:455` — no booking in flight.
 *
 * No `promo` is supplied: the promo panels in Page 3a (`1:479`) are EMPTY colour fields. The
 * frame carries no artwork, copy or slide indicators, so supplying the previous design's
 * "Flat 50% OFF" copy here would render something the new source of truth does not contain.
 * The carousel renders its designed geometry regardless. DESIGN_PENDING.
 */
export const DEMO_HOME_PRE_BOOKING: HomeViewModel = {
  header: HEADER,
  tiles: TILES,
  activeBookings: [],
  marketing: MARKETING,
};

/**
 * The four presentations `338:4507` draws of the active-booking card, transcribed verbatim.
 *
 * `337:4284` "arriving" and `337:4307` "arrived" are identical in the frame, so ONE fixture
 * stands for both; the difference between them is a server status, not a drawing.
 */
/**
 * The destination each demo card claims.
 *
 * Transcribed rather than READ BACK from `@features/home`. Importing the table here made a cycle —
 * the home barrel exports `./data`, `./data` reaches these fixtures, and these fixtures reached the
 * barrel — which under CommonJS interop meant the fixture saw a half-initialised module and threw
 * `Cannot read properties of undefined (reading 'BANNER_DESTINATION_PAGE')` at import time, taking
 * two whole test suites down with it.
 *
 * The drift protection the import was there for is NOT lost: `homeBannerView.test.ts` asserts this
 * table equals `BANNER_DESTINATION_PAGE` entry for entry. A test may import feature internals;
 * production and fixture modules may not.
 */
const DEMO_DESTINATION_PAGE: Record<HomeBannerVariant, string> = {
  confirmed: '8a',
  reassignedConfirmed: '8b',
  cancelled: '8c',
  arriving: '9a/9b',
  reassignedArriving: '10a/10b',
  arrived: '11',
  live: '12a/12b',
  rate: '14a',
};

export const DEMO_BANNER_DESTINATION_PAGE = DEMO_DESTINATION_PAGE;

function destinationFor(variant: HomeBannerVariant): HomeBannerViewModel['destination'] {
  return {
    route: '/booking/[id]',
    bookingId: 'demo-booking-active',
    figmaPage: DEMO_DESTINATION_PAGE[variant],
  };
}

const ACTIVE_BOOKING_BASE = {
  bookingId: 'demo-booking-active',
  dateLabel: 'Tomorrow, Aug 5',
  timeLabel: '1:15 PM • 1 hr',
  cookName: 'Cook Asha',
} as const;

/** `337:4261` — booked, nothing in flight yet. */
export const DEMO_ACTIVE_BOOKING_CONFIRMED: HomeBannerViewModel = {
  ...ACTIVE_BOOKING_BASE,
  variant: 'confirmed',
  title: 'Upcoming booking',
  badgeValue: 'Confirmed!',
  destination: destinationFor('confirmed'),
};

/** `337:4284` / `337:4307` — the cook is on the way. */
export const DEMO_ACTIVE_BOOKING_ARRIVING: HomeBannerViewModel = {
  ...ACTIVE_BOOKING_BASE,
  variant: 'arriving',
  title: 'Arriving',
  badgeCaption: 'Arriving in',
  badgeValue: '12 mins',
  destination: destinationFor('arriving'),
};

/** `337:4330` — the service is running. */
export const DEMO_ACTIVE_BOOKING_TIME_LEFT: HomeBannerViewModel = {
  ...ACTIVE_BOOKING_BASE,
  variant: 'live',
  title: 'Live booking',
  badgeCaption: 'Time left',
  badgeValue: '42 mins',
  destination: destinationFor('live'),
};

/** `393:1072` — Spoon cancelled it. Keeps the normal cook block and a "Cancelled" badge, with the
 * apology row appended below (see `HomeBookingBanner`'s doc comment for the deliberate deviation
 * from `393:1072`'s literal drawing). */
export const DEMO_ACTIVE_BOOKING_CANCELLED: HomeBannerViewModel = {
  ...ACTIVE_BOOKING_BASE,
  variant: 'cancelled',
  title: 'Cancelled',
  badgeValue: 'Cancelled',
  notice: 'We sincerely apologize for cancelling this booking',
  destination: destinationFor('cancelled'),
};

/** `394:1210` — the same confirmed card after a reassignment; only the title changes. */
export const DEMO_ACTIVE_BOOKING_REASSIGNED: HomeBannerViewModel = {
  ...ACTIVE_BOOKING_BASE,
  variant: 'reassignedConfirmed',
  title: 'Reassigned',
  badgeValue: 'Confirmed!',
  destination: destinationFor('reassignedConfirmed'),
};

/** `337:4307` — arrived. The badge falls back to the status word; no arrival time is served. */
export const DEMO_ACTIVE_BOOKING_ARRIVED: HomeBannerViewModel = {
  ...ACTIVE_BOOKING_BASE,
  variant: 'arrived',
  title: 'Arrived',
  badgeCaption: 'Arrived at',
  badgeValue: 'Arrived',
  destination: destinationFor('arrived'),
};

/** `337:4495` — done, and open for a rating. */
export const DEMO_ACTIVE_BOOKING_RATE: HomeBannerViewModel = {
  ...ACTIVE_BOOKING_BASE,
  variant: 'rate',
  title: 'Share your rating!',
  badgeValue: 'Completed!',
  destination: destinationFor('rate'),
  rating: {
    description:
      'Reward the cook with a 5+ rating if the service exceeded your expectations & keep them motivated!',
  },
};

/** Page 3b `333:3834` — a booking is in flight, so the active-booking card is present. */
export const DEMO_HOME_ACTIVE_BOOKING: HomeViewModel = {
  header: HEADER,
  tiles: TILES,
  activeBookings: [DEMO_ACTIVE_BOOKING_ARRIVING],
  // Page 3b is Page 3a plus the active-booking card — the marketing stack remains.
  marketing: MARKETING,
};
