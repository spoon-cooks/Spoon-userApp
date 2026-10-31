import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { formatMinutes, formatPaise } from '@core/format';
import { useApiQuery, ready } from '@core/data';
import type { ScreenQuery } from '@core/data';
import { getUserMessage, normalizeError } from '@core/errors';
import { getLogger } from '@core/logging';
import { assertNever } from '@core/render';
import { useRuntime } from '@core/runtimeContext';
import { currentAddressOf, useAddresses } from '@features/address';
import { availabilityKeys, useInstantAvailability } from '@features/availability';
import type { InstantAvailabilityDto } from '@features/availability';
import { priceForSlot, useCatalogue } from '@features/catalogue';
import {
  CheckoutCancelledError,
  CheckoutFailedError,
  razorpayCheckoutLauncher,
  usePayForBooking,
} from '@features/payment';
import type { CheckoutLauncher } from '@features/payment';

import {
  bookingDetailFrom,
  extensionIdFor,
  extensionMinutesFrom,
  isLateVerdict,
  tipSheetFrom,
  trackingDetailFrom,
} from './adapters';
import {
  bookingKeys,
  createBookingApi,
  useBookingDetail,
  useBookingRefunds,
  useCreateBooking,
  useCreateExtension,
  useExtensionOptions,
  useQuote,
  useTipCook,
  useTracking,
} from './api';
import type { BookingCreateResponse, QuoteResponse } from './api';
import { viewForBooking } from './state/bookingStatusView';
import type { BookingView } from './state/bookingStatusView';
import {
  DEMO_BOOKING_ARRIVED,
  DEMO_BOOKING_AUTO_CANCELLED,
  DEMO_BOOKING_COMPLETION,
  DEMO_BOOKING_CONFIRMATION,
  DEMO_BOOKING_CONFIRM_REASSIGN,
  DEMO_BOOKING_CUSTOMER_CANCELLED,
  DEMO_BOOKING_FEEDBACK_SUBMITTED,
  DEMO_BOOKING_EN_ROUTE,
  DEMO_BOOKING_EN_ROUTE_LATE,
  DEMO_BOOKING_REASSIGNED,
  DEMO_BOOKING_REASSIGNED_LATE,
  DEMO_EXTENSION,
  DEMO_INSTANT_AVAILABLE,
  DEMO_INSTANT_NO_SLOTS,
  DEMO_INSTANT_OUT_OF_SHIFT,
  demoCookingExtendedBooking,
  demoInServiceBooking,
} from '@/demo/fixtures/booking';
import type { BookingDetailViewModel, ExtensionViewModel, InstantViewModel } from './types';

/**
 * Booking data.
 *
 * ## The dev-id seam
 *
 * `DEMO_VIEWS` is keyed by the DEV route names (`enRoute`, `arrived`, …) that the review menu
 * navigates to. A real booking id is a UUID and can never collide with one, so the two paths are
 * disjoint by construction — and the whole fixture branch is behind `__DEV__`, so a release build
 * only ever has the API path.
 *
 * The fixtures are deliberately kept (§27): several lifecycle states are hard to reach on a real
 * backend — a cook must physically arrive, a service must run long — and they remain the fastest
 * way to review those designed screens. What they no longer do is stand in the way of real data.
 *
 * ## Not everything is wired, and the gaps are real
 *
 * `bookingDetailFrom` fills the status, the address, the price, the schedule rows and
 * `allowedActions` from the payload. The live half — the ETA and the SERVICE OTP the customer
 * reads out — is not on that payload; it comes from `GET /v1/bookings/:id/tracking` and is
 * layered on by `trackingDetailFrom`. Tracking is only polled in the states where the server has
 * anything to say, so a confirmed-but-not-yet-assigned booking makes no tracking request.
 */

/**
 * The designed COPY for each lifecycle view — not a data source.
 *
 * ## The defect this replaces
 *
 * This table used to be keyed by VIEW names (`confirmation`, `enRoute`, `arrived`, `completion`)
 * and indexed by BACKEND STATUSES (`created`, `assigned`, `cook_en_route`, `cook_arrived`,
 * `cooking`, `completed`, `cancelled`). Only `cancelled` collided, by accident. Every other real
 * booking missed and fell back to the confirmation copy, so:
 *
 *   `cook_en_route`  drew Confirmation instead of En route — no ETA, no tracking body
 *   `cook_arrived`   drew Confirmation instead of Arrived  — no Start OTP, no Start Service
 *   `cooking`        was explicitly rewritten to `enRoute`  — no timer, no End OTP, no Extend
 *   `completed`      drew Confirmation instead of Completion — no rating, no tip
 *
 * and because the confirmation copy carries none of `tracking` / `arrived` / `inService` /
 * `completion`, the host's `switch` then hit its `undefined` guard and rendered the generic
 * "This booking is being updated" fallback. Every live booking landed there.
 *
 * ## What it is keyed by now
 *
 * The RESOLVED VIEW, from `viewForBooking` — the same pure function `bookingDetailFrom` calls with
 * the same inputs, so the copy and the view can never disagree. The two payload facts that a
 * status alone cannot express are inputs to it: `reassignment.occurred` (8a → 8b) and the SERVER's
 * `timingVerdict` (9a → 9b, 10a → 10b), which selects between the two drawn punctuality variants
 * rather than the client comparing an ETA against its own clock.
 *
 * ## Why fixtures supply copy at all
 *
 * Banner titles, note text, CTA labels and section headings have no endpoint and are not domain
 * state. They were transcribed from the audited frames and live in `demo/fixtures` because that is
 * where the transcription is auditable against Figma. What the fixtures must NOT supply is
 * business truth, and `bookingDetailFrom` overwrites every such field — cook name, timer target,
 * arrival time, OTP digits, refund amount, schedule line — from the DTO before anything renders.
 */
function lifecycleCopyFor(input: {
  readonly view: BookingView;
  readonly reassigned: boolean;
  readonly late: boolean;
  readonly startedAtMs: number;
}): BookingDetailViewModel {
  switch (input.view) {
    // 8a, and 8b (`289:6607`) once the server reports the assignment changed.
    case 'confirmation':
      return input.reassigned ? DEMO_BOOKING_CONFIRM_REASSIGN : DEMO_BOOKING_CONFIRMATION;

    // 9a `3:1381` / 9b `99:1413`. The variant is the backend's `timingVerdict`, never a clock.
    case 'enRoute':
      return input.late ? DEMO_BOOKING_EN_ROUTE_LATE : DEMO_BOOKING_EN_ROUTE;

    // 10a `201:100` / 10b `209:747`.
    case 'reassigned':
      return input.late ? DEMO_BOOKING_REASSIGNED_LATE : DEMO_BOOKING_REASSIGNED;

    // 11 `3:1658`.
    case 'arrived':
      return DEMO_BOOKING_ARRIVED;

    /**
     * 12a `101:1812`. The factory's `nowMs` only seeds the sample end time, which
     * `bookingDetailFrom` immediately replaces with `timing.expectedEnd`; it is passed a stable
     * value so the object identity does not churn on every render.
     *
     * 12b `292:1197` (Cooking extended) is the same screen plus `292:1399`, and its notice is a
     * SERVER report. No field on `GET /v1/bookings/:id` says "an extension took effect", so the
     * notice is not synthesised here — recorded as a backend gap rather than guessed at from a
     * moved `expectedEnd`, which would also fire for a late start.
     */
    case 'inService':
      return demoInServiceBooking(input.startedAtMs);

    // 14a `299:1424`, and 14b `319:3191` — which `bookingDetailFrom` selects from
    // `allowedActions.canRate` rather than from a second copy object.
    case 'completion':
      return DEMO_BOOKING_COMPLETION;

    // 8e `201:278`.
    case 'autoCancelled':
      return DEMO_BOOKING_AUTO_CANCELLED;

    // 8d `606:4895` — the customer's own cancellation. No apology: `viewForBooking` sends anything
    // that is not a SYSTEM cancellation here instead of to `201:278`'s apology copy.
    case 'customerCancelled':
      return DEMO_BOOKING_CUSTOMER_CANCELLED;

    /**
     * `cancelled` is an intermediate value `resolveBookingView` produces before `viewForBooking`
     * reads `cancelledBy` and upgrades it to one of the two screens above — it should not reach
     * this function in practice. An unrecognised status is genuinely unknown. Both fall back to
     * the shared header copy, which is all the safe fallback (`unknownView`) needs.
     */
    case 'cancelled':
    case 'unknown':
      return DEMO_BOOKING_CONFIRMATION;
  }
}

/** Development-only variants, so every lifecycle surface is reachable for visual review. */
const DEMO_VIEWS: Readonly<Record<string, BookingDetailViewModel>> = {
  confirmation: DEMO_BOOKING_CONFIRMATION,
  confirmReassign: DEMO_BOOKING_CONFIRM_REASSIGN,
  enRoute: DEMO_BOOKING_EN_ROUTE,
  enRouteLate: DEMO_BOOKING_EN_ROUTE_LATE,
  arrived: DEMO_BOOKING_ARRIVED,
  completion: DEMO_BOOKING_COMPLETION,
  feedbackSubmitted: DEMO_BOOKING_FEEDBACK_SUBMITTED,
  // Server-reported states. Nothing in this app can navigate INTO them on its own.
  reassigned: DEMO_BOOKING_REASSIGNED,
  reassignedLate: DEMO_BOOKING_REASSIGNED_LATE,
  autoCancelled: DEMO_BOOKING_AUTO_CANCELLED,
  customerCancelled: DEMO_BOOKING_CUSTOMER_CANCELLED,
};

function isDevBookingId(bookingId: string): boolean {
  return (
    __DEV__ &&
    (bookingId in DEMO_VIEWS || bookingId === 'inService' || bookingId === 'cookingExtended')
  );
}

/**
 * The two checkout-backed service actions, with the REAL launcher bound.
 *
 * They exist for the same reason `useBookingSubmission` binds it rather than the route: which
 * payment SDK is installed is a property of this build, not of a screen, and
 * `unavailableCheckoutLauncher` stays the fail-closed default so a host without the native
 * module refuses instead of pretending. The mutations themselves take a launcher so they remain
 * testable without one.
 *
 * Nothing else changes for the caller: same variables, same `isPending`, same errors.
 */
export function useTipCheckout() {
  return useTipCook(razorpayCheckoutLauncher);
}

export function useExtensionCheckout() {
  return useCreateExtension(razorpayCheckoutLauncher);
}

/**
 * The default address.
 *
 * Availability, pricing and serviceability are all properties of a SPECIFIC address, so every
 * booking read below needs one. The customer's default is used until a screen owns an address
 * picker; before any address exists this is `null` and the dependent reads stay disabled rather
 * than asking about nowhere.
 */
function useDefaultAddressId(): string | null {
  const addresses = useAddresses();

  return useMemo(() => {
    if (addresses.state.status !== 'ready') return null;
    return currentAddressOf(addresses.state.data)?.id ?? null;
  }, [addresses.state]);
}

/**
 * `1:728` / `275:4938` — how a duration is WRITTEN on a tile.
 *
 * The frames draw "30 min", "45 min", "1 hr", "1.5 hr", "2 hr", "2.5 hrs": anything of an hour or
 * more is written in HOURS, including the half-hours, and only the sub-hour durations stay in
 * minutes. The previous rule converted only exact multiples of 60, so the server's 90 and 150
 * minute options were drawn "90 min" and "150 min" against the file's "1.5 hr" and "2.5 hrs".
 *
 * Presentation only — the duration itself, and which are offered, remain the catalogue's.
 */
export function durationLabelFor(durationMinutes: number): string {
  if (durationMinutes < 60) return `${durationMinutes} min`;
  const hours = durationMinutes / 60;
  // The frame writes the plural only past two hours ("2 hr", then "2.5 hrs"), which is the file's
  // own inconsistency and is reproduced rather than tidied.
  const unit = hours > 2 ? 'hrs' : 'hr';
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} ${unit}`;
}

/**
 * The struck "was" price on the duration tiles (pricing sheet, 2026-08-27).
 *
 * The backend publishes ONLY the amount actually charged (`serviceAmountPaise`); the struck
 * figure is the sheet's Base column — a flat ₹5/min anchor — COMPUTED from that rate and the
 * server's own price, never transcribed per tile. A price change therefore moves the strike with
 * it, and the strike disappears for any duration the anchor no longer undercuts (a real price at
 * or above ₹5/min draws a plain tile, not a ₹0-off promo).
 */
const ANCHOR_RATE_PAISE_PER_MINUTE = 500;

export function durationMerchandisingFor(duration: {
  readonly durationMinutes: number;
  readonly serviceAmountPaise: number;
  readonly strikePricePaise?: number | null | undefined;
}): { readonly strikePrice?: string } {
  const strikePaise = strikePaiseFor(duration);
  return strikePaise === null ? {} : { strikePrice: formatPaise(strikePaise) };
}

/**
 * The struck price in paise, or `null` for no strike.
 *
 * The backend's `strikePricePaise` wins whenever it is sent, null included (backend DEC-088): it
 * knows the published list price and that an Ops-set customer price is shown without a strike.
 * The ₹5/min anchor below is only for a backend that predates the field.
 */
export function strikePaiseFor(duration: {
  readonly durationMinutes: number;
  readonly serviceAmountPaise: number;
  readonly strikePricePaise?: number | null | undefined;
}): number | null {
  if (duration.strikePricePaise !== undefined) return duration.strikePricePaise;
  const anchorPaise = duration.durationMinutes * ANCHOR_RATE_PAISE_PER_MINUTE;
  if (anchorPaise <= duration.serviceAmountPaise || duration.serviceAmountPaise === 0) return null;
  return anchorPaise;
}

/**
 * A booking's struck "was" price (backend DEC-088), pre-tax and with the booking's own tax rate
 * applied — or null when there was no strike, or it is not above what was charged.
 */
export function bookingStrikeOf(price: {
  readonly serviceAmountPaise: number;
  readonly taxRateBps: number;
  readonly strikeAmountPaise?: number | null | undefined;
}): { readonly servicePaise: number; readonly totalPaise: number } | null {
  const strike = price.strikeAmountPaise ?? null;
  if (strike === null || strike <= price.serviceAmountPaise) return null;
  return {
    servicePaise: strike,
    totalPaise: strike + Math.round((strike * price.taxRateBps) / 10_000),
  };
}

/** `dur-90` <-> 90. The id is the client's own handle for a server duration, not a server id. */
const DURATION_ID_PREFIX = 'dur-';

export function durationIdFor(durationMinutes: number): string {
  return `${DURATION_ID_PREFIX}${durationMinutes}`;
}

function durationMinutesFrom(durationId: string | null): number | null {
  if (durationId === null || !durationId.startsWith(DURATION_ID_PREFIX)) return null;
  const minutes = Number.parseInt(durationId.slice(DURATION_ID_PREFIX.length), 10);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

/**
 * Instant unavailability reasons -> the two DESIGNED blocked states (R-INST-13).
 *
 * The vocabulary is open (see the availability schema), so this maps the reasons that mean "the
 * hub is closed now" to the out-of-shift artwork and lets everything else fall to the general "no
 * instant slots" state, which is true whatever the reason was. The client never decides
 * availability itself.
 *
 * Closed is the backend's `OUTSIDE_OPERATING_HOURS` (the job cannot fit inside the hub's hours),
 * or `NO_PRESENT_COOK` while the clock is outside the hub's window: before opening no cook is on
 * shift yet, so that is the reason the server gives. It used to test `OUTSIDE_OPERATING_WINDOW`,
 * which Instant never sends, so the out-of-shift state never showed.
 */
const CLOSED_REASONS = new Set(['OUTSIDE_OPERATING_HOURS', 'NO_PRESENT_COOK']);

export interface HubWindow {
  readonly timeZone: string;
  readonly openLocalMinute: number;
  readonly closeLocalMinute: number;
}

function localMinuteOf(nowMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(nowMs));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

/** `360` -> "6 AM", `390` -> "6:30 AM", `720` -> "12 PM". */
export function openingTimeLabel(localMinute: number): string {
  const hour24 = Math.floor(localMinute / 60) % 24;
  const minute = localMinute % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const suffix = hour24 < 12 ? 'AM' : 'PM';
  return minute === 0
    ? `${hour12} ${suffix}`
    : `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

/**
 * The out-of-shift message, or `null` when this refusal is not "closed now" or the hub's hours
 * are not known yet. Never a made-up time: the opening minute is the hub's, from the catalogue
 * read for this address.
 */
export function closedMessageFor(
  reason: string | undefined,
  window: HubWindow | null,
  nowMs: number,
): string | null {
  if (reason === undefined || !CLOSED_REASONS.has(reason) || window === null) return null;
  const nowMinute = localMinuteOf(nowMs, window.timeZone);
  const insideWindow = nowMinute >= window.openLocalMinute && nowMinute < window.closeLocalMinute;
  if (reason === 'NO_PRESENT_COOK' && insideWindow) return null;
  const day = nowMinute < window.openLocalMinute ? 'today' : 'tomorrow';
  return `Slots open at ${openingTimeLabel(window.openLocalMinute)} ${day}`;
}

/**
 * The Instant sheet.
 *
 *  - `GET /v1/catalogue` -> the durations, their prices and the arrival promise
 *  - `GET /v1/availability/instant` -> whether a cook can actually come now, and why not
 *  - `POST /v1/bookings/quote` -> the CTA amount, once a duration is chosen
 *
 * The CTA carries a TOTAL, and the only total is the quote's: the catalogue publishes a service
 * amount, and the quote is what adds the tax the server actually charges. Until a duration is
 * selected there is no quote, and the designed label stands.
 *
 * Availability is asked about the customer's default address and the selected duration. With no
 * address or no selection there is nothing to ask, and the sheet renders the catalogue's grid
 * without claiming that a cook is available.
 */
/**
 * "15 mins" for the arrival row, or empty where there is nothing honest to put in it.
 *
 * The server's per-address estimate first, its fixed promise second, nothing third. Same order
 * Home applies, so the two screens cannot disagree about which source wins.
 */
function etaMinutesFor(live: InstantAvailabilityDto | null): string {
  if (live === null || live.available !== true) return '';

  const estimated = live.projectedArrival?.etaMinutes;
  if (typeof estimated === 'number' && estimated > 0) return formatMinutes(Math.round(estimated));

  return live.arrivalTargetMinutes > 0 ? formatMinutes(live.arrivalTargetMinutes) : '';
}

export function useInstantData(
  selection: { durationId?: string | null } = {},
): ScreenQuery<InstantViewModel> {
  const catalogue = useCatalogue();
  const addressId = useDefaultAddressId();
  const durationMinutes = durationMinutesFrom(selection.durationId ?? null);

  const availability = useInstantAvailability({ addressId, durationMinutes });
  const quote = useQuote({ addressId, slotType: 'instant', durationMinutes });
  // The clock the out-of-shift message is read against; a later refusal refetches the sheet.
  const [openedAtMs] = useState(() => Date.now());
  // The hub's own hours, only when a refusal may mean "closed now" (R-INST-13).
  const refusal =
    availability.state.status === 'ready' && !availability.state.data.available
      ? availability.state.data.reason
      : undefined;
  const hubCatalogue = useCatalogue({
    enabled: addressId !== null && refusal !== undefined && CLOSED_REASONS.has(refusal),
    ...(addressId === null ? {} : { addressId }),
  });

  const state = useMemo(() => {
    /**
     * Before the catalogue answers, the sheet draws its designed chrome and NO PRICES.
     *
     * It used to return `DEMO_INSTANT_AVAILABLE` whole, which is six duration tiles carrying the
     * frame's transcribed ₹69 / ₹99 / ₹129 / ₹189 / ₹259 / ₹319 — and a struck-through "was"
     * price beside each one. Both are inventions: the amounts are a snapshot of a pricing policy
     * that moves without a release, and DEC-071 is explicit that V0 has no promo engine and no
     * backend `strikePrice` authority at all, so the struck-through figures correspond to no
     * money anyone was ever charged. A customer on a slow connection saw all twelve numbers as
     * though they were real, and one of them could differ from what the quote then charged.
     *
     * Withholding them costs a moment of an empty grid on a cold start and nothing else: the
     * server's own prices arrive immediately after, and the CTA was already unpriced until a
     * quote existed.
     */
    if (catalogue.state.status !== 'ready') {
      return ready<InstantViewModel>({ ...DEMO_INSTANT_AVAILABLE, durations: [], etaLabel: '' });
    }

    const data = catalogue.state.data;
    const live = availability.state.status === 'ready' ? availability.state.data : null;
    const priced = quote.state.status === 'ready' ? quote.state.data : null;

    const base: InstantViewModel = {
      ...DEMO_INSTANT_AVAILABLE,
      /*
       * The REAL estimate, the same one Home states -- `projectedArrival.etaMinutes`, computed by
       * the server for this address from route time to its gate, when the candidate cook comes
       * free, and the preparation allowance.
       *
       * `25:1751` draws this row as "Arriving in 18 mins", and it read `arrivalTargetMinutes`:
       * the operating promise, which the backend locks to one figure for every customer and every
       * address. So the sheet stated a fixed number beside a price and a duration that are both
       * specific to the booking being made.
       *
       * It may legitimately DIFFER from Home's figure. Home probes the shortest duration the
       * catalogue sells; this asks about the duration actually chosen, and a longer booking needs
       * a cook free for longer, which can select a different candidate. They are answers to two
       * different questions, and each screen shows the one it asked.
       *
       * The promise remains the fallback for when no candidate exists, and the row is EMPTY while
       * instant is unavailable -- the sheet states a time the operation can meet, and
       * `NO_PRESENT_COOK` means there is no one to meet it. It returns by itself the moment
       * `available` is true again; there is no flag to unset.
       *
       * Unresolved availability counts as unavailable for the same reason Home treats it that
       * way: showing a promise on the strength of not having asked, then withdrawing it a moment
       * later, is a flicker and a claim with nothing behind it.
       */
      etaLabel: etaMinutesFor(live),
      // The INSTANT price: a customer can be priced differently for Instant and Scheduled.
      durations: data.durations.map((duration) => {
        const price = priceForSlot(duration, 'instant');
        return {
          id: durationIdFor(duration.durationMinutes),
          label: durationLabelFor(duration.durationMinutes),
          price: formatPaise(price.serviceAmountPaise),
          ...durationMerchandisingFor({
            durationMinutes: duration.durationMinutes,
            serviceAmountPaise: price.serviceAmountPaise,
            strikePricePaise: price.strikePricePaise,
          }),
        };
      }),
      // `Book NOW • ₹198` — the amount is the quote's total, tax included, never assembled here.
      ...(priced === null
        ? {}
        : { ctaLabel: `Book NOW • ${formatPaise(priced.quote.totalAmountPaise)}` }),
    };

    // `available: false` is the SERVER refusing, and it is the only thing that blocks the sheet.
    if (live === null || live.available) return ready(base);

    const closedMessage = closedMessageFor(
      live.reason,
      hubCatalogue.state.status === 'ready' ? hubCatalogue.state.data.operatingWindow : null,
      openedAtMs,
    );
    const blocked =
      closedMessage === null
        ? DEMO_INSTANT_NO_SLOTS.unavailable
        : DEMO_INSTANT_OUT_OF_SHIFT.unavailable === undefined
          ? undefined
          : { ...DEMO_INSTANT_OUT_OF_SHIFT.unavailable, message: closedMessage };
    if (blocked === undefined) return ready(base);

    return ready<InstantViewModel>({ ...base, unavailable: blocked });
  }, [catalogue.state, availability.state, quote.state, hubCatalogue.state, openedAtMs]);

  return {
    state,
    refetch: () => {
      catalogue.refetch();
      availability.refetch();
      quote.refetch();
    },
  };
}

/** A complete booking selection — everything `POST /v1/bookings` needs, and nothing more. */
export interface BookingSelection {
  readonly slotType: 'instant' | 'scheduled';
  readonly durationId: string | null;
  /** A start the SERVER returned in the availability grid. Never a client-generated instant. */
  readonly scheduledStart?: string | null;
}

/**
 * How the payment attempt ENDED — never what the booking now is.
 *
 * Deliberately not a boolean and deliberately not "paid". Razorpay's callback is a message from
 * an SDK on the customer's device, and the webhook reaches the backend independently of it, so
 * the only authority on whether a booking is paid is the booking itself. This value exists to
 * decide what the SCREEN does next (stay put, or move on and let the server say), and nothing
 * downstream is allowed to treat `verified` as proof.
 */
export type PaymentOutcome =
  /** The backend accepted the signature. The booking is still re-read to learn what that did. */
  | 'verified'
  /** The customer dismissed checkout. An ordinary choice, not an error to report at them. */
  | 'cancelled'
  /**
   * Checkout RAN and the payment or its verification failed — a declined card, a refused
   * signature. This is the only outcome that has earned the words "your payment failed", and the
   * only one the Payment Failed screen is for.
   */
  | 'failed'
  /** The order is not ready upstream yet; checkout never opened. Retry is safe and idempotent. */
  | 'processing'
  /**
   * Checkout never opened, because something before it did not work — the order could not be
   * created, the device is offline, the SDK is missing from the build.
   *
   * Deliberately NOT `failed`: no payment was attempted, so nothing about it failed. Telling a
   * customer their payment failed when the app never got as far as asking them for one is a
   * false report, and it sent them to a screen offering to retry a payment that had not
   * happened.
   */
  | 'unavailable';

export interface BookingSubmissionResult {
  readonly booking: BookingCreateResponse;
  readonly payment: PaymentOutcome;
}

/**
 * A booking a dismissed checkout left on hold, and the selection it was made for.
 *
 * The key is what stops it being paid against the wrong slot: it carries the address, the slot
 * type, the duration and the exact start, so a customer who changes any of those gets a new
 * booking rather than paying for the one they have moved off.
 */
interface HeldBooking {
  readonly key: string;
  readonly response: BookingCreateResponse;
}

/**
 * Where a payment attempt's outcome sends the customer next, or `null` to stay put.
 *
 * One mapping, shared by every screen that submits a booking (Instant and Scheduled today), so
 * the destinations cannot drift out of sync between callers the way two independently
 * hand-written copies of this logic could.
 *
 * ## Why nothing unpaid is sent to `/booking/:id`
 *
 * A booking that has not been paid for is still `created`, and `created` renders the CONFIRMATION
 * view — the one headed "Booking confirmed!". Sending an unpaid hold there told customers who had
 * just backed out of checkout that their booking was confirmed and a cook was coming. That is the
 * worst thing this flow can say, and it is why only `verified` may ever reach a screen that
 * asserts anything.
 */
export function destinationForPayment(payment: PaymentOutcome, bookingId: string): string | null {
  switch (payment) {
    case 'verified':
      return `/booking/confirming?id=${bookingId}`;
    case 'failed':
      return `/booking/payment-failed?id=${bookingId}`;
    /**
     * Checkout never opened, so no payment was attempted and none of it failed.
     *
     * These briefly went to Payment Failed, on the reasoning that it was at least honest about
     * being unpaid. It is not: it says "Your payment failed" and offers to retry a payment that
     * never happened. The customer stays where they are and the CTA reports why, the same way a
     * refused booking now does.
     */
    case 'processing':
    case 'unavailable':
      return null;
    /**
     * They closed checkout on purpose. There is nothing to tell them and nowhere they asked to
     * go, so both callers leave them exactly where they were: `home.tsx` closes the sheet onto
     * Home, `scheduled.tsx` stays on the grid with the selection intact. Either way the CTA is
     * one press away, which is the whole point of not having moved them.
     */
    case 'cancelled':
      return null;
    default:
      // Exhaustive by construction: a `PaymentOutcome` this app does not yet know how to route
      // is a defect at the CALL SITE, not a reason to guess a destination.
      return assertNever(payment);
  }
}

export interface BookingSubmission {
  /** The live quote for the current selection: the CTA amount and its expiry. */
  readonly quote: ScreenQuery<QuoteResponse>;
  /** False while the selection is incomplete — the CTA has nothing to submit. */
  readonly canSubmit: boolean;
  readonly submitting: boolean;
  /**
   * The last `POST /v1/bookings` REFUSAL, as customer copy, or null.
   *
   * `submit()` rejects when the booking cannot be created, and both hosts used to discard that
   * rejection entirely — the comment even claimed it was "surfaced by the mutation", which was
   * true of nothing: neither the Instant sheet nor the Schedule screen had anywhere to put one.
   * The visible result was a live CTA that did nothing when pressed, on repeat attempts where
   * the server had started declining (a slot gone, an expired quote, a hold already held).
   *
   * PAYMENT failures are not reported here — those come back as a `PaymentOutcome` and have
   * their own screen.
   */
  readonly submitError: string | null;
  /**
   * Creates the booking, then opens checkout for it.
   *
   * Resolves with the created booking and how the payment attempt ended. It rejects only if the
   * BOOKING could not be created — a payment that failed or was cancelled still resolves,
   * because the booking exists (on hold) and the customer must be shown its real state rather
   * than being left on a sheet that implies nothing happened.
   */
  readonly submit: () => Promise<BookingSubmissionResult>;
}

/**
 * Quote -> create, for both booking modes.
 *
 * ## What this does not do
 *
 * It does not price anything, does not decide whether a slot is bookable, and does not confirm a
 * booking. `POST /v1/bookings` returns a booking on HOLD (`holdExpiresAt`); that hold becomes a
 * confirmed booking only when payment is verified SERVER-side. Nothing here treats a created
 * booking as paid.
 *
 * ## Idempotency
 *
 * The key is scoped to the SELECTION, so a retry after a timeout replays the same intent instead
 * of creating a second booking, while a genuinely different selection is a different intent.
 * `@core/api`'s `idempotency` owns the lifetime; `useCreateBooking` releases the scope on success.
 */
export function useBookingSubmission(selection: BookingSelection): BookingSubmission {
  const addressId = useDefaultAddressId();
  const durationMinutes = durationMinutesFrom(selection.durationId);
  const scheduledStart = selection.scheduledStart ?? null;

  const quote = useQuote({
    addressId,
    slotType: selection.slotType,
    durationMinutes,
    scheduledStart,
  });
  const create = useCreateBooking();
  // The REAL launcher. `unavailableCheckoutLauncher` (the fail-closed default) stays the export
  // for hosts with no native module, but the app itself now has one.
  const pay = usePayForBooking(razorpayCheckoutLauncher);
  const { api } = useRuntime();
  const queryClient = useQueryClient();
  /**
   * What to say when checkout never opened.
   *
   * `create.error` covers a REFUSED booking, but `processing` and `unavailable` are not errors —
   * they resolve normally — so there is nothing on any mutation to read them off. Without this
   * they are the silent case all over again: the customer presses Book Now, no sheet appears,
   * and the screen says nothing at all.
   */
  const [couldNotStart, setCouldNotStart] = useState<string | null>(null);

  /**
   * The booking a dismissed checkout left behind, kept so the NEXT press can pay for it instead
   * of creating a second one.
   *
   * `POST /v1/bookings` puts a row in `created` and takes the capacity, and the server's
   * `bookings_customer_active_no_overlap` constraint counts that as live — so a customer who
   * backs out and presses again is refused for overlapping THEMSELVES. Reusing the hold they
   * already have is what makes the retry work; the payment side is idempotent per booking, so
   * reopening checkout returns the same provider order rather than a second one.
   *
   * Held in a ref as well as state: the unmount cleanup below has to read the LATEST value, and
   * a cleanup closed over the first render's state would release nothing.
   */
  const [heldBooking, setHeldBooking] = useState<HeldBooking | null>(null);
  const heldRef = useRef<HeldBooking | null>(null);
  useEffect(() => {
    heldRef.current = heldBooking;
  }, [heldBooking]);

  const selectionKey = [
    'booking.create',
    addressId ?? 'no-address',
    selection.slotType,
    String(durationMinutes),
    scheduledStart ?? 'now',
  ].join(':');

  /**
   * Leaving the screen gives the slot back.
   *
   * Deliberately not on the dismissal itself: the hold is what the retry above reuses, so
   * releasing it the moment checkout closes would cancel the very booking the next press needs.
   * Once the customer has navigated away there is nothing left to reuse it for, and leaving it
   * would block the slot — their own — until the server's sweep expires it.
   *
   * ## Why focus and not unmount
   *
   * An unmount cleanup fires only if the route is actually torn down, and a navigator that keeps
   * the screen mounted underneath would never run it — the hold would survive a trip to Home and
   * go on blocking the slot, which is exactly the symptom this is here to prevent. `useFocusEffect`
   * cleans up on BLUR as well as unmount, so it covers both without depending on which one the
   * navigator does.
   *
   * The held booking is cleared with it: coming back must create a fresh booking, not try to pay
   * for one that has just been cancelled.
   *
   * Fire-and-forget through the api directly rather than the mutation hook, which may be going
   * away alongside this. The query client outlives both, so the grid still gets told.
   */
  useFocusEffect(
    useCallback(() => {
      return () => {
        const held = heldRef.current;
        if (held === null) return;

        heldRef.current = null;
        setHeldBooking(null);
        void releaseAbandonedHold(createBookingApi(api), queryClient, held.response.booking.id);
      };
    }, [api, queryClient]),
  );

  const canSubmit =
    addressId !== null &&
    durationMinutes !== null &&
    (selection.slotType === 'instant' || scheduledStart !== null);

  const submit = useCallback(async (): Promise<BookingSubmissionResult> => {
    if (addressId === null || durationMinutes === null) {
      throw new Error('Booking submitted without a complete selection');
    }

    // A fresh attempt is not still carrying the last one's complaint.
    setCouldNotStart(null);

    /**
     * A hold the customer has moved on from is GIVEN BACK before the new one is asked for.
     *
     * Without this, changing the slot locked the customer out of their own booking. The hold was
     * dropped from state and left alive on the server, where `bookings_customer_active_no_overlap`
     * counts it: dismiss checkout on 8:45, pick 9:00, and `POST /v1/bookings` is refused for
     * overlapping a booking they never paid for, cannot see and cannot cancel. A selection far
     * enough away to avoid the overlap fared no better — it simply succeeded while the abandoned
     * hold went on blocking their first choice until the server's abandon window closed.
     *
     * AWAITED, unlike the blur-time release, and that is the whole point: the create below races
     * it. A fire-and-forget cancel can still be in flight when the server tests the new booking
     * for overlap, which is the refusal this exists to prevent. `releaseAbandonedHold` never
     * throws — a release that fails leaves the hold exactly where it was, the server expires it,
     * and the create proceeds to whatever answer it would have given anyway.
     *
     * ## On the PRESS, not on the chip
     *
     * Releasing the moment a different chip is touched would cost a cancellation round trip per
     * tap and take the hold away from a customer still deciding between 8:45 and 9:00. Pressing
     * Book Now on a different selection is where the intent stops being ambiguous.
     */
    const superseded =
      heldBooking !== null && heldBooking.key !== selectionKey
        ? heldBooking.response.booking.id
        : null;

    if (superseded !== null) {
      // Cleared FIRST, so the focus cleanup cannot race in and cancel it a second time.
      heldRef.current = null;
      setHeldBooking(null);
      await releaseAbandonedHold(createBookingApi(api), queryClient, superseded);
    }

    /**
     * The hold from a dismissed checkout is REUSED rather than duplicated — but only for the
     * selection it was actually made against.
     *
     * `selectionKey` carries the address, the slot type, the duration and the exact start, so a
     * different day, time, length or address can never pay for the booking made for another one.
     * Anything that does not match is a different intent and gets its own booking — and, since
     * the block above, gives the previous one back first.
     */
    const booking =
      heldBooking !== null && heldBooking.key === selectionKey
        ? heldBooking.response
        : await create.mutateAsync({
            input: {
              addressId,
              slotType: selection.slotType,
              durationMinutes,
              ...(scheduledStart === null ? {} : { scheduledStart }),
            },
            scope: selectionKey,
          });

    // The booking now exists on HOLD. Payment is a SEPARATE operation against it, which is why
    // a failure below does not unmake the booking and is not thrown: the hold is real, the
    // server will expire it if nothing pays, and the customer is entitled to see that state.
    const payment = await payAndClassify(pay.mutateAsync, booking.booking.id);

    /**
     * What survives this attempt.
     *
     * A dismissal keeps the booking so the next press pays for THIS one instead of being refused
     * for overlapping it. Anything else lets it go: `verified` has moved on, and `failed` hands
     * the customer to a screen that owns the booking and offers its own retry. The hold itself
     * is released when the screen is left — see the effect above.
     */
    setHeldBooking(payment === 'cancelled' ? { key: selectionKey, response: booking } : null);

    /**
     * Checkout never opened, and neither outcome navigates anywhere — so unless the screen says
     * something, the customer is looking at a live CTA that did nothing when they pressed it.
     * The hold stays and can still be paid for; what they need is to know to try again.
     */
    if (payment === 'processing' || payment === 'unavailable') {
      setCouldNotStart('We could not start the payment just now. Please try again.');
    }

    return { booking, payment };
  }, [
    create,
    pay,
    addressId,
    durationMinutes,
    scheduledStart,
    selection.slotType,
    selectionKey,
    heldBooking,
    api,
    queryClient,
  ]);

  return {
    quote,
    canSubmit,
    submitting: create.isPending || pay.isPending,
    // A refused BOOKING takes precedence: it is the more specific of the two, and the server
    // supplied the wording for it.
    submitError:
      create.error === null ? couldNotStart : getUserMessage(normalizeError(create.error)),
    submit,
  };
}

/**
 * The reason a released hold is recorded under.
 *
 * This used to be `OTHER` plus a free-text detail, because the catalogue published nothing that
 * meant "the customer abandoned checkout" — so every automatic release landed in the data as a
 * CUSTOMER cancellation, indistinguishable from someone who booked a cook and changed their mind.
 *
 * The backend now publishes a dedicated code, and stamps `cancelledBy: 'system'` whenever it is
 * used — unconditionally, not at the caller's discretion — so a release recorded through this
 * route is identical to one the server's own expiry sweep records. No detail is sent: the code
 * says all of it, and `requiresDetail` is false, so any text would be dropped rather than stored.
 *
 * NOT offered to a human — see `CLIENT_ONLY_CANCELLATION_REASONS`.
 */
export const ABANDONED_HOLD_REASON = 'ABANDONED_CHECKOUT';

/**
 * Reason codes this APP sends programmatically, which the catalogue publishes like any other.
 *
 * Nothing on the wire marks them as machine-only, so the cancellation sheet — which renders the
 * published list verbatim — would otherwise offer "abandoned checkout" to a customer choosing why
 * they are cancelling a real booking. Filtering happens here, against the codes this app actually
 * sends, so the list and the sender can never drift apart.
 */
export const CLIENT_ONLY_CANCELLATION_REASONS: readonly string[] = [ABANDONED_HOLD_REASON];

/**
 * Give back the slot a dismissed checkout left held.
 *
 * ## It may never cost the customer anything
 *
 * `POST /cancel` is a FEE-BEARING endpoint — the captured fixture shows one charging the full
 * amount — and nothing here was asked for by the customer, so the preview is read first.
 *
 * What makes a release safe is that NOTHING WAS CAPTURED: a card that was never charged cannot
 * be charged by cancelling. That is the condition checked, and it is not the same as the
 * preview's quoted fee — `chargeAmountPaise` can carry a notional band figure computed off the
 * service amount for a booking that has paid nothing at all. Vetoing on that figure is what left
 * every abandoned hold in place, silently, and with it the customer's own slot.
 *
 * ## It never throws, and it says so when it gives up
 *
 * Every failure — an unreadable preview, a refused cancel, an offline device — leaves the hold
 * exactly where it was, which is the behaviour that existed before this and which the server's
 * own `holdExpiresAt` resolves on its own. It is logged rather than swallowed, because a hold
 * left behind is invisible from the screen: the only symptom is the customer's own start time
 * quietly going missing from the grid a few seconds later.
 *
 * A booking is never reported cancelled here either: the caller's outcome is still `cancelled`,
 * meaning the PAYMENT was, and the booking's real state is whatever the next read says.
 */
async function releaseAbandonedHold(
  bookings: ReturnType<typeof createBookingApi>,
  queryClient: QueryClient,
  bookingId: string,
): Promise<void> {
  const log = getLogger('booking-release');
  // Logged on the way IN as well as on every exit, so "nothing in the log" can be told apart
  // from "it ran and worked" — the two were indistinguishable while only failures were recorded.
  log.warn('Releasing an abandoned hold', { bookingId });

  try {
    const preview = await bookings.cancellationPreview(bookingId);
    const tookNoMoney = preview.capturedAmountPaise === 0 && preview.refundAmountPaise === 0;

    if (!preview.cancellable || !tookNoMoney) {
      log.warn('Left an abandoned hold in place', {
        bookingId,
        cancellable: preview.cancellable,
        capturedAmountPaise: preview.capturedAmountPaise,
        chargeAmountPaise: preview.chargeAmountPaise,
        refundAmountPaise: preview.refundAmountPaise,
      });
      return;
    }

    await bookings.cancel(
      bookingId,
      { reasonCode: ABANDONED_HOLD_REASON },
      `booking.release:${bookingId}`,
    );

    log.warn('Released an abandoned hold', { bookingId });

    // The slot is the server's again; the grid and any booking list have to be told, or the
    // screen the customer returns to is still drawing the hold that no longer exists.
    void queryClient.invalidateQueries({ queryKey: bookingKeys.all() });
    void queryClient.invalidateQueries({ queryKey: availabilityKeys.all() });
  } catch (error) {
    log.warn('Could not release an abandoned hold', { bookingId, error });
  }
}

/**
 * Pay for an already-created booking, and turn whatever happens into a `PaymentOutcome` rather
 * than letting the SDK's success/failure speak for itself (ruling R-1: the client never infers a
 * payment from a callback). Shared by `useBookingSubmission` (paying for the booking it just
 * created) and `usePaymentRetry` (paying again for one that already exists), because the classify
 * step neither knows nor cares which caller it was.
 *
 * Takes `mutateAsync` alone, not the whole mutation — the only thing it does with it is call it.
 */
async function payAndClassify(
  mutateAsync: ReturnType<typeof usePayForBooking>['mutateAsync'],
  bookingId: string,
): Promise<PaymentOutcome> {
  try {
    const order = await mutateAsync({ bookingId, description: 'Spoon cooking service' });

    // `usePayForBooking` returns the order without opening checkout when the upstream order is
    // not ready. Nothing was charged and the same idempotency key retries the SAME order.
    if (order.status === 'processing' || order.providerOrderId === null) {
      return 'processing';
    }
    return 'verified';
  } catch (error) {
    /**
     * Classified by HOW FAR this got, not merely by the fact it threw.
     *
     * `CheckoutCancelledError` — the customer dismissed the sheet. A choice, not a fault.
     * `CheckoutFailedError`    — checkout OPENED and the payment or its verification failed.
     *                            The only case that has earned the words "payment failed".
     * anything else            — the order call, the SDK load, the network: checkout never
     *                            opened, so no payment was attempted and none of it failed.
     *
     * That last branch used to fall in with `failed`, which is how a booking whose ORDER could
     * not be created ended up on a screen telling the customer their payment had failed.
     */
    const outcome =
      error instanceof CheckoutCancelledError
        ? 'cancelled'
        : error instanceof CheckoutFailedError
          ? 'failed'
          : 'unavailable';

    /**
     * Logged because `cancelled` is the one outcome that shows the customer NOTHING — the screen
     * simply stays put — so a rejection wrongly read as a dismissal is indistinguishable on the
     * device from a button that did not work. This line is what tells the two apart.
     */
    getLogger('booking-payment').warn('Checkout did not complete', { bookingId, outcome, error });
    return outcome;
  }
}

/**
 * Retry payment on a booking that already exists and is still on HOLD.
 *
 * Used by the Payment Failed screen: the booking was created once, checkout failed or was
 * cancelled, and the customer is trying again against the SAME booking. `usePayForBooking`'s
 * idempotency scopes are keyed by `bookingId` alone, so this reuses the original order rather
 * than creating a second one — the same guarantee the `'processing'` outcome already relies on.
 *
 * `launcher` defaults to the real Razorpay checkout, same as `usePayForBooking` itself; a test
 * substitutes a stub the same way.
 */
/**
 * How long to wait before the one retry a `processing` answer earns.
 *
 * `processing` means the server holds an unresolved order attempt. The worker reconciles those
 * inside the outbox loop, which production runs every 2s (`OUTBOX_POLL_INTERVAL_MS`), so this
 * clears a full cycle with room to spare rather than racing it.
 */
export const PROCESSING_RETRY_DELAY_MS = 2_500;

/**
 * Pays, and gives `processing` exactly one second chance.
 *
 * `processing` is the server saying "ask again", not a refusal: an order attempt is unresolved,
 * and the worker usually adopts the provider's order moments later. Left alone, the customer had
 * to know that and press again -- so the recovery existed but nobody reached it.
 *
 * ONE retry, never a loop. If it is still unresolved after a full reconciliation cycle, the
 * honest answer is to report it and let the customer decide.
 *
 * `sleep` is injected so this is testable without timers. Every other outcome returns untouched:
 * a dismissal, a decline and a checkout that never opened are all answers, and retrying any of
 * them would be guessing.
 */
export async function payRetryingOnceWhileProcessing(
  attempt: () => Promise<PaymentOutcome>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  delayMs: number = PROCESSING_RETRY_DELAY_MS,
): Promise<PaymentOutcome> {
  const first = await attempt();
  if (first !== 'processing') return first;
  await sleep(delayMs);
  return attempt();
}

export function usePaymentRetry(
  bookingId: string,
  launcher: CheckoutLauncher = razorpayCheckoutLauncher,
): {
  readonly retrying: boolean;
  readonly retry: () => Promise<PaymentOutcome>;
} {
  const pay = usePayForBooking(launcher);
  return { retrying: pay.isPending, retry: () => payAndClassify(pay.mutateAsync, bookingId) };
}

/**
 * The extension sheet — `3:2002` / `275:4189`.
 *
 * ## Two sources, in priority order, and neither is the frame
 *
 * `GET /v1/bookings/:id/extension-options` is the authority when a booking is live: it prices
 * THIS service's extensions, carries the tax and the total the customer will actually be charged,
 * and states each option's `newExpectedEnd`. `GET /v1/catalogue` publishes the same SKUs without
 * a booking to price them against, and is the fallback for the moment before the per-booking read
 * lands (and for the review route, which has no booking at all).
 *
 * An empty option list is the server saying no extension is offered — the sheet then draws its
 * designed `275:4283` fallback block and the CTA is inert, rather than offering minutes nobody
 * will sell.
 *
 * ## The CTA amount
 *
 * `275:4265` draws "Extend • ₹16" — the pill CARRIES the price, so the price is business truth on
 * a control that takes money. It is composed from the selected option's `totalAmountPaise`, which
 * is the tax-inclusive figure the checkout order is created for, and never from the frame's
 * transcribed ₹16 or from base + a rate applied here.
 *
 * Before either source answers the label falls back to the drawn UNPRICED wording — the CTA says
 * what it can honestly say, exactly as the Instant sheet's "Book NOW" does before a quote exists.
 *
 * The option TILES keep drawing `pricePaise`, the pre-tax SKU amount, because that is what
 * `143:372`'s compact tiles draw; the tax is disclosed by `275:4272`'s explainer and charged on
 * the total the CTA names.
 */
export function useExtensionData(
  selection: { bookingId?: string | null; optionId?: string | null } = {},
): ScreenQuery<ExtensionViewModel> {
  const catalogue = useCatalogue();

  /**
   * The per-booking read is asked for ONLY where the server says the booking can be extended.
   *
   * `allowedActions.canExtend` was parsed and then read by nothing, so every booking detail screen
   * asked for extension options on mount whatever the status -- and a booking that is over cannot
   * be extended, so the server correctly refused: 409 `INVALID_BOOKING_STATE` on a completed one,
   * 404 on one with no session at all. Nothing broke, because the sheet falls back to the
   * catalogue's published options, which is why it went unnoticed. What it cost was a failed round
   * trip on every past booking anyone opened, and a log full of expected 409s for a real failure
   * to hide in.
   *
   * This observes the SAME query `useBookingDetailData` already runs -- same key, same cache
   * entry, no second request -- so the flag is read where the decision is made rather than
   * threaded down through the screen.
   */
  const detail = useBookingDetail(selection.bookingId ?? null);
  const canExtend =
    detail.state.status === 'ready' ? detail.state.data.allowedActions.canExtend : false;

  const bookingOptions = useExtensionOptions(canExtend ? (selection.bookingId ?? null) : null);
  const optionId = selection.optionId ?? null;

  const state = useMemo(() => {
    const live = bookingOptions.state.status === 'ready' ? bookingOptions.state.data : null;
    const published =
      catalogue.state.status === 'ready' ? (catalogue.state.data.extension?.options ?? null) : null;

    // Neither source has answered. The sheet keeps its designed copy, and every price on it is
    // withheld rather than transcribed — `options: []` draws the fallback block, not a price list.
    if (live === null && published === null) {
      return ready<ExtensionViewModel>(unofferedExtension());
    }

    /**
     * The LADDER is the catalogue's. FEASIBILITY is the per-booking read's. They are two
     * different questions, and this used to answer both with one list.
     *
     * `(live ?? published)` took the per-booking read INSTEAD of the published ladder, and that
     * read omits every length the assigned cook's schedule cannot absorb. So a length that was
     * merely unavailable right now vanished from the sheet: a customer who could buy 10 and 20
     * saw two tiles and no sign that 30 exists, and a service with no room at all lost the whole
     * row. Nothing said why, and nothing distinguished "we do not sell that" from "not today".
     *
     * `275:4265` draws a third tile state for exactly this — `rgba(0,0,0,0.07)` with muted ink —
     * and `PriceTile` has always rendered it. Only the data withheld the tiles.
     *
     * So the two sources are merged rather than chosen between: the catalogue supplies WHICH
     * lengths exist, the per-booking read supplies which of them can be bought now, and a length
     * in the first but not the second is drawn disabled instead of dropped.
     *
     * Both publish `pricePaise` (the tile amount) and `totalAmountPaise` (the tax-inclusive CTA
     * amount), so either can price a tile honestly. The per-booking read still WINS on price
     * where it has one, because it prices THIS service; the catalogue only supplies the lengths
     * it never mentioned.
     *
     * `feasibleMinutes` is null — not empty — when the per-booking read has not answered, which
     * is the case a booking that cannot be extended at all reaches (`canExtend` false, so the
     * query never runs). Null means "feasibility unknown", and nothing is greyed on a guess.
     * Empty means the server answered and the answer was none, which greys the whole ladder.
     */
    const feasibleMinutes = live === null ? null : new Set(live.map((option) => option.minutes));

    const priced = new Map<number, { pricePaise: number; totalAmountPaise: number }>();
    for (const option of [...(published ?? []), ...(live ?? [])]) {
      priced.set(option.minutes, {
        pricePaise: option.pricePaise,
        totalAmountPaise: option.totalAmountPaise,
      });
    }

    const options = [...priced.entries()]
      .map(([minutes, price]) => ({
        minutes,
        pricePaise: price.pricePaise,
        totalAmountPaise: price.totalAmountPaise,
        disabled: feasibleMinutes !== null && !feasibleMinutes.has(minutes),
      }))
      // Each source publishes its own order, so merging them makes neither authoritative. The
      // ladder is sorted by the only thing it is a ladder of.
      .sort((left, right) => left.minutes - right.minutes);

    if (options.length === 0) {
      return ready<ExtensionViewModel>(unofferedExtension());
    }

    /**
     * `143:381` draws "10 mins" selected. The DRAWN default is matched against what the server
     * actually offers rather than assumed: if operations stops selling 10 minutes the sheet opens
     * on the first option the server does offer, which is the designed "something is selected"
     * state without preselecting a length nobody published.
     *
     * Chosen from the SELECTABLE options only. A disabled tile that opened preselected would put
     * a price on the bar for a length the server has already refused, one tap from a
     * `POST /extensions` it would reject — the same trap `unofferedExtension` was written to
     * avoid. With nothing selectable there is no default, so the bar carries no figure and the
     * CTA stays inert, while the greyed ladder still says what exists.
     */
    const selectable = options.filter((option) => !option.disabled);

    const drawnDefault = extensionMinutesFrom(DEMO_EXTENSION.defaultOptionId ?? null);
    const defaultOption =
      selectable.find((option) => option.minutes === drawnDefault) ?? selectable[0] ?? null;

    const chosenMinutes = extensionMinutesFrom(optionId) ?? defaultOption?.minutes ?? null;
    const chosen = selectable.find((option) => option.minutes === chosenMinutes) ?? defaultOption;

    /*
     * The fixture's own `defaultOptionId` is dropped before anything is added back.
     *
     * Spreading `DEMO_EXTENSION` and then conditionally overriding does NOT clear it: omitting the
     * key leaves the fixture's `ext-10` standing. `unofferedExtension` already destructures it away
     * for the no-options case, and a ladder whose every length is disabled is the same hazard
     * arriving by a new route — the sheet would open preselected on a greyed tile with a price on
     * the bar, one tap from a `POST /extensions` the server has already refused.
     */
    const { defaultOptionId: _drawnDefaultId, ...extensionCopy } = DEMO_EXTENSION;

    const base: ExtensionViewModel = {
      ...extensionCopy,
      options: options.map((option) => ({
        id: extensionIdFor(option.minutes),
        label: `${option.minutes} mins`,
        price: formatPaise(option.pricePaise),
        ...(option.disabled ? { disabled: true } : {}),
      })),
      ...(defaultOption === null ? {} : { defaultOptionId: extensionIdFor(defaultOption.minutes) }),
    };

    // `275:4265` — the amount is the server's tax-inclusive total for the option in play.
    return ready<ExtensionViewModel>(
      chosen === null || chosen === undefined
        ? withoutCtaPrice(base)
        : { ...base, ctaLabel: `Extend • ${formatPaise(chosen.totalAmountPaise)}` },
    );
  }, [catalogue.state, bookingOptions.state, optionId]);

  return {
    state,
    refetch: () => {
      catalogue.refetch();
      bookingOptions.refetch();
    },
  };
}

/**
 * The sheet with NOTHING offered — no options, no preselection, no price on the bar.
 *
 * The drawn `275:4283` fallback block ("Not able to extend at the moment?") is what this state
 * renders, which is the design's own answer to it.
 *
 * `defaultOptionId` has to go with the options. `143:381` preselects "10 mins" because the frame
 * had ten minutes to sell; carrying that id over an EMPTY option list left the CTA live and
 * pre-selected against a length the server had not offered — one tap from `POST /extensions` with
 * minutes nobody quoted. The sheet gates its CTA on `selectedOptionId`, so dropping the default is
 * what makes "no options" mean "nothing to buy".
 */
function unofferedExtension(): ExtensionViewModel {
  const { defaultOptionId: _dropped, ...rest } = DEMO_EXTENSION;
  return withoutCtaPrice({ ...rest, options: [] });
}

/**
 * The drawn CTA wording with the transcribed amount removed.
 *
 * `275:4265` reads "Extend • ₹16" because the frame had a priced option selected. The words are
 * the design's; the figure is the server's, and where there is no server figure the button says
 * "Extend" rather than a price nobody quoted — the same rule the Instant sheet's "Book NOW"
 * already follows.
 */
function withoutCtaPrice(model: ExtensionViewModel): ExtensionViewModel {
  return { ...model, ctaLabel: model.ctaLabel.split('•')[0]?.trim() ?? model.ctaLabel };
}

export function useBookingDetailData(bookingId: string): ScreenQuery<BookingDetailViewModel> {
  // Captured once so the DEV sample's seeded end time does not move on every render.
  const [startedAtMs] = useState(() => Date.now());
  const { logger } = useRuntime();
  const isDev = isDevBookingId(bookingId);
  // `306:2997` — the tip amounts are the catalogue's, never the frame's transcription (§16).
  const catalogue = useCatalogue();

  /**
   * Polled, so the screen follows the booking without being reopened.
   *
   * A cook departing, arriving, starting and finishing are all SERVER transitions the customer is
   * sitting in front of. The detail read owns the status, so polling it is what moves 8a → 9a →
   * 11 → 12a → 14a in place. Tracking polls separately at the cadence the server publishes.
   */
  const remote = useBookingDetail(isDev ? null : bookingId, { poll: true });

  /**
   * Tracking is a LIVE read and is asked for only in the states where the server produces one:
   * a cook is travelling, has arrived, or is cooking. Outside those, the endpoint 404s, and
   * polling it would turn an expected absence into a screenful of errors.
   */
  const trackedStatus = remote.state.status === 'ready' ? remote.state.data.status : null;
  const trackable =
    trackedStatus === 'cook_en_route' ||
    trackedStatus === 'cook_arrived' ||
    trackedStatus === 'cooking';
  const tracking = useTracking(isDev || !trackable ? null : bookingId);

  /**
   * The refund behind `201:278` AND `606:4895` — both cancelled surfaces name an amount.
   *
   * Fetched ONLY for a cancelled booking, whoever cancelled it. Every other lifecycle state
   * passes `null` and makes no request.
   */
  const cancelled = remote.state.status === 'ready' && remote.state.data.status === 'cancelled';
  /*
   * `bookingId === ''` guarded explicitly, not just `!cancelled`: the route host
   * (`app/(app)/booking/[id].tsx`) falls back to `''`, not `null`, while Expo Router's `id`
   * param is momentarily unresolved -- the same reason it guards `useCallCook`/`useCancelFlow`
   * the same way. `useBookingRefunds`'s own `enabled` check only tests `!== null`, so an empty
   * string reached it uncaught and became `GET /v1/bookings//refunds`, a guaranteed 400.
   */
  const refunds = useBookingRefunds(isDev || !cancelled || bookingId === '' ? null : bookingId);

  const devSample = useMemo(() => {
    if (!isDev) return null;
    return (
      DEMO_VIEWS[bookingId] ??
      (bookingId === 'inService'
        ? demoInServiceBooking(startedAtMs)
        : bookingId === 'cookingExtended'
          ? demoCookingExtendedBooking(startedAtMs)
          : DEMO_BOOKING_EN_ROUTE)
    );
  }, [isDev, bookingId, startedAtMs]);

  const state = useMemo(() => {
    if (devSample !== null) return ready(devSample);
    if (remote.state.status !== 'ready') return remote.state;

    const dto = remote.state.data;
    const tracked = tracking.state.status === 'ready' ? tracking.state.data : null;

    /**
     * The designed screen for the state the SERVER reported.
     *
     * `viewForBooking` is called with exactly the inputs `bookingDetailFrom` will call it with, so
     * the copy chosen here and the `view` the host switches on are the same answer. Resolving it
     * twice is cheap and pure; passing a pre-resolved view into the adapter would let a caller
     * hand it a view its own DTO does not support.
     */
    const resolution = viewForBooking({
      status: dto.status,
      cancelledBy: dto.cancellation?.cancelledBy ?? null,
      reassigned: dto.reassignment?.occurred === true,
    });

    const base = lifecycleCopyFor({
      view: resolution.view,
      reassigned: dto.reassignment?.occurred === true,
      // The SERVER's punctuality verdict picks 9b over 9a. Absent tracking means no verdict yet,
      // which is not "late" — the on-time frame stands until the backend says otherwise.
      late: isLateVerdict(tracked?.timingVerdict),
      startedAtMs,
    });

    const detail = bookingDetailFrom({
      base,
      dto,
      refunds: refunds.state.status === 'ready' ? refunds.state.data : null,
      timeZone:
        catalogue.state.status === 'ready'
          ? catalogue.state.data.operatingWindow.timeZone
          : undefined,
      onUnknownStatus: (status) =>
        logger.warn('Unmapped booking status from server', { status: String(status) }),
    });

    const withTracking =
      tracked === null ? detail : trackingDetailFrom({ base: detail, dto: tracked });

    // Until the catalogue is in, the sheet keeps its designed copy rather than showing an empty
    // amount row — and it cannot be opened to a wrong figure, because the amounts only appear
    // once the server's have arrived.
    if (catalogue.state.status !== 'ready' || withTracking.tip === undefined) {
      return ready(withTracking);
    }

    return ready<BookingDetailViewModel>({
      ...withTracking,
      tip: tipSheetFrom({
        base: withTracking.tip,
        suggestedAmountsPaise: catalogue.state.data.tips.suggestedAmountsPaise,
        formatAmount: formatPaise,
      }),
    });
  }, [
    devSample,
    remote.state,
    tracking.state,
    refunds.state,
    logger,
    catalogue.state,
    startedAtMs,
  ]);

  return {
    state,
    refetch: () => {
      remote.refetch();
      tracking.refetch();
      refunds.refetch();
      catalogue.refetch();
    },
  };
}

/** Re-exported so a host can prefetch a booking before navigating to it. */
export { bookingKeys, createBookingApi, useApiQuery };
