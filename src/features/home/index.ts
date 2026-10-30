import { createKeyFactory } from '@core/query';

/**
 * Feature: home.
 *
 * Ruling R-2 — ONE route with booking-state variants:
 *   `1:455`    (390×1975) = the canonical complete Home
 *   `333:3834` (390×1975) = the SAME Home with `ActiveBookingCard` (`59:587`) inserted BELOW the
 *                           booking tiles, as its own section (`336:4260`)
 * These are NOT two routes and NOT two designs. Which variant renders is decided by authoritative
 * server state (is there an active booking?), never by a client guess.
 *
 * Ruling R-5 — upcoming/active booking information appears here for AT-A-GLANCE, live-tracking
 * purposes (ETA, arrival, in-service). The full list of every upcoming/past booking, any state,
 * lives on My bookings (`@features/history`) — a separate, complete listing, not a duplicate of
 * this curated carousel.
 *
 * Everything in the en-route card — ETA, cook name, duration — is dynamic backend data. The
 * client never computes an ETA.
 *
 * TODO(backend-contract): the active-booking query has no endpoint or payload yet.
 * TODO(design D-20): the two variants use different tile copy; one canonical pair is pending.
 */
export const homeKeys = createKeyFactory('home');

export { BANNER_DESTINATION_PAGE, homeBannerFor } from './state/homeBannerView';
export type {
  HomeBannerDestination,
  HomeBannerInput,
  HomeBannerRating,
  HomeBannerVariant,
  HomeBannerViewModel,
} from './state/homeBannerView';
export { useHomeData } from './data';
export { HomeBookingBanner } from './components/HomeBookingBanner';
export type { HomeBookingBannerProps } from './components/HomeBookingBanner';
export { HomeBookingCarousel } from './components/HomeBookingCarousel';
export type { HomeBookingCarouselProps } from './components/HomeBookingCarousel';
export { useLoopingCarousel } from './hooks/useLoopingCarousel';
export { HomeScreen, HomeView } from './screens/HomeScreen';
export type { HomeActions, HomeViewProps } from './screens/HomeScreen';
export type * from './types';
