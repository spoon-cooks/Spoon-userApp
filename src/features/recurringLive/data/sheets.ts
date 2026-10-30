/**
 * Fixture copy for the Visit details sheets — Figma `1433:1625` (Modify booking) and `1434:1770`
 * (Payment details) in `cCQlzTeiObQkpVBzwI8mZi`. STATIC: every string is transcribed from the
 * frames; nothing here is computed or fetched.
 */

export type ModifyBookingStepKind = 'now' | 'fee' | 'visit';

export interface ModifyBookingStep {
  readonly kind: ModifyBookingStepKind;
  readonly title: string;
  readonly caption: string;
}

export interface ModifyBookingSheetData {
  readonly title: string;
  readonly subtitle: string;
  readonly windowTitle: string;
  readonly steps: readonly [ModifyBookingStep, ModifyBookingStep, ModifyBookingStep];
  readonly note: string;
  readonly cancelLabel: string;
}

export interface PaymentLine {
  readonly label: string;
  readonly caption?: string;
  /** `1434:1784` — the struck-through pre-discount price; absent when there is no discount. */
  readonly was?: string | undefined;
  readonly amount: string;
}

export interface PaymentDetailsSheetData {
  readonly title: string;
  readonly subtitle: string;
  /** `1434:1780` — the visit line. */
  readonly visitLine: PaymentLine;
  /**
   * `2257:4202` / `2257:4209` — one line per confirmed extension ("Extension 1 · +20 mins", "Added
   * during the visit"), drawn like the visit line. Absent or empty: none.
   */
  readonly extraLines?: readonly PaymentLine[] | undefined;
  /** `1434:1785` — the GST line. */
  readonly taxLine: PaymentLine;
  /** `2257:4216` — "Tip for Rani", a Caption line under GST. Absent: no tip paid. */
  readonly tipLine?: PaymentLine | undefined;
  readonly totalLabel: string;
  readonly totalCaption: string;
  /** `1474:2506` — the struck-through list price; absent when there is none. */
  readonly totalOriginal?: string | undefined;
  readonly total: string;
  readonly methodEyebrow: string;
  /**
   * `2254:3982` — which "Mode of payment" variant draws the well's glyph: UPI (Autopay or not),
   * Card, Wallet or Netbanking. Absent: the UPI glyph, as before.
   */
  readonly methodType?: 'upi' | 'card' | 'wallet' | 'netbanking' | undefined;
  readonly methodName: string;
  readonly methodDetail: string;
  readonly manageLabel: string;
  readonly reminder: string;
}

export const MODIFY_BOOKING_SHEET: ModifyBookingSheetData = {
  title: 'Modify booking',
  subtitle: 'Wed, 14 Oct · 9:00 AM · Cook Rani',
  windowTitle: 'Free changes till Wed, 14 Oct · 5:00 AM',
  steps: [
    { kind: 'now', title: 'Now', caption: 'Today' },
    { kind: 'fee', title: 'Cancellation fee', caption: 'Wed, 5:00 AM' },
    { kind: 'visit', title: 'Visit', caption: 'Wed, 9:00 AM' },
  ],
  note: 'Your other visits in Plan 1 stay as they are.',
  cancelLabel: 'Cancel this visit',
};

export const PAYMENT_DETAILS_SHEET: PaymentDetailsSheetData = {
  title: 'Payment details',
  subtitle: 'Wed, 14 Oct · 9:00 AM',
  visitLine: {
    label: 'Cook visit · 1 hr',
    caption: 'Recurring · Plan 1, Visit 1 of 3',
    was: '₹253.39',
    amount: '₹253.39',
  },
  taxLine: { label: 'GST', amount: '₹22.81' },
  totalLabel: 'Total',
  totalCaption: 'Inclusive of all taxes',
  total: '₹299',
  methodEyebrow: 'MODE OF PAYMENT',
  methodName: 'UPI Autopay',
  methodDetail: '••••@okhdfcbank · Mandate active',
  manageLabel: 'Manage',
  reminder:
    'Mandate is shared 27 hrs before & payment is auto-debited 3 hrs before your first visit of the day.',
};
