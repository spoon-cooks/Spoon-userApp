import { formatPaise } from '@core/format';
import { bookingStrikeOf } from '@features/booking';
import type { BookingDetailDto, ExtensionOptionDto, TrackingDto } from '@features/booking';
import type { PaymentDetailsSheetData } from '@features/recurringLive';

/**
 * Visit details through the service — Figma "Service flow" (`2165:11841`), dev notes
 * `2165:12389`–`2165:12423`. One phase per drawn frame:
 *
 *   assigned   `2165:11843`  cook assigned, before the trip
 *   onTheWay   `2165:11915`  "start trip" until the cook marks arrived — ETA tile
 *   arrived    `2165:11926`  arrived, Start OTP, "Brief your cook"
 *   cooking    `2165:11957`  OTP verified — the countdown, Extend, clean-up scope, End OTP
 *   timesUp    `2165:12117`  time left hit 0:00 — End OTP leads, Extend stays
 *   completed  `2165:12071`  End OTP verified — rating and tip
 *
 * The phase is the SERVER's status; only `timesUp` is read off the clock (time left ≤ 0 while the
 * server still says cooking — the visit never ends on its own, dev note `2165:12410`).
 */
export type ServicePhase =
  'assigned' | 'onTheWay' | 'arrived' | 'cooking' | 'timesUp' | 'completed';

const TIME_ZONE = 'Asia/Kolkata';

export function servicePhaseOf(booking: BookingDetailDto, now: Date): ServicePhase | null {
  switch (booking.status) {
    case 'assigned':
      return 'assigned';
    case 'cook_en_route':
      return 'onTheWay';
    case 'cook_arrived':
      return 'arrived';
    case 'cooking':
      return minutesLeft(booking, now) <= 0 ? 'timesUp' : 'cooking';
    case 'completed':
      return 'completed';
    default:
      return null;
  }
}

/** "9:00 AM". */
export function clock(iso: string): string {
  const parts: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-IN', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date(iso))) {
    parts[part.type] = part.value;
  }
  return `${parts.hour ?? ''}:${parts.minute ?? ''} ${(parts.dayPeriod ?? '').toUpperCase()}`;
}

/** "Wed, 14 Oct". */
export function day(iso: string): string {
  const parts: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-IN', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(new Date(iso))) {
    parts[part.type] = part.value;
  }
  return `${parts.weekday ?? ''}, ${parts.day ?? ''} ${parts.month ?? ''}`;
}

/** "2026-10-14" — the service day in Kolkata, as `/scheduled?date=` reads it. */
export function isoDay(iso: string): string {
  const parts: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-IN', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso))) {
    parts[part.type] = part.value;
  }
  return `${parts.year ?? ''}-${parts.month ?? ''}-${parts.day ?? ''}`;
}

/**
 * A one-time visit whose cook ops/system swapped (Figma `2353:17562`, dev note `2353:17578`). The
 * API sends `reassignment` on every booking (`{ occurred: false, … }` when the cook never
 * changed); a Recurring visit never shows the note.
 */
export function reassignedOneTime(booking: BookingDetailDto): boolean {
  return booking.reassignment?.occurred === true && (booking.recurring ?? null) === null;
}

/** "1 hr", "1.5 hrs", "45 min". */
export function duration(minutes: number): string {
  if (minutes < 60) return `${String(minutes)} min`;
  const hours = minutes / 60;
  const text = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(/\.0$/, '');
  return `${text} ${hours === 1 ? 'hr' : 'hrs'}`;
}

/** The booked span including every confirmed extension (the server's sum). */
export function totalMinutes(booking: BookingDetailDto): number {
  return booking.totalDurationMinutes ?? booking.durationMinutes;
}

export function extendedMinutes(booking: BookingDetailDto): number {
  return Math.max(0, totalMinutes(booking) - booking.durationMinutes);
}

/** When the visit now ends: the server's expected end, else service start plus the total. */
export function endsAt(booking: BookingDetailDto): string | null {
  if (booking.timing.expectedEnd !== null) return booking.timing.expectedEnd;
  const start = booking.timing.actualStart ?? booking.scheduledStart;
  if (start === null) return null;
  return new Date(Date.parse(start) + totalMinutes(booking) * 60_000).toISOString();
}

/** Dev note `2165:12402`: time left, whole minutes, never negative. */
export function minutesLeft(booking: BookingDetailDto, now: Date): number {
  const end = endsAt(booking);
  if (end === null) return totalMinutes(booking);
  return Math.max(0, Math.ceil((Date.parse(end) - now.getTime()) / 60_000));
}

/** "1 : 42" — the hour tile (0–2) and the two minute tiles. */
export function timerDigits(minutes: number): { hours: string; tens: string; units: string } {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return {
    hours: String(hours),
    tens: String(Math.floor(rest / 10)),
    units: String(rest % 10),
  };
}

/**
 * Dev note `2165:12389`: minutes to arrival, never below 1 while the cook is on the way, and
 * "On time" while that ETA is within the 15-min arrival SLA of the slot start.
 */
export function arrivalOf(
  booking: BookingDetailDto,
  tracking: TrackingDto | null,
  now: Date,
): { readonly by: string | null; readonly minutes: number | null; readonly onTime: boolean } {
  const eta = tracking?.eta.estimatedArrivalAt ?? null;
  if (eta === null) return { by: null, minutes: null, onTime: true };
  const minutes = Math.max(1, Math.ceil((Date.parse(eta) - now.getTime()) / 60_000));
  const start = booking.scheduledStart;
  const onTime = start === null ? true : Date.parse(eta) <= Date.parse(start) + 15 * 60_000;
  return { by: clock(eta), minutes, onTime };
}

/** The four digits of an OTP, or null while the server has none to show. */
export function otpDigits(code: string | null | undefined): readonly string[] | null {
  if (code === null || code === undefined) return null;
  const digits = code.replace(/\D/g, '');
  return digits.length === 0 ? null : digits.split('');
}

/** One drawn Extend option (`2165:11995`). */
export interface ExtendChoice {
  readonly minutes: number;
  readonly totalPaise: number;
  readonly available: boolean;
}

/** The three drawn steps; each is available only when the server offers it. */
export const EXTEND_STEPS = [10, 20, 30] as const;

export function extendChoicesFrom(options: readonly ExtensionOptionDto[]): readonly ExtendChoice[] {
  return EXTEND_STEPS.map((minutes) => {
    const offered = options.find((option) => option.minutes === minutes);
    return {
      minutes,
      totalPaise: offered?.totalAmountPaise ?? 0,
      available: offered !== undefined,
    };
  });
}

/** Dev note: +20 if it fits, else the largest option that fits. */
export function defaultExtendMinutes(choices: readonly ExtendChoice[]): number | null {
  if (choices.some((choice) => choice.available && choice.minutes === 20)) return 20;
  const fits = choices.filter((choice) => choice.available);
  return fits.length === 0 ? null : (fits[fits.length - 1]?.minutes ?? null);
}

/** "Meera is free till 10:30 AM" — the latest end any offered extension reaches. */
export function freeTill(options: readonly ExtensionOptionDto[]): string | null {
  const latest = options.reduce<string | null>(
    (best, option) =>
      best === null || Date.parse(option.newExpectedEnd) > Date.parse(best)
        ? option.newExpectedEnd
        : best,
    null,
  );
  return latest === null ? null : clock(latest);
}

/** The cook's first name, as the cards address her. */
export function firstName(name: string | null | undefined): string | null {
  if (name === null || name === undefined || name.trim() === '') return null;
  return (
    name
      .replace(/^Cook\s+/u, '')
      .trim()
      .split(/\s+/)[0] ?? null
  );
}

/** The tip card's amounts (`2216:4345`); "Most tipped" sits on ₹50. */
export const TIP_AMOUNTS_PAISE = [2500, 5000, 10000] as const;
export const MOST_TIPPED_PAISE = 5000;

export const rupees = (paise: number) => formatPaise(paise);

/** The server's payment-method type → the "Mode of payment" variant (`2254:3982`). */
function methodTypeOf(type: string): 'upi' | 'card' | 'wallet' | 'netbanking' {
  if (type === 'card' || type === 'emi') return 'card';
  if (type === 'wallet') return 'wallet';
  if (type === 'netbanking') return 'netbanking';
  return 'upi';
}

/**
 * The Payment details sheet for a one-time visit (Figma `2165:12246`, with extensions and a tip
 * `2257:3939`; dev note `2255:3939`): the visit, one line per confirmed extension, GST across all
 * of them, the tip, then the total charged. Mode of payment is the server's masked method, and
 * is left out until the server knows it rather than guessed.
 */
export function paymentSheetFrom(booking: BookingDetailDto, cookName: string | null) {
  const start = booking.scheduledStart ?? booking.timing.actualStart;
  const extensions = booking.charges?.extensions ?? [];
  const extensionTax = extensions.reduce(
    (sum, extension) => sum + Math.max(0, extension.chargedAmountPaise - extension.baseAmountPaise),
    0,
  );
  const extensionTotal = extensions.reduce(
    (sum, extension) => sum + extension.chargedAmountPaise,
    0,
  );
  const capturedTip = booking.tip?.status === 'captured' ? booking.tip.amountPaise : 0;
  const tipPaise = Math.max(booking.charges?.tipAmountPaise ?? 0, capturedTip);
  const method = booking.paymentMethod ?? null;
  const cook = firstName(cookName);
  const strike = bookingStrikeOf(booking.price);
  return {
    title: 'Payment details',
    subtitle:
      start === null ? duration(booking.durationMinutes) : `${day(start)} · ${clock(start)}`,
    visitLine: {
      label: `Cook visit · ${duration(booking.durationMinutes)}`,
      caption: booking.slotType === 'instant' ? 'Instant' : 'One-time',
      // `2257:4046` — the struck list price beside the price, when the booking had one.
      ...(strike === null ? {} : { was: formatPaise(strike.servicePaise) }),
      amount: formatPaise(booking.price.serviceAmountPaise),
    },
    extraLines: extensions.map((extension, index) => ({
      label: `Extension ${String(index + 1)} · +${String(extension.minutes)} mins`,
      caption: 'Added during the visit',
      amount: formatPaise(extension.baseAmountPaise),
    })),
    taxLine: { label: 'GST', amount: formatPaise(booking.price.taxAmountPaise + extensionTax) },
    ...(tipPaise > 0
      ? {
          tipLine: {
            label: cook === null ? 'Tip for your cook' : `Tip for ${cook}`,
            amount: formatPaise(tipPaise),
          },
        }
      : {}),
    totalLabel: 'Total',
    totalCaption: 'Inclusive of all taxes',
    total: formatPaise(booking.price.totalAmountPaise + extensionTotal + tipPaise),
    methodEyebrow: 'MODE OF PAYMENT',
    methodType: method === null ? undefined : methodTypeOf(method.type),
    methodName: method?.label ?? '',
    methodDetail: method?.detail ?? '',
    manageLabel: '',
    reminder: '',
  };
}

/**
 * The Payment details sheet for a Recurring visit's booking (Figma `2165:14262`): what the booking
 * itself charged — the visit, any extensions, GST and a tip — under the plan's caption ("Recurring
 * · Plan 1, Visit 1") and paid by the plan's UPI Autopay, with its Manage link and debit reminder.
 * `plan` is the recurring visit's own sheet (`visitDetailsFrom(...).paymentSheet`).
 */
export function recurringPaymentSheetFrom(
  booking: BookingDetailDto,
  cookName: string | null,
  plan: PaymentDetailsSheetData,
): PaymentDetailsSheetData {
  const sheet = paymentSheetFrom(booking, cookName);
  return {
    ...sheet,
    visitLine: {
      ...sheet.visitLine,
      ...(plan.visitLine.caption === undefined ? {} : { caption: plan.visitLine.caption }),
    },
    methodType: 'upi',
    methodName: plan.methodName,
    methodDetail: plan.methodDetail,
    manageLabel: plan.manageLabel,
    reminder: plan.reminder,
  };
}

/** A captured tip, as the paid tip card states it ("Paid via UPI · 12 Apr, 1:22 PM"). */
export function paidTipOf(
  booking: BookingDetailDto,
): { readonly amountPaise: number; readonly when: string } | null {
  const tip = booking.tip;
  if (tip === null || tip === undefined || tip.status !== 'captured') return null;
  const via = booking.paymentMethod?.label;
  const at = tip.capturedAt === null ? null : `${day(tip.capturedAt)}, ${clock(tip.capturedAt)}`;
  return {
    amountPaise: tip.amountPaise,
    when: [via === undefined ? 'Paid' : `Paid via ${via}`, at]
      .filter((part) => part !== null)
      .join(' · '),
  };
}
