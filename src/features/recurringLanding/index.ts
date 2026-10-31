/**
 * Feature: Recurring landing — the page that introduces recurring bookings and sends the customer
 * to plan them (the day picker, `recurringSetup`) or to build their Cook Pool first (`cookPool`).
 * It scrolls under a hero thread, offers its "schedule" button as a tag and then, once the tag has
 * scrolled away, as a sticky footer, and has an explainer video the customer can watch.
 */
export { RecurringLandingScreen } from './screens/RecurringLandingScreen';
export type { RecurringLandingScreenProps } from './screens/RecurringLandingScreen';
export type { ExplainerVideoSource } from './components/ExplainerPlayer';
export type { RecurringCta } from './components/ScheduleTag';
export { EXPLAINER_VIDEO_URL, useExplainerVideoSource } from './video';
