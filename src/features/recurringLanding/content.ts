import type { ImageSourcePropType } from 'react-native';

import { COOK_ICON, EDIT_ICON, PAY_ICON, SCHEDULE_ICON } from './art';

/**
 * The landing's copy. It explains how the feature works rather than reporting anything, so it
 * ships with the app and is not backend data — like `STEPS` on the Cook Pool landing.
 */

/** `983:6032` — the hero's tagline, two lines. */
export const TAGLINE = 'Effortless · Reliable\nFlexible · Familiar';

/** One of the three sample bookings drawn as a ticket (`983:6039`). */
export interface SampleTicket {
  readonly day: string;
  readonly time: string;
  readonly duration: string;
  /** Degrees, clockwise: the tickets are scattered, not aligned. */
  readonly tilt: number;
  /** The slot's own height, which the tilt makes taller than the ticket's 72 (`983:6040` …). */
  readonly slotHeight: number;
  /** Space above the slot, so the three tilts share one row (`983:6042`). */
  readonly slotTop: number;
}

/** `983:6040`, `983:6042`, `983:6044`. */
export const SAMPLE_TICKETS: readonly SampleTicket[] = [
  { day: 'Tue', time: '10:00 AM', duration: '1.5 hr', tilt: 3, slotHeight: 77.658, slotTop: 0 },
  { day: 'Tues', time: '7:00 PM', duration: '1 hr', tilt: -2, slotHeight: 75.795, slotTop: 4 },
  { day: 'Sun', time: '11:00 AM', duration: '2 hr', tilt: 1, slotHeight: 73.909, slotTop: 0 },
];

/** One row of "One time planning, familiar cooks" (`983:6049`). */
export interface FeatureCopy {
  readonly title: string;
  readonly body: string;
  readonly icon: ImageSourcePropType;
  /** The glyph's size inside its 40pt disc. */
  readonly iconSize: number;
  /** Its offset in the disc, as drawn (the glyphs are not all centred). */
  readonly iconLeft: number;
  readonly iconTop: number;
}

/** `983:6050`, `983:6056`, `983:6057`, `983:6063` (copy as in `970:5435` / `970:5441`). */
export const FEATURES: readonly FeatureCopy[] = [
  {
    title: 'Schedule',
    body: 'Pick days, no. of visits, duration, and start time for weeks at once',
    icon: SCHEDULE_ICON,
    iconSize: 20,
    iconLeft: 10,
    iconTop: 9.53,
  },
  {
    title: 'Pay as you go',
    body: 'No upfront payment. Charged 3 hours before your first visit of the day through UPI AutoPay',
    icon: PAY_ICON,
    iconSize: 24,
    iconLeft: 8,
    iconTop: 8,
  },
  {
    title: 'On the go flexibility',
    body: 'Change of plans while Recurring is live? Cancel and book a ‘one-time’ service anytime',
    icon: EDIT_ICON,
    iconSize: 24,
    iconLeft: 8,
    iconTop: 7.53,
  },
  {
    title: 'No surprises',
    body: 'Your booking always prioritizes your preferred cooks from your Pool',
    icon: COOK_ICON,
    iconSize: 24,
    iconLeft: 8,
    iconTop: 7.53,
  },
];

/** `970:5450` — the explainer's heading before the video has been watched. */
export const EXPLAINER_HEADING = 'Plans, Visits, Cook Pool & more';
/** `970:5524` — and after: the video has covered them, so it stops listing them. */
export const EXPLAINER_HEADING_WATCHED = 'Plans, visits and more';
/** `970:5451`. */
export const EXPLAINER_SUBHEAD = 'See the whole flow in under 2 minutes.';
/** `970:5456`. */
export const EXPLAINER_TITLE = 'Understand Recurring';
/** `970:5457`. */
export const EXPLAINER_PROMPT = 'Tap to watch!';
/** `970:5531` — the design reads "Swipe to repwatch", a typo for "rewatch". */
export const EXPLAINER_WATCHED = 'Watched · Swipe to rewatch';
/** `970:5532`. */
export const EXPLAINER_COVERS = 'Under 2 mins · Covers Plans, Visits, Cook Pool and more!';
