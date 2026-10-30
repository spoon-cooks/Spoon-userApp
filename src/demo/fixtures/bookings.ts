import type { BookingCardViewModel } from '@ui/types/viewModels';

/**
 * DEMO / TEST FIXTURES — NOT PRODUCTION DATA. See `./cooks.ts`.
 *
 * `statusLabel` / `statusTone` are the PRESENTATION values a screen would derive once a status
 * enum exists. They are not backend values, and no mapping is implied.
 */

export const DEMO_BOOKING_COMPLETED: BookingCardViewModel = {
  id: 'demo-booking-1',
  headline: '12th April • 1 hr',
  subtitle: 'Scheduled • 4:00 PM',
  statusLabel: 'Completed',
  statusTone: 'positive',
  cookName: 'Cook Asha',
  amount: '₹188',
  rating: 4.5,
};

export const DEMO_BOOKING_UNFULFILLED: BookingCardViewModel = {
  id: 'demo-booking-2',
  headline: '12th April • 1:15 PM',
  subtitle: 'Scheduled • 5:00 AM',
  statusLabel: 'Unfulfilled',
  statusTone: 'warning',
  cookName: 'Cook Asha',
  amount: '₹188',
};

/** Distinct from `DEMO_BOOKING_UNFULFILLED` — cancelled by the CUSTOMER, not by Spoon. Also the
 * `Instant` sample: `subtitle` names the slot type, never a time range, for either slot type. */
export const DEMO_BOOKING_CANCELLED: BookingCardViewModel = {
  id: 'demo-booking-cancelled',
  headline: '11th April • 1 hr',
  subtitle: 'Instant',
  statusLabel: 'Cancelled',
  statusTone: 'neutral',
  cookName: 'Cook Asha',
  amount: '₹188',
};

export const DEMO_BOOKING_CONFIRMED: BookingCardViewModel = {
  id: 'demo-booking-confirmed',
  headline: '12th September • 1 hr',
  subtitle: 'Scheduled • 4:00 PM',
  statusLabel: 'Confirmed',
  statusTone: 'info',
  cookName: 'Cook Asha',
  amount: '₹188',
};

export const DEMO_BOOKING_RESCHEDULED: BookingCardViewModel = {
  id: 'demo-booking-rescheduled',
  headline: '14th September • 1.5 hrs',
  subtitle: 'Scheduled • 11:00 AM',
  statusLabel: 'Rescheduled',
  statusTone: 'info',
  cookName: 'Cook Asha',
  amount: '₹188',
};

export const DEMO_REFUND_PROCESSING: BookingCardViewModel = {
  id: 'demo-refund-1',
  headline: '12th April • 1:15 PM',
  subtitle: 'Refund expected by 15th Apr',
  statusLabel: 'Processing',
  statusTone: 'warning',
  cookName: 'Cook Asha',
  amount: '₹188',
};

export const DEMO_REFUND_COMPLETED: BookingCardViewModel = {
  id: 'demo-refund-2',
  headline: '12th April • 1:15 PM',
  subtitle: 'Refund completed on 15th Apr',
  statusLabel: 'Refunded',
  statusTone: 'positive',
  cookName: 'Cook Asha',
  amount: '₹188',
};

/** Duration options as the Scheduled screen would receive them — opaque ids, server prices. */
export const DEMO_DURATION_OPTIONS = [
  { id: 'dur-30', label: '30 mins', price: '₹69', strikePrice: '₹150' },
  { id: 'dur-45', label: '45 mins', price: '₹99', strikePrice: '₹225' },
  { id: 'dur-60', label: '1 hr', price: '₹129', strikePrice: '₹300' },
  { id: 'dur-90', label: '1.5 hr', price: '₹189', strikePrice: '₹450' },
  { id: 'dur-120', label: '2 hr', price: '₹259', strikePrice: '₹600' },
  { id: 'dur-150', label: '2.5 hrs', price: '₹319', strikePrice: '₹750', disabled: true },
] as const;

/** Start-time slots. Availability is a server decision; `disabled` is simply rendered. */
export const DEMO_SLOT_OPTIONS = [
  { id: 'slot-0500', label: '05:00 AM', disabled: true },
  { id: 'slot-0515', label: '05:15 AM', disabled: true },
  { id: 'slot-0530', label: '05:30 AM' },
  { id: 'slot-0545', label: '05:45 AM' },
  { id: 'slot-0600', label: '06:00 AM' },
  { id: 'slot-0615', label: '06:15 AM' },
  { id: 'slot-0630', label: '06:30 AM' },
  { id: 'slot-0645', label: '06:45 AM' },
] as const;
