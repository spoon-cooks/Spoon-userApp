import type { ImageSourcePropType } from 'react-native';

import { formatPaise } from '@core/format';
import type { RatingAttachment } from '@features/booking';
import type { CookProfile, PoolCookProfileDto } from '@features/cookPool';
import type {
  RecurringBookingDto,
  VisitCancellationQuoteDto,
  VisitDetailDto,
} from '@features/recurringSetup';

import { clockText, durationText } from './adapters';
import { attachmentsOf } from './components/rating/feedback/model';
import type { RateVisitInfo, RateVisitSubmission } from './components/rating/RateVisitCard';
import {
  RATING_CHIPS_NEGATIVE,
  RATING_CHIPS_POSITIVE,
  VISIT_RATING_PLUS,
  ratingTier,
} from './data/rating';
import { VISIT_FIXTURE } from './data/visit';
import type {
  VisitDetailsModel,
  VisitMenuSection,
  VisitPrepKey,
  VisitRefundData,
  VisitVariant,
} from './data/visit';

/**
 * One Recurring visit (`GET /v1/me/recurring-bookings/{id}/visits/{visitId}`) → Visit details.
 * Pure, so every rule is testable without a network.
 *
 *   variant      the backend's `displayState`: cook_assigned / cook_pending / completed / cancelled
 *   banner       "Wed, 14 Oct" · "9:00 AM – 10:00 AM · 1 hr"; days to go while the cook is pending
 *   cook         the assigned cook from the visit, with region, languages, visits with you and the
 *                menu from their Cook Pool profile when it has loaded
 *   pending      "Cook confirmed by Mon, 8:45 AM" (the visit's T−3h); the banner counts down in
 *                hours on the visit's last day
 *   cancelled    who cancelled and when, and the plan's next visit
 *   checklist    only once the visit has a booking to save it against (`prep`)
 *   charge       the visit's price incl. GST; what Autopay does, or did, with it
 *   refund       cancelled after the charge: paid, fee, refund, refund status and where it goes
 *   sheets       Payment details from the price and mandate; Modify booking from the cancellation
 *                quote, only while the visit can still be cancelled
 *
 * Nothing the backend does not give is filled with sample copy: no dish photos it cannot match,
 * no cook "match %", no refund id or booking reference, no Call button.
 */
export interface VisitDetailsSources {
  readonly visit: VisitDetailDto;
  /** For the plan's next visit; `null` while it loads. */
  readonly booking: RecurringBookingDto | null;
  /** The assigned cook's Cook Pool profile; `null` while it loads or for a cook no longer pooled. */
  readonly cookProfile: PoolCookProfileDto | null;
  /** `cookProfileFrom(cookProfile)` — the profile as the app draws it, for the menu. */
  readonly cookCard: CookProfile | null;
  /**
   * `cookCardLines(cookProfile.presentation)` — the cook card's eyebrow, caption and stat lines
   * as the backend wrote them (DEC-114). The route builds it, as it builds `cookCard`.
   */
  readonly cookLines?: {
    readonly eyebrow: string;
    readonly origin?: string;
    readonly visits?: string;
    readonly rating?: string;
  };
  readonly quote: VisitCancellationQuoteDto | null;
  /** Asia/Kolkata `YYYY-MM-DD`. */
  readonly todayId: string;
  /** For the pending countdown in hours once the visit is under a day away; omitted: days only. */
  readonly now?: Date | undefined;
}

const VARIANTS: Record<VisitDetailDto['displayState'], VisitVariant> = {
  cook_assigned: 'assigned',
  cook_pending: 'pending',
  completed: 'completed',
  cancelled: 'cancelled',
};

/**
 * The pending banner's countdown (`2165:13861`): "5 HOURS TO GO" once the visit is under a day
 * away, "10 DAYS TO GO" before that.
 */
function countdownTo(
  start: string,
  date: string,
  todayId: string,
  now: Date | undefined,
): { readonly daysToGo: string; readonly toGoLabel: string } {
  const hours = now === undefined ? null : (Date.parse(start) - now.getTime()) / 3_600_000;
  if (hours !== null && hours < 24) {
    const whole = Math.max(1, Math.floor(hours));
    return { daysToGo: String(whole), toGoLabel: whole === 1 ? 'HOUR TO GO' : 'HOURS TO GO' };
  }
  const days = Math.max(0, daysBetween(todayId, date));
  return { daysToGo: String(days), toGoLabel: days === 1 ? 'DAY TO GO' : 'DAYS TO GO' };
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sept',
  'Oct',
  'Nov',
  'Dec',
] as const;

const KOLKATA_OFFSET_MS = 330 * 60_000;

/** An instant as its Asia/Kolkata date id and `HH:MM`. */
function kolkata(instant: string): { dateId: string; hhmm: string } {
  const iso = new Date(new Date(instant).getTime() + KOLKATA_OFFSET_MS).toISOString();
  return { dateId: iso.slice(0, 10), hhmm: iso.slice(11, 16) };
}

/** `2026-10-14` → "Wed, 14 Oct". */
export function dayLabel(dateId: string): string {
  const [year, month, day] = dateId.split('-').map(Number) as [number, number, number];
  const weekday = WEEKDAYS[(new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7];
  return `${weekday}, ${day} ${MONTHS[month - 1]}`;
}

/** "9:00 AM" → "9 AM" on the hour, as the frames write a deadline. */
const shortClock = (hhmm: string) => clockText(hhmm).replace(':00 ', ' ');

function plusMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function daysBetween(fromId: string, toId: string): number {
  return Math.round(
    (Date.parse(`${toId}T00:00:00Z`) - Date.parse(`${fromId}T00:00:00Z`)) / 86_400_000,
  );
}

/** The list price incl. GST, in proportion, when the price is discounted; else none. */
function listTotal(price: VisitDetailDto['price']): string | undefined {
  if (price.basePricePaise <= price.pricePaise || price.pricePaise === 0) return undefined;
  return formatPaise(Math.round((price.basePricePaise * price.totalPaise) / price.pricePaise));
}

const PREP_KEYS: readonly {
  key: VisitPrepKey;
  field: 'entryApproved' | 'groceriesReady' | 'utensilsReady';
}[] = [
  { key: 'entry', field: 'entryApproved' },
  { key: 'groceries', field: 'groceriesReady' },
  { key: 'utensils', field: 'utensilsReady' },
];

const NOTICE_BODY =
  'You’d be notified 27 hrs before & payment is auto-debited 3 hrs before your first visit of the day.';

export function visitDetailsFrom(sources: VisitDetailsSources): VisitDetailsModel {
  const { visit, booking, cookProfile, cookCard, quote, todayId } = sources;
  const variant = VARIANTS[visit.displayState];
  const start = visit.startTime;
  const end = plusMinutes(start, visit.durationMinutes);
  const date = dayLabel(visit.date);
  const duration = durationText(visit.durationMinutes);
  const cookName = visit.cook?.displayName ?? null;
  const fixture = VISIT_FIXTURE;

  // ─── Cook (assigned) ───────────────────────────────────────────────────────────────────────
  const card = cookProfile?.cook ?? null;
  // The trust marks, caption and stat lines are the backend's (DEC-114).
  const lines = sources.cookLines ?? { eyebrow: '' };
  const photoUrl = visit.cook?.profileImageUrl ?? card?.profileImageUrl ?? null;
  const menu: readonly VisitMenuSection[] = (cookCard?.menu ?? []).map((section) => ({
    id: section.id,
    title: section.title,
    dishes: section.dishes.map((dish) => ({
      id: dish.id,
      name: dish.name,
      ...(dish.image === undefined ? {} : { image: dish.image as ImageSourcePropType }),
    })),
  }));

  // ─── Pending ───────────────────────────────────────────────────────────────────────────────
  const confirmBy = kolkata(visit.cookConfirmBy);

  const planVisits =
    booking?.plans.find((plan) => plan.planNumber === visit.planNumber)?.visits.length ?? null;

  // ─── Cancelled ─────────────────────────────────────────────────────────────────────────────
  const cancellation = visit.cancellation;
  const cancelledAt = cancellation === null ? null : kolkata(cancellation.cancelledAt);
  const by =
    cancellation === null
      ? ''
      : cancellation.cancelledBy === 'customer'
        ? 'By you'
        : cancellation.cancelledBy === 'payment_failed'
          ? 'Payment failed'
          : 'By Spoon';
  const next = booking?.upNext ?? null;
  const nextVisit =
    next === null || next.visitId === visit.visitId
      ? null
      : `Next visit · ${dayLabel(next.date)}, ${clockText(next.startTime)}`;

  // ─── Money ─────────────────────────────────────────────────────────────────────────────────
  const payment = visit.payment;
  const total = payment?.totalPaise ?? visit.price.totalPaise;
  const was = listTotal(visit.price);
  const chargedAt =
    payment?.chargedAt === undefined || payment.chargedAt === null
      ? null
      : kolkata(payment.chargedAt);
  const charged = cancellation !== null && !cancellation.nothingCharged;
  const chargeBody =
    variant === 'cancelled'
      ? 'Cancelled before the charge, so nothing was charged for this visit.'
      : chargedAt !== null
        ? `Charged via UPI Autopay on ${dayLabel(chargedAt.dateId)}, ${clockText(chargedAt.hhmm)}.`
        : NOTICE_BODY;

  const mandate = visit.mandate;
  const refund: VisitRefundData | null =
    variant === 'cancelled' && cancellation !== null && charged
      ? {
          title: 'Payment & refund',
          // `2165:13866`: "Refunded" once the money is back. The steps stand in only until the
          // visit's refund tracker loads (DEC-090).
          badge:
            cancellation.refundStatus === 'refunded'
              ? 'Refunded'
              : cancellation.refundStatus === 'failed'
                ? 'Refund failed'
                : 'Refund in progress',
          lines: [
            {
              label: 'Amount paid',
              detail: `Cook visit ${duration} ${formatPaise(payment?.pricePaise ?? visit.price.pricePaise)} + GST ${formatPaise(payment?.gstPaise ?? visit.price.gstPaise)}`,
              ...(was === undefined ? {} : { was }),
              amount: formatPaise(total),
            },
            // Drawn on a free cancellation too, as "– ₹0" (`2165:13866`).
            {
              label:
                cancellation.feePaise === 0
                  ? 'Cancellation fee'
                  : `Cancellation fee (${cancellation.feePercent}%)`,
              amount: `– ${formatPaise(cancellation.feePaise)}`,
              minor: true,
            },
          ],
          total: {
            label: 'Refund amount',
            detail:
              cancellation.feePaise === 0
                ? 'Full refund, inclusive of taxes'
                : 'Inclusive of taxes',
            amount: formatPaise(cancellation.refundPaise),
          },
          modeEyebrow: 'REFUND TO',
          ...(mandate?.handleMasked === null || mandate === null
            ? {}
            : { mode: `UPI · ${mandate.handleMasked}` }),
          idEyebrow: 'REFUND ID',
          steps: [
            {
              title: 'Refund initiated',
              ...(cancelledAt === null ? {} : { when: dayLabel(cancelledAt.dateId) }),
            },
            {
              title: 'It takes 5-7 working days for the amount to get credited to source',
              note: true,
            },
          ],
        }
      : null;

  const upcoming = variant === 'assigned' || variant === 'pending';
  const feeAt = confirmBy;

  return {
    variant,
    banner: {
      date,
      slot: `${clockText(start)} – ${clockText(end)} · ${duration}`,
      ...(variant === 'pending' ? countdownTo(visit.start, visit.date, todayId, sources.now) : {}),
    },
    cook: {
      name: cookName ?? card?.displayName ?? '',
      ...lines,
      note: fixture.cook.note,
      ...(photoUrl === null ? {} : { photo: { uri: photoUrl } }),
    },
    menu,
    pending: {
      note: fixture.pending.note,
      eyebrow: fixture.pending.eyebrow,
      title: `Cook confirmed by ${dayLabel(confirmBy.dateId).split(',')[0]}, ${shortClock(confirmBy.hhmm)}`,
      cta: fixture.pending.cta,
    },
    cancelled: {
      title: fixture.cancelled.title,
      byline:
        cancelledAt === null
          ? by
          : `${by} · ${dayLabel(cancelledAt.dateId)}, ${clockText(cancelledAt.hhmm)}`,
      eyebrow: fixture.cancelled.eyebrow,
      nextVisit,
    },
    recipe: upcoming && visit.support.whatsappUrl !== null ? { ...fixture.recipe } : null,
    prep:
      upcoming && visit.prep !== null
        ? {
            ...fixture.prep,
            allSet:
              cookName === null
                ? 'Kitchen’s ready! Your cook can start cooking the moment they arrive.'
                : `Kitchen’s ready! ${cookName} can start cooking right away.`,
          }
        : null,
    prepChecked:
      visit.prep === null ? [] : PREP_KEYS.filter((p) => visit.prep![p.field]).map((p) => p.key),
    charge: {
      eyebrow: fixture.charge.eyebrow,
      ...(was === undefined || variant === 'cancelled' ? {} : { was }),
      amount: variant === 'cancelled' && !charged ? formatPaise(0) : formatPaise(total),
      // The frames' "+ 5% GST", at the rate actually priced in.
      taxNote:
        visit.price.pricePaise > 0
          ? `+ ${Math.round((visit.price.gstPaise / visit.price.pricePaise) * 100)}% GST`
          : fixture.charge.taxNote,
      title: fixture.charge.title,
      body: chargeBody,
    },
    refund,
    paymentSheet: {
      title: 'Payment details',
      subtitle: `${date} · ${clockText(start)}`,
      visitLine: {
        label: `Cook visit · ${duration}`,
        // `2165:14262` — "Plan 1, Visit 1 of 3": of the plan's visits a day, once the booking has
        // loaded to count them.
        caption: `Recurring · Plan ${visit.planNumber}, Visit ${visit.visitNumber}${
          planVisits === null ? '' : ` of ${planVisits}`
        }`,
        ...(visit.price.basePricePaise > visit.price.pricePaise
          ? { was: formatPaise(visit.price.basePricePaise) }
          : {}),
        amount: formatPaise(payment?.pricePaise ?? visit.price.pricePaise),
      },
      taxLine: { label: 'GST', amount: formatPaise(payment?.gstPaise ?? visit.price.gstPaise) },
      totalLabel: 'Total',
      totalCaption: 'Inclusive of all taxes',
      total: formatPaise(total),
      methodEyebrow: 'MODE OF PAYMENT',
      methodName: 'UPI Autopay',
      methodDetail:
        mandate === null
          ? 'Mandate pending'
          : `${mandate.handleMasked ?? 'UPI'} · Mandate ${mandate.status}`,
      manageLabel: 'Manage',
      reminder:
        'Mandate is shared 27 hrs before & payment is auto-debited 3 hrs before your first visit of the day.',
    },
    paymentFailed:
      variant === 'cancelled' &&
      (cancellation?.cancelledBy ?? visit.cancelledBy) === 'payment_failed',
    modifySheet:
      upcoming && quote !== null && quote.cancellable
        ? {
            title: 'Modify booking',
            subtitle: `${date} · ${clockText(start)} · ${cookName ?? 'Cook pending'}`,
            windowTitle:
              quote.feePaise === 0
                ? `Free changes till ${dayLabel(feeAt.dateId)} · ${clockText(feeAt.hhmm)}`
                : `Cancelling now costs ${formatPaise(quote.feePaise)}`,
            steps: [
              { kind: 'now', title: 'Now', caption: 'Today' },
              {
                kind: 'fee',
                title: 'Cancellation fee',
                caption: `${dayLabel(feeAt.dateId).split(',')[0]}, ${clockText(feeAt.hhmm)}`,
              },
              {
                kind: 'visit',
                title: 'Visit',
                caption: `${dayLabel(visit.date).split(',')[0]}, ${clockText(start)}`,
              },
            ],
            note: `Your other visits in Plan ${visit.planNumber} stay as they are.`,
            cancelLabel: 'Cancel this visit',
          }
        : null,
  };
}

/**
 * `Note · Help deep link` and the spec's Help rule: Help (and Share on the recipe row) go straight
 * to WhatsApp with Spoon, prefilled with the booking number, date and cook — "Hi Spoon, I need help
 * with booking 1f3c… · Wed, 14 Oct, 9:00 AM · Cook Meera." The number is the backend's
 * (`support.whatsappUrl`, null when none is configured). A visit has a booking only once it is
 * charged at T−3h; before that "my visit" stands in, and a visit with no cook yet leaves the cook
 * out.
 */
export function visitWhatsAppLink(
  visit: VisitDetailDto,
  purpose: 'help' | 'recipe',
): string | null {
  const url = visit.support.whatsappUrl;
  if (url === null) return null;
  const bookingId = visit.payment?.bookingId ?? visit.bookingId;
  const subject = bookingId === null ? 'my visit' : `booking ${bookingId}`;
  const opening =
    purpose === 'help'
      ? `Hi Spoon, I need help with ${subject}`
      : `Hi Spoon, I have a recipe/dish in mind for ${subject}`;
  const parts = [opening, `${dayLabel(visit.date)}, ${clockText(visit.startTime)}`];
  if (visit.cook !== null) parts.push(visit.cook.displayName);
  return `${url.split('?')[0] ?? url}?text=${encodeURIComponent(`${parts.join(' · ')}.`)}`;
}

const MEALS = { morning: 'Breakfast', afternoon: 'Lunch', evening: 'Dinner' } as const;

/**
 * The rate card's header for a real visit (`1501:6631`: "Lunch with Cook Asha" over
 * "Sun, 12 Apr · 1:15 PM · 1 hr"). Null with no cook — there is no one to rate.
 */
export function rateVisitInfo(visit: VisitDetailDto): RateVisitInfo | null {
  if (visit.cook === null) return null;
  return {
    title: `${MEALS[visit.timeOfDay]} with ${visit.cook.displayName}`,
    meta: `${dayLabel(visit.date)} · ${clockText(visit.startTime)} · ${durationText(visit.durationMinutes)}`,
    cookName: visit.cook.displayName,
    photoUri: visit.cook.profileImageUrl,
  };
}

const FEEDBACK_MAX = 2000;

/**
 * What `PUT /v1/bookings/:id/rating` is sent for a rate-card submission (Figma "Ratings"
 * `1603:50`): stars (1–5 in halves), `exceptional` for 5+ — which is 5 stars, never a sixth — the
 * band's chip keys, the written note, "Prefer a different cook next time?" below 4, and the voice
 * note, photos and video to upload first.
 */
export type VisitRatingRequest = ReturnType<typeof ratingRequestFor>;

export function ratingRequestFor(submission: RateVisitSubmission): {
  readonly stars: number;
  readonly exceptional?: true;
  readonly feedback?: string;
  readonly chips: readonly string[];
  readonly avoidCook?: true;
  readonly attachments: readonly RatingAttachment[];
} {
  const plus = submission.rating === VISIT_RATING_PLUS;
  const stars = plus ? 5 : (submission.rating as number);
  const tier = ratingTier(submission.rating);
  const low = tier === 'belowPar' || tier === 'disappointing' || tier === 'veryPoor';
  // Only the band's own chips, in its drawn order — a pick left over from the other band is not
  // something the customer can see they chose.
  const chips = (low ? RATING_CHIPS_NEGATIVE : RATING_CHIPS_POSITIVE)
    .filter((chip) => submission.chips.includes(chip.key))
    .map((chip) => chip.key);
  const feedback = submission.feedback.text.trim().slice(0, FEEDBACK_MAX);
  return {
    stars,
    ...(plus ? { exceptional: true as const } : {}),
    ...(feedback === '' ? {} : { feedback }),
    chips,
    ...(low && submission.avoidCook ? { avoidCook: true as const } : {}),
    attachments: attachmentsOf(submission.feedback),
  };
}
