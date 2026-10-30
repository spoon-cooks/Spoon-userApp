/**
 * Feature: homeRedesign — the new Home from Figma `cCQlzTeiObQkpVBzwI8mZi`.
 *
 * Wired to the live API (see `adapters.ts`) and routed at `/home`. Gaps with no endpoint yet are
 * empty by design; `@features/home` (the old Home) is no longer routed.
 */
export { HomeRedesignView } from './screens/HomeRedesignScreen';
export { TaxDetailsDialog } from './components/TaxDetailsDialog';
/** Home's duration carousel, shared with Schedule for Later (`2466:19028`). */
export { DurationCarousel } from '@ui/v2/DurationCarousel';
export type {
  BookingRequest,
  HomeRedesignActions,
  HomeRedesignViewProps,
} from './screens/HomeRedesignScreen';
export { useGuestHomeRedesignData, useHomeRedesignData } from './data';
export type { HomeRedesignData } from './data';
export { useJoinWaitlist, useWaitlistState } from './api/waitlistApi';
export type { WaitlistStateDto } from './api/waitlistApi';
export { GUEST_ADDRESS, guestHomeModelFrom, homeModelFrom } from './adapters';
export { resolveHomeVariant } from './state/variant';
export { joinWaitlist } from './state/waitlist';
export type { JoinWaitlistDeps, WaitlistChannel } from './state/waitlist';
export type { BookingMode } from './state/bookingDraft';
export type { RecurringTarget } from './state/recurring';
export type * from './types';
