import type { ImageSourcePropType } from 'react-native';

import { VISIT_COOK_PHOTO, VISIT_DISH_PHOTO } from '../components/visit/assets';
import { MODIFY_BOOKING_SHEET, PAYMENT_DETAILS_SHEET } from './sheets';
import type { ModifyBookingSheetData, PaymentDetailsSheetData } from './sheets';

/**
 * Fixture data for the recurring live booking "Visit details" screen, read verbatim off Figma
 * `cCQlzTeiObQkpVBzwI8mZi` page `1005:131`: `1008:5398` (Cook assigned), `1466:8275` (Cook
 * pending), `1466:8639` (Completed), `1466:8446` (Cancelled) and the before-arrival prep states
 * `1441:1808` / `1441:1853` / `1441:1898`. STATIC ONLY — nothing here comes from a backend.
 */

/** Which of the four Visit details frames the screen draws. */
export type VisitVariant = 'assigned' | 'pending' | 'completed' | 'cancelled';

/** How many of the three prep checks start ticked — the frames draw 0, 1 and 3. */
export type VisitPrepReady = 0 | 1 | 2 | 3;

export type VisitPrepKey = 'entry' | 'groceries' | 'utensils';

export interface VisitPrepItem {
  readonly key: VisitPrepKey;
  readonly label: string;
}

export interface VisitRefundLine {
  readonly label: string;
  readonly detail?: string | undefined;
  readonly was?: string;
  readonly amount: string;
  /** `1670:3514` / `1670:3477` — a Caption line (GST, cancellation fee): no detail, 12pt ink. */
  readonly minor?: boolean | undefined;
}

export interface VisitRefundStep {
  readonly title: string;
  /** Absent when the backend gives no time for the step. */
  readonly when?: string | undefined;
  /** `1670:3506` — a closing line in `Spoon/Body` rather than a titled step. */
  readonly note?: boolean | undefined;
}

export const VISIT_FIXTURE = {
  /** `1461:6164` / `1461:6166` — the banner's date and slot. */
  date: 'Wed, 14 Oct',
  slot: '9:00 AM – 10:00 AM · 1 hr',
  /** `2165:13861` — the pending banner's countdown. */
  daysToGo: '5',
  toGoLabel: 'HOURS TO GO',

  /** `1463:7966` — the assigned cook. */
  cook: {
    eyebrow: 'SPOON TRAINED · VERIFIED',
    name: 'Cook Rani',
    origin: 'West Bengal · Speaks Hindi, Bengali',
    visits: 'Visits with you: 45',
    rating: 'Your rating: 4.5',
    note: 'Cook from your Pool. If plans change, we’ll notify you',
  },
  /** `1380:3076` — five carousels, each the same section and three of the same dish. */
  menu: {
    sections: ['veg-1', 'veg-2', 'veg-3', 'veg-4', 'veg-5'] as const,
    sectionTitle: 'Curries/ sabzis- Veg',
    dishName: 'Dahi bhindi',
    dishesPerSection: 3,
  },

  /** `1466:8280` — the pending cook pool. */
  pending: {
    note: 'We’ll notify you the moment your cook is confirmed',
    eyebrow: 'FROM YOUR COOK POOL',
    title: 'Cook confirmed by Mon, 8:45 AM',
    cta: 'View Cook Pool',
  },

  /** `1466:8451` — the cancelled visit. */
  cancelled: {
    title: 'Visit cancelled',
    byline: 'By you · Thu, 1 Oct, 6:40 PM',
    eyebrow: 'YOUR PLAN CONTINUES',
    nextVisit: 'Next visit · Fri, 16 Oct, 9:00 AM',
  },

  /** `1454:7956` — the recipe share row. */
  recipe: {
    title: 'Have a recipe/dish in mind?',
    body: 'Share with us & we’ll brief her before the visit on your behalf!',
    cta: 'Share',
  },

  /** `1444:718` — the before-arrival checklist. */
  prep: {
    title: 'Before the Cook arrives',
    items: [
      { key: 'entry', label: 'Entry approved' },
      { key: 'groceries', label: 'Groceries ready' },
      { key: 'utensils', label: 'Utensils handy' },
    ] as readonly VisitPrepItem[],
    idleHint: 'Tap when done',
    doneHint: 'Done',
    why: 'Your slot begins the moment your cook checks in, having essentials ready means more time for cooking and more dishes on the table',
    allSet: 'Kitchen’s ready! Rani can start cooking the moment she walks in.',
  },

  /** `1374:1409` — the visit charge. */
  charge: {
    eyebrow: 'VISIT CHARGE',
    was: '₹399',
    amount: '₹299',
    taxNote: '+ 5% GST',
    title: 'Pay per visit',
    /** `1008:5398`, `1466:8294` — every state with the visit still to be charged. */
    bodyNotice:
      'You’d be notified 27 hrs before & payment is auto-debited 3 hrs before your first visit of the day.',
  },

  /** `2165:13866` — Payment & refund · Cancelled · Refunded. */
  refund: {
    title: 'Payment & refund',
    badge: 'Refunded',
    lines: [
      {
        label: 'Amount paid',
        detail: 'Cook visit 1 hr ₹253.39 + GST ₹45.61',
        was: '₹399',
        amount: '₹299',
      },
      { label: 'GST', amount: '₹22.81', minor: true },
      { label: 'Cancellation fee', amount: '– ₹0', minor: true },
    ] as readonly VisitRefundLine[],
    total: {
      label: 'Refund amount',
      detail: 'Full refund, inclusive of taxes',
      was: '₹399',
      amount: '₹299',
    } as VisitRefundLine,
    modeEyebrow: 'REFUND TO',
    mode: 'UPI · ••••@okhdfcbank',
    idEyebrow: 'REFUND ID',
    steps: [
      { title: 'Refund initiated', when: 'Thu, 1 Oct' },
      { title: 'It takes 5-7 working days for the amount to get credited to source', note: true },
    ] as readonly VisitRefundStep[],
  },
} as const;

/*
 * ─── The screen's model ──────────────────────────────────────────────────────────────────────
 *
 * Everything Visit details draws, section by section. The dev preview renders `VISIT_DEMO_MODEL`
 * (the frames' own copy, above); the real route builds one from the visit (`visitDetailsFrom`).
 * A field the backend has no value for is optional, and its line is left out rather than filled
 * with sample copy.
 */

export interface VisitBannerData {
  readonly date: string;
  readonly slot: string;
  /** Upcoming (cook pending) only. */
  readonly daysToGo?: string | undefined;
  /** What `daysToGo` counts: "DAYS TO GO" (the default), "HOURS TO GO". */
  readonly toGoLabel?: string | undefined;
}

export interface VisitCookData {
  readonly eyebrow: string;
  readonly name: string;
  readonly origin?: string | undefined;
  readonly visits?: string | undefined;
  readonly rating?: string | undefined;
  readonly note: string;
  readonly photo?: ImageSourcePropType | undefined;
}

export interface VisitDish {
  readonly id: string;
  readonly name: string;
  readonly image?: ImageSourcePropType | undefined;
}

export interface VisitMenuSection {
  readonly id: string;
  readonly title: string;
  readonly dishes: readonly VisitDish[];
}

export interface VisitPendingData {
  readonly note: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly cta: string;
}

export interface VisitCancelledData {
  readonly title: string;
  readonly byline: string;
  readonly eyebrow: string;
  /** "Next visit · Fri, 16 Oct, 9:00 AM"; `null` when nothing is left to run. */
  readonly nextVisit: string | null;
}

export interface VisitRecipeData {
  readonly title: string;
  readonly body: string;
  readonly cta: string;
}

export interface VisitPrepData {
  readonly title: string;
  readonly items: readonly VisitPrepItem[];
  readonly idleHint: string;
  readonly doneHint: string;
  readonly why: string;
  readonly allSet: string;
}

export interface VisitChargeData {
  readonly eyebrow: string;
  readonly was?: string | undefined;
  readonly amount: string;
  readonly taxNote: string;
  readonly title: string;
  readonly body: string;
}

export interface VisitRefundData {
  readonly title: string;
  readonly booking?: string | undefined;
  readonly badge: string;
  /** The badge's `90:189` type: lime Positive (the default) or `#FFF7CC` Neutral. */
  readonly badgeTone?: 'positive' | 'neutral' | undefined;
  readonly lines: readonly VisitRefundLine[];
  readonly total: VisitRefundLine;
  readonly modeEyebrow: string;
  readonly mode?: string | undefined;
  readonly idEyebrow: string;
  readonly refundId?: string | undefined;
  readonly steps: readonly VisitRefundStep[];
}

export interface VisitDetailsModel {
  readonly variant: VisitVariant;
  readonly banner: VisitBannerData;
  /** Assigned. */
  readonly cook: VisitCookData;
  readonly menu: readonly VisitMenuSection[];
  /** Pending. */
  readonly pending: VisitPendingData;
  /** Cancelled. */
  readonly cancelled: VisitCancelledData;
  /** Upcoming; `null` hides the recipe row. */
  readonly recipe: VisitRecipeData | null;
  /** Upcoming; `null` hides the checklist (nothing to save it against yet). */
  readonly prep: VisitPrepData | null;
  readonly prepChecked: readonly VisitPrepKey[];
  readonly charge: VisitChargeData;
  /** Cancelled with something charged; `null` shows the charge card instead. */
  readonly refund: VisitRefundData | null;
  readonly paymentSheet: PaymentDetailsSheetData;
  /** Upcoming and cancellable; `null` leaves "Modify booking" out of the dock. */
  readonly modifySheet: ModifyBookingSheetData | null;
  /** Cancelled because its T−3h debit failed: offers a one-time visit for the same slot. */
  readonly paymentFailed: boolean;
}

/** The frames' own content, per variant (`prepReady` ticks the first N checks, as the frames do). */
export function visitDemoModel(
  variant: VisitVariant,
  prepReady: VisitPrepReady = 0,
): VisitDetailsModel {
  const f = VISIT_FIXTURE;
  return {
    variant,
    banner: { date: f.date, slot: f.slot, daysToGo: f.daysToGo, toGoLabel: f.toGoLabel },
    cook: { ...f.cook, photo: VISIT_COOK_PHOTO },
    menu: f.menu.sections.map((id) => ({
      id,
      title: f.menu.sectionTitle,
      dishes: Array.from({ length: f.menu.dishesPerSection }, (_, i) => ({
        id: `${id}-${i}`,
        name: f.menu.dishName,
        image: VISIT_DISH_PHOTO,
      })),
    })),
    pending: { ...f.pending },
    cancelled: { ...f.cancelled },
    recipe: { ...f.recipe },
    prep: { ...f.prep },
    prepChecked: f.prep.items.slice(0, prepReady).map((item) => item.key),
    charge: {
      eyebrow: f.charge.eyebrow,
      was: f.charge.was,
      amount: f.charge.amount,
      taxNote: f.charge.taxNote,
      title: f.charge.title,
      body: f.charge.bodyNotice,
    },
    refund: variant === 'cancelled' ? { ...f.refund } : null,
    paymentSheet: PAYMENT_DETAILS_SHEET,
    modifySheet: variant === 'assigned' || variant === 'pending' ? MODIFY_BOOKING_SHEET : null,
    paymentFailed: false,
  };
}
