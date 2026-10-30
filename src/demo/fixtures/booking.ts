import {
  DEMO_DURATION_GUIDE,
  DEMO_DURATION_GUIDE_COLUMNS,
  DEMO_DURATION_GUIDE_TITLE,
  DEMO_HELP_ME_PICK_LABEL,
} from './durationGuide';

import type {
  BookingDetailViewModel,
  ExtensionViewModel,
  InstantViewModel,
} from '@features/booking';
import type { ScheduleViewModel } from '@features/scheduled';
import { RATING_EXCEPTIONAL } from '@ui';

import { DEMO_COOK_ASHA, DEMO_COOK_MEERA } from './cooks';

/**
 * DEMO / TEST FIXTURES — NOT PRODUCTION DATA.
 *
 * Transcribed from the audited frames. Every price, slot, duration, ETA and OTP here is SAMPLE
 * DATA standing in for a server payload — none of it is a rule, a default or a constant. In
 * particular the three days below are not a booking horizon (blocker B-8), and the disabled
 * slots are not an availability rule.
 */

/** `1:728` Instant sheet — available. */
export const DEMO_INSTANT_AVAILABLE: InstantViewModel = {
  title: 'Instant',
  etaCaption: 'Arriving in',
  etaLabel: '18 mins',
  // `381:286` / `381:287` - the Duration label row and its "Help me pick" link.
  durationSectionTitle: 'Duration',
  durationHelp: {
    label: DEMO_HELP_ME_PICK_LABEL,
    heading: DEMO_DURATION_GUIDE_TITLE,
    columns: DEMO_DURATION_GUIDE_COLUMNS,
    rows: DEMO_DURATION_GUIDE,
  },
  durations: [
    { id: 'dur-30', label: '30 min', price: '₹69', strikePrice: '₹150' },
    { id: 'dur-45', label: '45 min', price: '₹99', strikePrice: '₹225' },
    { id: 'dur-60', label: '1 hr', price: '₹129', strikePrice: '₹300' },
    { id: 'dur-90', label: '1.5 hr', price: '₹189', strikePrice: '₹450' },
    { id: 'dur-120', label: '2 hr', price: '₹259', strikePrice: '₹600' },
    { id: 'dur-150', label: '2.5 hrs', price: '₹319', strikePrice: '₹750', disabled: true },
  ],
  /**
   * The UNPRICED label. `1:728` draws "Book NOW • ₹198" because the frame has a duration
   * selected; the amount is never this file's to state. `useInstantData` appends the QUOTE's
   * total when one exists, and until then the CTA says what it can honestly say (task §30).
   */
  ctaLabel: 'Book NOW',
  paymentDetailsLabel: 'Check payment details',
  taxesInfo: {
    title: 'What is Taxes?',
    body: 'Taxes levied as per Govt. regulations, subject to change basis final service value. This includes a 2.5% CGST and 2.5% SGST.',
  },
};

/** `25:1327` Instant — outside serving hours. */
export const DEMO_INSTANT_OUT_OF_SHIFT: InstantViewModel = {
  ...DEMO_INSTANT_AVAILABLE,
  unavailable: {
    icon: 'moon',
    message: 'Slots open at 6 AM today',
    ctaLabel: 'Schedule NOW',
    ctaTone: 'primary',
  },
};

/**
 * `44:5378` Instant — no slots.
 *
 * Both blocked frames were re-read against `fsgGIC4c6DJulb64TTt9yg`: the message is two lines of
 * its own copy (not "Sorry, all sold out!"), and BOTH frames draw the same **yellow** "Schedule
 * NOW" bar — the lime `accent` tone this state used to carry is not in the finalized section.
 */
export const DEMO_INSTANT_NO_SLOTS: InstantViewModel = {
  ...DEMO_INSTANT_AVAILABLE,
  unavailable: {
    icon: 'calendar',
    message: 'Instant slots are unavailable, but schedule ones are!',
    ctaLabel: 'Schedule NOW',
    ctaTone: 'primary',
  },
};

const PERIODS = [
  { id: 'morning', label: 'Morning', icon: 'sunrise' as const },
  { id: 'afternoon', label: 'Afternoon', icon: 'sun' as const },
  { id: 'evening', label: 'Evening', icon: 'moon' as const },
];

function slots(prefix: string, labels: readonly string[], disabledLabels: readonly string[] = []) {
  return labels.map((label) => ({
    id: `${prefix}-${label.replace(/[^0-9A-Za-z]/g, '')}`,
    label,
    ...(disabledLabels.includes(label) ? { disabled: true } : {}),
  }));
}

/**
 * Start-time grids transcribed from `34:3035` (morning), `34:1919` (noon) and `34:2105` (evening).
 *
 * These are SAMPLE PAYLOADS, not generated sequences — the client neither derives times from a
 * period range nor decides which are unavailable; both are server data (see ScheduleViewModel).
 * The three frames publish their own ranges: 05:00–11:45 AM, 12:00–04:45 PM and 05:00–09:00 PM.
 *
 * Two recorded design defects are NOT reproduced, because copying them would ship bad data:
 *  - **D-1** — `34:3035`'s 6 AM row reads `06:00 · 06:30 · 06:30 · 06:45`; `06:15` is written here.
 *    Still present in the new file, so the defect stands.
 *  - **D-2** — `34:2105` still carries four AFTERNOON chips (`12:30 · 12:45 · 01:30 · 01:45`)
 *    inside the evening grid. The evening range is written out as the audit already rules it.
 * The disabled pattern in each grid IS transcribed verbatim from its frame.
 */
const SLOTS_BY_PERIOD = {
  morning: slots(
    'am',
    [
      '05:00 AM',
      '05:15 AM',
      '05:30 AM',
      '05:45 AM',
      '06:00 AM',
      '06:15 AM',
      '06:30 AM',
      '06:45 AM',
      '07:00 AM',
      '07:15 AM',
      '07:30 AM',
      '07:45 AM',
      '08:00 AM',
      '08:15 AM',
      '08:30 AM',
      '08:45 AM',
      '09:00 AM',
      '09:15 AM',
      '09:30 AM',
      '09:45 AM',
      '10:00 AM',
      '10:15 AM',
      '10:30 AM',
      '10:45 AM',
      '11:00 AM',
      '11:15 AM',
      '11:30 AM',
      '11:45 AM',
    ],
    ['05:00 AM', '05:15 AM', '07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM'],
  ),
  afternoon: slots(
    'pm',
    [
      '12:00 PM',
      '12:15 PM',
      '12:30 PM',
      '12:45 PM',
      '01:00 PM',
      '01:15 PM',
      '01:30 PM',
      '01:45 PM',
      '02:00 PM',
      '02:15 PM',
      '02:30 PM',
      '02:45 PM',
      '03:00 PM',
      '03:15 PM',
      '03:30 PM',
      '03:45 PM',
      '04:00 PM',
      '04:15 PM',
      '04:30 PM',
      '04:45 PM',
    ],
    [
      '12:00 PM',
      '12:15 PM',
      '02:00 PM',
      '02:30 PM',
      '02:45 PM',
      '03:00 PM',
      '03:30 PM',
      '03:45 PM',
      '04:00 PM',
      '04:30 PM',
      '04:45 PM',
    ],
  ),
  evening: slots(
    'eve',
    [
      '05:00 PM',
      '05:15 PM',
      '05:30 PM',
      '05:45 PM',
      '06:00 PM',
      '06:15 PM',
      '06:30 PM',
      '06:45 PM',
      '07:00 PM',
      '07:15 PM',
      '07:30 PM',
      '07:45 PM',
      '08:00 PM',
      '08:15 PM',
      '08:30 PM',
      '08:45 PM',
      '09:00 PM',
    ],
    [
      '05:00 PM',
      '05:15 PM',
      '07:00 PM',
      '07:30 PM',
      '07:45 PM',
      '08:00 PM',
      '08:30 PM',
      '08:45 PM',
      '09:00 PM',
    ],
  ),
};

/** `37:*` / `34:*` — Schedule. */
export const DEMO_SCHEDULE_BOOK: ScheduleViewModel = {
  mode: 'book',
  title: 'Schedule',
  sectionTitles: { day: 'Day', time: 'Time', duration: 'Duration', startTime: 'Start time' },
  days: [
    { id: 'day-1', caption: 'Today', label: 'Aug 5' },
    { id: 'day-2', caption: 'Tomorrow', label: 'Aug 6' },
    { id: 'day-3', caption: 'Fri', label: 'Aug 7' },
  ],
  periods: PERIODS,
  /**
   * `34:3102` — the Scheduled duration grid draws the SAME six options as Instant but with no
   * "Popular" badge and nothing disabled. Badges and disabled flags are server data (§15); this
   * is sample data matching the finalized frame, not a rule.
   */
  durations: [
    { id: 'dur-30', label: '30 mins', price: '₹69', strikePrice: '₹150' },
    { id: 'dur-45', label: '45 mins', price: '₹99', strikePrice: '₹225' },
    { id: 'dur-60', label: '1 hr', price: '₹129', strikePrice: '₹300' },
    { id: 'dur-90', label: '1.5 hr', price: '₹189', strikePrice: '₹450' },
    { id: 'dur-120', label: '2 hr', price: '₹259', strikePrice: '₹600' },
    { id: 'dur-150', label: '2.5 hr', price: '₹319', strikePrice: '₹750' },
  ],
  slotsByPeriod: SLOTS_BY_PERIOD,
  // Sample data stands in for an answered read, so the fixture renders the grid rather than the
  // not-yet-loaded state. The wired screen overwrites this from the availability query.
  slotsPending: false,
  /**
   * The UNPRICED label, which is exactly what `275:4488` / `275:4713` / `275:4938` draw while the
   * selection is incomplete. `275:4177` adds the amount once it is complete, and that amount is
   * the server quote's — supplied by the route, never transcribed here.
   */
  primaryCtaLabel: 'Book Now',
  paymentDetailsLabel: 'Check payment details',
};

/** `47:*` — Reschedule: same screen, no Duration section, no price on the bar (C-2/C-3). */
export const DEMO_SCHEDULE_RESCHEDULE: ScheduleViewModel = {
  mode: 'reschedule',
  title: 'Reschedule',
  sectionTitles: DEMO_SCHEDULE_BOOK.sectionTitles,
  days: DEMO_SCHEDULE_BOOK.days,
  periods: PERIODS,
  slotsByPeriod: SLOTS_BY_PERIOD,
  slotsPending: false,
  primaryCtaLabel: 'Reschedule',
};

/** Ruling R-3: the server says the single reschedule has been used. */
export const DEMO_SCHEDULE_RESCHEDULE_BLOCKED: ScheduleViewModel = {
  ...DEMO_SCHEDULE_RESCHEDULE,
  blockedMessage: 'This booking has already been rescheduled once.',
};

const HEADER = {
  headerTitle: 'Home',
  headerSubtitle: 'E102, Purva Skydale, Silver Count…',
  helpLabel: 'Help',
};

/** `3:1041` Confirmation. */
export const DEMO_BOOKING_CONFIRMATION: BookingDetailViewModel = {
  ...HEADER,
  view: 'confirmation',
  cook: DEMO_COOK_ASHA,
  statusTone: 'positive',
  summary: {
    bannerTitle: 'Booking confirmed!',
    // `250:2951` — pre-formatted by the server. The client never assembles this from `rows`.
    scheduleLine: 'Today, Aug 5 • 12:00 PM • 1 hr',
    rows: [
      // Each row carries its own weight; the emphasis level IS the design, not decoration.
      // `3:1041` no longer draws these inline — they render on `250:2861` Booking details.
      { label: 'Date', value: 'Today, Aug 5' },
      { label: 'Start time', value: '5:30 PM', emphasis: 'hero' },
      { label: 'Duration', value: '1 hr' },
      { label: 'End Time', value: '8:00 PM', emphasis: 'quiet' },
      { label: 'Total', value: '₹135', emphasis: 'total' },
    ],
    // `250:2947` / `250:2948`.
    note: {
      title: 'Note before starting',
      body: 'Please approve gate entry, ensure groceries and gas are available before cook’s arrival to avoid disrupted, extended service and related charges.',
    },
    // `250:2969`.
    // `383:747` - NEW on `8a` / `8b`, beside the details row.
    shareRecipeLabel: 'Share recipe/ special requests',
    viewDetailsLabel: 'View booking details',
    // `250:2982` / `250:2980` — the current file shortens both to a single word.
    rescheduleLabel: 'Reschedule',
    cancelLabel: 'Cancel',
    rescheduleAllowed: true,
  },
  /**
   * `250:2861` — NEW. Every figure is a pre-formatted server string; nothing here is derived.
   * "Taxes @5%" is the server's LABEL, not a rate the client applies, and ₹198 is the server's
   * total, not 189 + 9 computed on the device.
   */
  details: {
    title: 'Booking details',
    bookingSectionTitle: 'Booking details',
    bookingRows: [
      { label: 'Date', value: 'Today, Aug 5' },
      { label: 'Start time', value: '5:30 PM' },
      { label: 'Duration', value: '1 hr' },
      { label: 'End Time', value: '8:00 PM', emphasis: 'quiet' },
    ],
    paymentSectionTitle: 'Payment details',
    paymentRows: [
      { label: 'Booking amount', value: '₹189' },
      { label: 'Taxes @5%', value: '₹9' },
      { label: 'Total paid', value: '₹198' },
    ],
  },
};

/**
 * `289:6607` "Page 8b- Confirm reassign" — Confirmation plus the `292:201` notice.
 *
 * The frame also omits the details row on this variant; that is treated as a designer omission,
 * so the payload still carries the sheet and the row still renders.
 */
export const DEMO_BOOKING_CONFIRM_REASSIGN: BookingDetailViewModel = {
  ...DEMO_BOOKING_CONFIRMATION,
  cook: DEMO_COOK_MEERA,
  summary: {
    ...DEMO_BOOKING_CONFIRMATION.summary!,
    reassignNotice: {
      title: 'Apologies, we have assigned you another cook',
      body: 'We had to reassign your booking to another cook due to operational reasons with the previously assigned cook',
    },
  },
};

const TRACKING_ON_TIME = {
  // `40:5364` — the current file ends this on "in", because the ETA panel completes the sentence.
  bannerTitle: 'Cook Asha is arriving in',
  bannerMessage: 'The cook will reach your location on time!',
  tone: 'positive',
  etaLabel: '16 mins',
  noteTitle: 'Note before starting',
  noteBody:
    "Please approve gate entry and ensure groceries and gas are available before cook's arrival to avoid disrupted, extended service and related charges.",
  // `292:237` / `292:243` / `292:245` — En route now draws the details row and the action pair.
  // `383:747` - NEW on `8a` / `8b`, beside the details row.
  shareRecipeLabel: 'Share recipe/ special requests',
  viewDetailsLabel: 'View booking details',
  cancelLabel: 'Cancel',
  rescheduleLabel: 'Reschedule',
  rescheduleAllowed: true,
} as const;

/** `3:1381` En route — on time. */
export const DEMO_BOOKING_EN_ROUTE: BookingDetailViewModel = {
  ...HEADER,
  details: DEMO_BOOKING_CONFIRMATION.details!,
  view: 'enRoute',
  cook: DEMO_COOK_ASHA,
  tracking: TRACKING_ON_TIME,
};

/** `99:1413` En route — late. Two properties differ; the SERVER decides which is shown. */
export const DEMO_BOOKING_EN_ROUTE_LATE: BookingDetailViewModel = {
  ...HEADER,
  details: DEMO_BOOKING_CONFIRMATION.details!,
  view: 'enRoute',
  cook: DEMO_COOK_ASHA,
  tracking: {
    ...TRACKING_ON_TIME,
    bannerMessage: "We're sorry for the delay, the cook is running late",
    tone: 'warning',
    etaLabel: '21 mins',
  },
};

/**
 * `201:100` Page 8c — Reassigned, on time. Structurally En route plus the `208:553` notice.
 *
 * The copy is the frame's, typos included, so the discrepancy stays visible to design rather than
 * being silently corrected here (defect D-22).
 */
const REASSIGNMENT_NOTICE = {
  // `208:558` / `208:559` — the current file rewrote both lines.
  title: 'Apologies, we have assigned you another cook',
  body: 'We had to reassign your booking to another cook due to operational reasons with the previously assigned cook',
} as const;

export const DEMO_BOOKING_REASSIGNED: BookingDetailViewModel = {
  ...HEADER,
  details: DEMO_BOOKING_CONFIRMATION.details!,
  view: 'reassigned',
  cook: DEMO_COOK_ASHA,
  reassigned: {
    ...TRACKING_ON_TIME,
    bannerTitle: 'Cook Kavita is arriving',
    etaLabel: '21 mins',
    notice: REASSIGNMENT_NOTICE,
  },
};

/** `209:747` Page 8d — the same state at `tone: 'warning'`. The SERVER picks the tone. */
export const DEMO_BOOKING_REASSIGNED_LATE: BookingDetailViewModel = {
  ...HEADER,
  details: DEMO_BOOKING_CONFIRMATION.details!,
  view: 'reassigned',
  cook: DEMO_COOK_ASHA,
  reassigned: {
    ...TRACKING_ON_TIME,
    bannerTitle: 'Cook Kavita is arriving',
    bannerMessage: "We're sorry for the delay, the cook is running late",
    tone: 'warning',
    etaLabel: '21 mins',
    notice: REASSIGNMENT_NOTICE,
  },
};

/**
 * `201:278` Page 8e — Auto cancelled. A terminal state.
 *
 * `refundAmount` is a SUPPLIED value. It deliberately is not `Total` minus anything: the client
 * never computes a refund (task §10, FRONTEND_FOUNDATION_PLAN.md §20).
 */
export const DEMO_BOOKING_AUTO_CANCELLED: BookingDetailViewModel = {
  ...HEADER,
  view: 'autoCancelled',
  autoCancelled: {
    title: 'This booking has been cancelled',
    rows: [
      { label: 'Date', value: 'Today, Aug 5' },
      { label: 'Start time', value: '5:30 PM', emphasis: 'hero' },
      { label: 'Duration', value: '1 hr' },
      { label: 'Total', value: '₹135', emphasis: 'total' },
    ],
    apologyTitle: 'We sincerely apologize for cancelling this booking',
    apologyBody:
      'We regret that we could not serve you this time due to operational constraints & sincerely apologize for related inconveniences caused.',
    refundTitle: 'Amount shall be refunded to original source',
    refundBody:
      'The amount paid against this booking shall be refunded back to your source. And we promise to not let you down again!',
    refundAmountLabel: 'Refund Amount',
    refundAmount: '₹135',
    refundDestination: 'Refund to original payment source',
    refundTimeframe: 'Takes 5-7 business days',
    rebookPrompt: 'Give us another chance, book again!',
    rebookAcceptLabel: 'Yes',
    rebookDeclineLabel: 'No',
  },
};

/**
 * `606:4895` "Page 8d- User cancelled" — the customer's own cancellation. A terminal state.
 *
 * No apology and no rebook prompt: the frame draws neither, unlike `201:278`. `refundAmount` is a
 * SUPPLIED value for the same reason `DEMO_BOOKING_AUTO_CANCELLED`'s is — the client never
 * computes a refund (task §10, FRONTEND_FOUNDATION_PLAN.md §20).
 */
export const DEMO_BOOKING_CUSTOMER_CANCELLED: BookingDetailViewModel = {
  ...HEADER,
  view: 'customerCancelled',
  customerCancelled: {
    title: 'You cancelled this booking',
    rows: [
      { label: 'Date', value: 'Today, Aug 5' },
      { label: 'Start time', value: '5:30 PM' },
      { label: 'Duration', value: '1 hr' },
      { label: 'End Time', value: '8:00 PM' },
    ],
    detailsTitle: 'Booking details',
    refundTitle: 'Amount shall be refunded to original source',
    refundBody:
      'The amount paid against this booking shall be refunded back to your source. And we promise to not let you down again!',
    refundAmountLabel: 'Refund Amount',
    refundAmount: '₹135',
    refundDestination: 'Refund to original payment source',
    refundTimeframe: 'Takes 5-7 business days',
  },
};

/** `3:1658` Arrived. */
export const DEMO_BOOKING_ARRIVED: BookingDetailViewModel = {
  ...HEADER,
  details: DEMO_BOOKING_CONFIRMATION.details!,
  view: 'arrived',
  cook: DEMO_COOK_ASHA,
  arrived: {
    bannerTitle: 'Cook Asha has arrived',
    bannerMessage: 'The cook will be at your doorstep very soon!',
    tone: 'positive',
    // `99:1620` — once the cook has ARRIVED the panel stops counting down and shows a clock time.
    // Still a server string; the client neither formats it nor derives it from the countdown.
    etaLabel: '11:55 am',
    noteTitle: 'Note before starting',
    noteBody:
      "Please ensure groceries and gas are available before cook's arrival to avoid any extension or related charges.",
    viewDetailsLabel: 'View booking details',
    // `3:1658` draws no action pair; the labels are carried so the shape stays uniform.
    cancelLabel: 'Cancel',
    rescheduleLabel: 'Reschedule',
    startCtaLabel: 'Start Service',
    otpTitle: 'Start OTP',
    otpCaption: 'Share this to start the service',
    otpCode: '111',
  },
};

/**
 * `101:1812` In service.
 *
 * `endsAtMs` must be an ABSOLUTE server timestamp — the countdown renders it and corrects for
 * clock skew (FRONTEND_FOUNDATION_PLAN.md §19). The factory takes `nowMs` so the development
 * sample is live rather than a stale module-load constant; a real payload supplies the value.
 */
export function demoInServiceBooking(
  nowMs: number,
  remainingMs = 48 * 60 * 1000,
): BookingDetailViewModel {
  return {
    ...HEADER,
    details: DEMO_BOOKING_CONFIRMATION.details!,
    view: 'inService',
    cook: DEMO_COOK_ASHA,
    inService: {
      // `101:1887` / `101:1889` — the current file rewrote both. The message dropped from two
      // lines (h 32) to one (h 16), which is why the h1 block closed 35 → 19.
      statusTitle: 'Time left to service end',
      statusMessage: 'Cooking in progress',
      /*
       * Past the service end. No frame in the file draws this — agreed with the product owner
       * 2026-09-18 — so it is recorded here beside the copy it replaces rather than in a render
       * function. The number lands in the same 122pt box, so it stays short: "3h 50m".
       */
      overrunTitle: 'Service time complete',
      overrunMessage: 'Running over by',
      endsAtMs: nowMs + remainingMs,
      // The server would report its own clock; zero means "device and server agree".
      clockSkewMs: 0,
      extendCtaLabel: 'Extend Time',
      endCtaLabel: 'End Service',
      otpTitle: 'End OTP',
      otpCaption: 'Share this to end the service',
      otpCode: '111',
      noteTitle: 'Note before starting',
      noteBody:
        "Please ensure groceries and gas are available before cook's arrival to avoid any extension or related charges.",
      extendPrompt: 'Need more food prepared?',
      viewDetailsLabel: 'View booking details',
    },
  };
}

/**
 * `292:1197` "Page 12b- Cooking extended" — In service after an extension took effect.
 *
 * The notice and the new `endsAtMs` both come from the server. The extra 20 minutes below are a
 * SAMPLE of what a payload would carry, not client arithmetic on the chosen option.
 */
export function demoCookingExtendedBooking(nowMs: number): BookingDetailViewModel {
  const base = demoInServiceBooking(nowMs, 68 * 60 * 1000);
  return {
    ...base,
    inService: {
      ...base.inService!,
      extendedNotice: {
        title: 'Booking extended!',
        body: 'End time extended by 20 mins',
      },
    },
  };
}

/** `306:2885` "Page 15- Tip pop out". Amounts and the CTA label are server strings. */
const TIP_SHEET = {
  title: 'Tip Cook',
  sectionTitle: 'Share an amount',
  options: [
    { id: 'tip-25', label: '₹25' },
    { id: 'tip-50', label: '₹50' },
    { id: 'tip-100', label: '₹100' },
    { id: 'tip-150', label: '₹150' },
  ],
  // `306:3050` — the frame draws ₹50 selected, matching the pre-formatted CTA label.
  defaultOptionId: 'tip-50',
  note: {
    title: '100% of this is shared directly with the cook',
    body: 'Spoon cooks appreciate your kindness, thank you!',
  },
  ctaLabel: 'Tip • ₹50',
} as const;

/** `299:1424` "Page 14a- Completion". */
const COMPLETION = {
  bannerTitle: 'Booking Complete!',
  ratePrompt: 'Please rate this service!',
  // `306:2883` — the current file rewrote this line.
  rateCaption: 'Your rating helps us assign more suitable cooks to you!',
  ratingCaption:
    'Reward the cook with a 5+ rating if the service exceeded your expectations & keep them motivated!',
  // `319:3228` — what the legend says on `319:3191`.
  ratedCaption: "Thank you for appreciating the cook's efforts!",
  bookingHeadline: '12th April • 1:15 PM • 1 hr',
  // `143:288` — the label is now a full sentence, centred, not a field caption.
  feedbackTitle: 'We appreciate any feedback that helps us improve!',
  feedbackPlaceholder: 'Amazing homestyle flavor! Roti was extremely soft.',
  feedbackAcknowledgement: 'Thanks for sharing your feedback!',
  submitLabel: 'Submit',
  tipRowLabel: 'Would you like to tip the cook?',
} as const;

export const DEMO_BOOKING_COMPLETION: BookingDetailViewModel = {
  ...HEADER,
  details: DEMO_BOOKING_CONFIRMATION.details!,
  view: 'completion',
  cook: DEMO_COOK_ASHA,
  completion: COMPLETION,
  tip: TIP_SHEET,
};

/** `319:3191` "Page 14b- Feedback submission" — the SERVER reports the rating is recorded. */
/**
 * `319:3217` / `383:765` — the finished state where BOTH halves are in: the `5+` appreciation and
 * written feedback.
 *
 * The three facts are carried separately on purpose. `submitted` alone means only "a rating
 * exists"; drawing this frame from it made a 4.5 render as a lone `5+` chip and thanked customers
 * for feedback they never wrote. `319:3284` — a numeric rating, keeping its scale — is the other
 * finished state, and it is a different fixture because it is a different screen.
 */
export const DEMO_BOOKING_FEEDBACK_SUBMITTED: BookingDetailViewModel = {
  ...HEADER,
  details: DEMO_BOOKING_CONFIRMATION.details!,
  view: 'completion',
  cook: DEMO_COOK_ASHA,
  completion: {
    ...COMPLETION,
    submitted: true,
    submittedRating: RATING_EXCEPTIONAL,
    feedbackGiven: true,
  },
  tip: TIP_SHEET,
};

/** `319:3284` — a NUMERIC rating recorded, and nothing written. The scale stays, 4.5 filled. */
export const DEMO_BOOKING_RATED_NUMERIC: BookingDetailViewModel = {
  ...HEADER,
  details: DEMO_BOOKING_CONFIRMATION.details!,
  view: 'completion',
  cook: DEMO_COOK_ASHA,
  completion: { ...COMPLETION, submitted: true, submittedRating: 4.5 },
  tip: TIP_SHEET,
};

/** `3:2002` Extension sheet. Options and prices are server-owned. */
export const DEMO_EXTENSION: ExtensionViewModel = {
  title: 'Extend booking',
  sectionTitle: 'Duration',
  options: [
    { id: 'ext-10', label: '10 mins', price: '₹15' },
    { id: 'ext-20', label: '20 mins', price: '₹35' },
    { id: 'ext-30', label: '30 mins', price: '₹69', disabled: true },
  ],
  notes: [
    {
      id: 'quality',
      // `143:348` / `143:349`.
      title: 'Cooks always intend to deliver all your asks on time',
      body: 'Sometimes the booked duration can be less to finish all asks',
    },
    {
      id: 'schedule',
      // `143:356` / `143:357`.
      title: "Extensions are contingent on assigned cook's schedule",
      body: "Extensions are available when it doesn't clash with other jobs",
    },
  ],
  fallbackTitle: 'Not able to extend at the moment?',
  fallbackBody: 'We are very sorry for that, but you can make another booking',
  fallbackCtaLabel: 'Book NOW',
  // `143:381` — the frame draws "10 mins" selected, matching the pre-formatted CTA amount.
  defaultOptionId: 'ext-10',
  ctaLabel: 'Extend • ₹16',
  paymentDetailsLabel: 'Check payment details',
  // `275:4274` / `275:4275` — NOT the Instant sheet's copy: this one is a flat 5% GST.
  taxesInfo: {
    title: 'What is Taxes and Fee?',
    body: 'Taxes levied as per Govt. regulations, subject to change basis final service value. This includes a 5% GST.',
  },
};
