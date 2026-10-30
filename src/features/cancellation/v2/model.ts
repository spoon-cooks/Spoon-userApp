import { formatPaise } from '@core/format';
import { refundStepLabel } from '@features/refunds';
import type { RefundProgressView } from '@features/refunds';

/**
 * The cancel-visit flow's model — Figma "Cancellation flow" (C1 `2055:20524` … C5b `2055:20432`),
 * dev notes `2071:2857`–`2071:2884`.
 *
 * Two quote sources feed it — a one-time booking's `cancellation-preview` and a recurring visit's
 * `cancellation-quote` — and both are normalised to `CancelQuote` here, so the sheets have one
 * shape to draw. Every amount is the SERVER's (dev note: "Never computed in the app"); the client
 * only formats paise and picks which drawn timeline segment a server percentage belongs to.
 */

/** IST, as the dev note asks for every time on these sheets. */
const TIME_ZONE = 'Asia/Kolkata';

export interface CancelVisit {
  /** The slot start, ISO. */
  readonly startsAt: string;
  readonly durationMinutes: number;
  readonly cookName: string | null;
  /** The cook has left for the customer's home (`cook_en_route`). */
  readonly cookOnTheWay: boolean;
  /** Minutes until the cook arrives, when the server knows. */
  readonly etaMinutes: number | null;
  /** The visit was rescheduled before — the "fees follow your original slot" note applies. */
  readonly wasRescheduled: boolean;
  /**
   * How the visit was paid, masked by the server ("UPI · ••••@okhdfcbank") — "Refund to" on C4 /
   * C5. Absent before the server knows; the refund record's method category stands in then.
   */
  readonly paidWith?: string | null | undefined;
}

export interface CancelQuote {
  readonly cancellable: boolean;
  /** The fee as a whole percentage of what was paid, from the server. */
  readonly feePercent: number;
  readonly feePaise: number;
  readonly refundPaise: number;
  /** What the customer paid, tax included. */
  readonly paidPaise: number;
  /** The service and GST parts of what was paid, when the source carries them. */
  readonly servicePaise: number | null;
  readonly taxPaise: number | null;
  /** The struck "was" total beside what was paid (DEC-088), tax included; null for none. */
  readonly wasPaidPaise?: number | null | undefined;
}

export interface CancelReason {
  readonly code: string;
  readonly label: string;
  readonly requiresDetail: boolean;
}

/** Dev note `2162:14279`: "Tell us what happened", 200 characters. */
export const REASON_DETAIL_MAX = 200;

/** The reason that shows the reschedule nudge (dev note `2071:2863`). */
export const URGENT_REASON = 'URGENT_CHANGE';

/** The four drawn windows (`2055:20623`), in order. */
export const FEE_ZONES = [
  { when: '3+ hrs before', fee: 'Free' },
  { when: '1–3 hrs before', fee: '25% fee' },
  { when: 'Under 1 hr', fee: '50% fee' },
  { when: 'Cook on the way', fee: '100% fee' },
] as const;

export type FeeZone = 0 | 1 | 2 | 3;

/**
 * Which drawn segment the server's answer falls in. The cook travelling overrides time (dev note
 * `2071:2878`); otherwise the server's percentage picks the segment — the client never compares
 * the clock against a boundary to decide a fee.
 */
export function feeZoneOf(quote: CancelQuote, visit: CancelVisit): FeeZone {
  if (visit.cookOnTheWay && quote.feePercent >= 100) return 3;
  if (quote.feePercent <= 0) return 0;
  if (quote.feePercent <= 25) return 1;
  if (quote.feePercent <= 50) return 2;
  return 3;
}

/** From 50% the primary becomes "Keep my visit" and reschedule is no longer offered. */
export function isHighLoss(zone: FeeZone): boolean {
  return zone >= 2;
}

/** "14 hrs 20 min", "1 hr 5 min", "40 min" — the countdown to the slot (`2055:20615`). */
export function countdownLabel(startsAt: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((Date.parse(startsAt) - now.getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${String(rest)} min`;
  return `${String(hours)} ${hours === 1 ? 'hr' : 'hrs'} ${String(rest)} min`;
}

/** The whole-minute count to the slot, for re-fetching the quote as a boundary passes. */
export function minutesToStart(startsAt: string, now: Date): number {
  return Math.floor((Date.parse(startsAt) - now.getTime()) / 60_000);
}

/** The drawn boundaries, in minutes before the slot: crossing one re-fetches the quote. */
export const FEE_BOUNDARY_MINUTES = [180, 60] as const;

/** "₹299" — whole rupees when exact, else two decimals. */
export function rupees(paise: number): string {
  return formatPaise(paise);
}

/** "1 hr", "1.5 hrs", "45 min". */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${String(minutes)} min`;
  const hours = minutes / 60;
  const text = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(/\.0$/, '');
  return `${text} ${hours === 1 ? 'hr' : 'hrs'}`;
}

function parts(iso: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-IN', {
    timeZone: TIME_ZONE,
    ...options,
  }).formatToParts(new Date(iso))) {
    out[part.type] = part.value;
  }
  return out;
}

/** "9:00 AM". */
export function clockLabel(iso: string): string {
  const p = parts(iso, { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${p.hour ?? ''}:${p.minute ?? ''} ${(p.dayPeriod ?? '').toUpperCase()}`;
}

/** The C1 date tile: "WED", "14", "OCT". */
export function dateTile(iso: string): { weekday: string; day: string; month: string } {
  const p = parts(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  return {
    weekday: (p.weekday ?? '').toUpperCase(),
    day: p.day ?? '',
    month: (p.month ?? '').toUpperCase(),
  };
}

/** "Wed, 14 Oct". */
export function dayLabel(iso: string): string {
  const p = parts(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${p.weekday ?? ''}, ${p.day ?? ''} ${p.month ?? ''}`;
}

/** "Wed, 14 Oct · 9:00 AM · Cook Meera" — the sheets' subtitle (`2055:20598`). */
export function visitSubtitle(visit: CancelVisit): string {
  return [
    dayLabel(visit.startsAt),
    clockLabel(visit.startsAt),
    visit.cookName === null ? null : `Cook ${visit.cookName}`,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/** "9:00 AM – 10:00 AM · 1 hr" — the cancelled banner's struck slot (`1461:6235`). */
export function slotRange(visit: CancelVisit): string {
  const end = new Date(Date.parse(visit.startsAt) + visit.durationMinutes * 60_000).toISOString();
  return `${clockLabel(visit.startsAt)} – ${clockLabel(end)} · ${durationLabel(visit.durationMinutes)}`;
}

/** The outcome card's two lines (`2055:20641`, `2055:20971`). */
export function outcomeLines(
  quote: CancelQuote,
  zone: FeeZone,
): { readonly title: string; readonly body: string | null } {
  if (zone === 0) {
    return {
      title:
        quote.servicePaise === null
          ? `Full refund · ${rupees(quote.paidPaise)}`
          : `Full refund · ${rupees(quote.servicePaise)} + taxes`,
      body: null,
    };
  }
  return {
    title: `${rupees(quote.feePaise)} · ${String(quote.feePercent)}% fee`,
    body: `A refund of ${rupees(quote.refundPaise)} shall be processed`,
  };
}

/** The review's refund caption (`2055:20763`, `2055:20415`). */
export function refundCaption(quote: CancelQuote, visit: CancelVisit): string {
  if (quote.refundPaise === 0) {
    return visit.cookOnTheWay
      ? 'No refund, cook was already on her way'
      : 'No refund for this cancellation';
  }
  if (quote.feePaise === 0) return 'Full refund, inclusive of taxes';
  return `${String(100 - quote.feePercent)}% refund, inclusive of taxes`;
}

/** C5/C5b's message (`2055:20856`, `2055:20501`). */
export function cancelledMessage(quote: CancelQuote, visit: CancelVisit): string {
  if (quote.refundPaise > 0) return 'We’ve informed the cook. Your refund is on its way.';
  if (visit.cookOnTheWay) {
    return `${visit.cookName ?? 'Your cook'} had already left for your home, so the full ${rupees(
      quote.paidPaise,
    )} went to ${visit.cookName === null ? 'them' : 'her'}.`;
  }
  return 'We’ve informed the cook.';
}

/** "UPI", "Card" … from the refund tracker's method; null when the server has not said. */
export function methodLabel(method: string | null | undefined): string | null {
  if (method === null || method === undefined || method === '') return null;
  const key = method.toLowerCase();
  if (key === 'upi') return 'UPI';
  if (key === 'card') return 'Card';
  if (key === 'netbanking') return 'Netbanking';
  if (key === 'wallet') return 'Wallet';
  return method.charAt(0).toUpperCase() + method.slice(1);
}

/** The refund tracker on C5 (`2055:20857`), from whatever the refund record says so far. */
export interface CancelRefund {
  readonly amountPaise: number;
  readonly method: string | null;
  readonly refunded: boolean;
  /** When the refund was raised, ISO; null until the record exists. */
  readonly initiatedAt: string | null;
  /** When it reached the customer, ISO. */
  readonly creditedAt: string | null;
}

/**
 * C5's refund as Figma's `Refund tracker` (`2303:4231`) draws it — the same card as Visit details →
 * Payment & refund. The cancellation knows when the refund was raised and whether it has reached
 * the customer: raised is step 1; credited ticks steps 2 and 3 at the time it was credited.
 */
export function refundProgressFrom(
  refund: CancelRefund | null,
  refundPaise: number,
  now: Date,
): RefundProgressView {
  const credited = refund?.refunded === true;
  const creditedWhen =
    refund?.creditedAt === null || refund?.creditedAt === undefined
      ? undefined
      : refundStepLabel(TIME_ZONE, refund.creditedAt);
  return {
    amount: rupees(refundPaise),
    destination: 'Original source',
    status: credited ? 'completed' : 'in_progress',
    steps: [
      {
        key: 'initiated',
        title: 'Refund initiated',
        when: refundStepLabel(TIME_ZONE, refund?.initiatedAt ?? now.toISOString()),
        done: true,
      },
      { key: 'processed', title: 'Refund processed', when: creditedWhen, done: credited },
      { key: 'completed', title: 'Refund completed', when: creditedWhen, done: credited },
    ],
  };
}

/** "Today · 6:40 PM" / "Mon, 19 Oct · 6:40 PM". */
export function whenLabel(iso: string, now: Date): string {
  const sameDay = dayLabel(iso) === dayLabel(now.toISOString());
  return `${sameDay ? 'Today' : dayLabel(iso)} · ${clockLabel(iso)}`;
}
