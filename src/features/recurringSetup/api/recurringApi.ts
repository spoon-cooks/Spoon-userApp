import type { ApiClient, JsonValue } from '@core/api';
import { idempotencyHeader } from '@core/api';

import {
  bookingCancellationQuoteSchema,
  bookingCancellationSchema,
  planCancellationQuoteSchema,
  visitDurationOptionsSchema,
  planCancellationSchema,
  bookingPrepSchema,
  mandateCheckoutSchema,
  mandateStatusViewSchema,
  mandateVerifySchema,
  recurringBookingListSchema,
  recurringBookingSchema,
  recurringCalendarSchema,
  recurringEligibilitySchema,
  recurringQuoteSchema,
  recurringStartTimesSchema,
  visitCancellationQuoteSchema,
  visitDetailSchema,
} from './schemas';
import type {
  BookingCancellationDto,
  BookingCancellationQuoteDto,
  BookingPrepDto,
  MandateCheckoutDto,
  MandateStatusViewDto,
  MandateVerifyDto,
  RecurringBookingDto,
  RecurringCalendarDto,
  RecurringEligibilityDto,
  RecurringQuoteDto,
  RecurringStartTimesDto,
  TimeOfDayDto,
  VisitCancellationQuoteDto,
  VisitDetailDto,
  PlanCancellationDto,
  PlanCancellationQuoteDto,
  VisitDurationOptionsDto,
} from './schemas';

/**
 * Recurring booking endpoints — DEC-086 (V2).
 *
 * The planning reads (`eligibility`, `calendar`, `startTimes`, `quote`) hold nothing. Every route
 * that changes a booking carries an Idempotency-Key scoped to its intent, except `verifyMandate`
 * and the prep checks, which the backend makes idempotent on their own.
 *
 * Every planning route answers a locked household (fewer pool Cooks than the unlock threshold)
 * with 403 `RECURRING_LOCKED`, so `eligibility` is read first and decides whether the flow opens.
 */

export const RECURRING_PATHS = {
  eligibility: '/v1/recurring/eligibility',
  calendar: '/v1/recurring/calendar',
  startTimes: '/v1/recurring/start-times',
  quote: '/v1/recurring/bookings/quote',
  create: '/v1/recurring/bookings',
  list: '/v1/me/recurring-bookings',
  detail: (id: string) => `/v1/me/recurring-bookings/${id}`,
  visit: (id: string, visitId: string) => `/v1/me/recurring-bookings/${id}/visits/${visitId}`,
  visitCancellationQuote: (id: string, visitId: string) =>
    `/v1/me/recurring-bookings/${id}/visits/${visitId}/cancellation-quote`,
  cancelVisit: (id: string, visitId: string) =>
    `/v1/me/recurring-bookings/${id}/visits/${visitId}/cancel`,
  cancellationQuote: (id: string) => `/v1/me/recurring-bookings/${id}/cancellation-quote`,
  cancel: (id: string) => `/v1/me/recurring-bookings/${id}/cancel`,
  planCancellationQuote: (id: string, planNumber: number) =>
    `/v1/me/recurring-bookings/${id}/plans/${String(planNumber)}/cancellation-quote`,
  cancelPlan: (id: string, planNumber: number) =>
    `/v1/me/recurring-bookings/${id}/plans/${String(planNumber)}/cancel`,
  visitDurationOptions: (id: string, visitId: string) =>
    `/v1/me/recurring-bookings/${id}/visits/${visitId}/duration-options`,
  changeVisitDuration: (id: string, visitId: string) =>
    `/v1/me/recurring-bookings/${id}/visits/${visitId}/duration`,
  mandate: (id: string) => `/v1/me/recurring-bookings/${id}/mandate`,
  mandateVerify: (id: string) => `/v1/me/recurring-bookings/${id}/mandate/verify`,
  prep: (bookingId: string) => `/v1/bookings/${bookingId}/prep`,
} as const;

/**
 * One visit of a Plan, as the backend's draft expects it.
 *
 * Visit 1 always runs on every date of its Plan (no `dates`); a later visit lists the Plan dates
 * it runs on. The start must fall inside its time of day. The backend refuses anything else with
 * a 400, so the adapter that builds this from the flow's state is what keeps it valid.
 */
export interface DraftVisitInput {
  readonly visitNumber: number;
  readonly timeOfDay: TimeOfDayDto;
  readonly durationMinutes: number;
  /** Asia/Kolkata `HH:MM`. */
  readonly startTime: string;
  readonly dates?: readonly string[];
}

export interface DraftPlanInput {
  readonly planNumber: number;
  /** The Plan's dates, Asia/Kolkata `YYYY-MM-DD`. Each date is in one Plan only. */
  readonly dates: readonly string[];
  readonly visits: readonly DraftVisitInput[];
}

export interface RecurringDraftInput {
  readonly addressId: string;
  readonly plans: readonly DraftPlanInput[];
}

/** A visit already placed on a date, which a new start must fit beside (Step 5). */
export interface SameDayVisitInput {
  readonly date: string;
  readonly startTime: string;
  readonly durationMinutes: number;
}

export interface StartTimesInput {
  readonly addressId: string;
  readonly dates: readonly string[];
  readonly durationMinutes: number;
  readonly sameDayVisits?: readonly SameDayVisitInput[];
}

/** A reason from the published cancellation catalogue; `OTHER` needs `reasonDetail`. */
export interface CancelReasonInput {
  readonly reasonCode: string;
  readonly reasonDetail?: string;
}

/** What Razorpay's checkout handed back after the customer approved Autopay. */
export interface MandateVerifyInput {
  readonly providerOrderId: string;
  readonly providerPaymentId: string;
  readonly signature: string;
}

export interface BookingPrepInput {
  readonly entryApproved?: boolean;
  readonly groceriesReady?: boolean;
  readonly utensilsReady?: boolean;
}

function draftBody(input: RecurringDraftInput): Record<string, JsonValue> {
  return {
    addressId: input.addressId,
    plans: input.plans.map((plan) => ({
      planNumber: plan.planNumber,
      dates: [...plan.dates],
      visits: plan.visits.map((visit) => ({
        visitNumber: visit.visitNumber,
        timeOfDay: visit.timeOfDay,
        durationMinutes: visit.durationMinutes,
        startTime: visit.startTime,
        // `dates` is refused on Visit 1, not merely ignored.
        ...(visit.visitNumber !== 1 && visit.dates !== undefined
          ? { dates: [...visit.dates] }
          : {}),
      })),
    })),
  };
}

function reasonBody(input: CancelReasonInput): Record<string, JsonValue> {
  return {
    reasonCode: input.reasonCode,
    ...(input.reasonDetail === undefined ? {} : { reasonDetail: input.reasonDetail }),
  };
}

function withSignal(signal: AbortSignal | undefined): { signal?: AbortSignal } {
  return signal === undefined ? {} : { signal };
}

export function createRecurringApi(api: ApiClient) {
  return {
    /** Unlocked or not, Home's chip, the window, limits, times of day and duration prices. */
    async eligibility(signal?: AbortSignal): Promise<RecurringEligibilityDto> {
      return api.request(RECURRING_PATHS.eligibility, {
        parse: (data) => recurringEligibilitySchema.parse(data),
        ...withSignal(signal),
      });
    },

    /** Step 1: the window's days, and which a live Recurring booking already has. */
    async calendar(signal?: AbortSignal): Promise<RecurringCalendarDto> {
      return api.request(RECURRING_PATHS.calendar, {
        parse: (data) => recurringCalendarSchema.parse(data),
        ...withSignal(signal),
      });
    },

    /** Steps 3 and 5: one visit's starts across its dates, beside the Plan's other visits. */
    async startTimes(
      input: StartTimesInput,
      signal?: AbortSignal,
    ): Promise<RecurringStartTimesDto> {
      return api.request(RECURRING_PATHS.startTimes, {
        method: 'POST',
        body: {
          addressId: input.addressId,
          dates: [...input.dates],
          durationMinutes: input.durationMinutes,
          ...(input.sameDayVisits === undefined || input.sameDayVisits.length === 0
            ? {}
            : { sameDayVisits: input.sameDayVisits.map((visit) => ({ ...visit })) }),
        },
        parse: (data) => recurringStartTimesSchema.parse(data),
        ...withSignal(signal),
      });
    },

    /** No idempotency key — a quote holds nothing. */
    async quote(input: RecurringDraftInput, signal?: AbortSignal): Promise<RecurringQuoteDto> {
      return api.request(RECURRING_PATHS.quote, {
        method: 'POST',
        body: draftBody(input),
        parse: (data) => recurringQuoteSchema.parse(data),
        ...withSignal(signal),
      });
    },

    /**
     * 201, `pending_mandate`. Saving holds one pool Cook per visit, and the booking is cancelled
     * unless the customer is sent to approve within the policy's hold (6 minutes) and approves
     * within its approval window (8 minutes from then; V0 DEC-119), so a save is only worth making
     * on the way into the Autopay step: "Book Now". 409 `VISIT_UNAVAILABLE` → re-quote to find which
     * dates need another time.
     */
    async create(input: RecurringDraftInput, scope: string): Promise<RecurringBookingDto> {
      return api.request(RECURRING_PATHS.create, {
        method: 'POST',
        headers: idempotencyHeader(scope),
        body: draftBody(input),
        parse: (data) => recurringBookingSchema.parse(data),
      });
    },

    async list(signal?: AbortSignal): Promise<RecurringBookingDto[]> {
      return api.request(RECURRING_PATHS.list, {
        parse: (data) => recurringBookingListSchema.parse(data),
        ...withSignal(signal),
      });
    },

    async detail(id: string, signal?: AbortSignal): Promise<RecurringBookingDto> {
      return api.request(RECURRING_PATHS.detail(id), {
        parse: (data) => recurringBookingSchema.parse(data),
        ...withSignal(signal),
      });
    },

    async visit(id: string, visitId: string, signal?: AbortSignal): Promise<VisitDetailDto> {
      return api.request(RECURRING_PATHS.visit(id, visitId), {
        parse: (data) => visitDetailSchema.parse(data),
        ...withSignal(signal),
      });
    },

    async visitCancellationQuote(
      id: string,
      visitId: string,
      signal?: AbortSignal,
    ): Promise<VisitCancellationQuoteDto> {
      return api.request(RECURRING_PATHS.visitCancellationQuote(id, visitId), {
        parse: (data) => visitCancellationQuoteSchema.parse(data),
        ...withSignal(signal),
      });
    },

    /** The window and the money are decided by the backend at its own time, never sent. */
    async cancelVisit(
      id: string,
      visitId: string,
      reason: CancelReasonInput,
      scope: string,
    ): Promise<VisitDetailDto> {
      return api.request(RECURRING_PATHS.cancelVisit(id, visitId), {
        method: 'POST',
        headers: idempotencyHeader(scope),
        body: reasonBody(reason),
        parse: (data) => visitDetailSchema.parse(data),
      });
    },

    async cancellationQuote(
      id: string,
      signal?: AbortSignal,
    ): Promise<BookingCancellationQuoteDto> {
      return api.request(RECURRING_PATHS.cancellationQuote(id), {
        parse: (data) => bookingCancellationQuoteSchema.parse(data),
        ...withSignal(signal),
      });
    },

    async cancel(
      id: string,
      reason: CancelReasonInput,
      scope: string,
    ): Promise<BookingCancellationDto> {
      return api.request(RECURRING_PATHS.cancel(id), {
        method: 'POST',
        headers: idempotencyHeader(scope),
        body: reasonBody(reason),
        parse: (data) => bookingCancellationSchema.parse(data),
      });
    },

    /** What deleting a Plan would do now (DEC-092). */
    async planCancellationQuote(
      id: string,
      planNumber: number,
      signal?: AbortSignal,
    ): Promise<PlanCancellationQuoteDto> {
      return api.request(RECURRING_PATHS.planCancellationQuote(id, planNumber), {
        parse: (data) => planCancellationQuoteSchema.parse(data),
        ...withSignal(signal),
      });
    },

    /** Deletes a Plan: its days not charged yet are cancelled free; the rest stay (DEC-092). */
    async cancelPlan(
      id: string,
      planNumber: number,
      reason: CancelReasonInput,
      scope: string,
    ): Promise<PlanCancellationDto> {
      return api.request(RECURRING_PATHS.cancelPlan(id, planNumber), {
        method: 'POST',
        headers: idempotencyHeader(scope),
        body: reasonBody(reason),
        parse: (data) => planCancellationSchema.parse(data),
      });
    },

    /** Whether a visit's duration can still change, and the prices (DEC-093). */
    async visitDurationOptions(
      id: string,
      visitId: string,
      signal?: AbortSignal,
    ): Promise<VisitDurationOptionsDto> {
      return api.request(RECURRING_PATHS.visitDurationOptions(id, visitId), {
        parse: (data) => visitDurationOptionsSchema.parse(data),
        ...withSignal(signal),
      });
    },

    /** Changes one visit's duration, until its day's notice at T−27h (DEC-093). */
    async changeVisitDuration(
      id: string,
      visitId: string,
      durationMinutes: number,
      scope: string,
    ): Promise<VisitDetailDto> {
      return api.request(RECURRING_PATHS.changeVisitDuration(id, visitId), {
        method: 'POST',
        headers: idempotencyHeader(scope),
        body: { durationMinutes },
        parse: (data) => visitDetailSchema.parse(data),
      });
    },

    /**
     * Approve Autopay for a saved booking, or re-approve it for a live one whose mandate lapsed.
     * `intent` also returns the UPI Intent attempt's link; Checkout sends no body, as before.
     */
    async startMandate(
      id: string,
      scope: string,
      flow: 'checkout' | 'intent' = 'checkout',
    ): Promise<MandateCheckoutDto> {
      return api.request(RECURRING_PATHS.mandate(id), {
        method: 'POST',
        headers: idempotencyHeader(scope),
        ...(flow === 'intent' ? { body: { flow } } : {}),
        parse: (data) => mandateCheckoutSchema.parse(data),
      });
    },

    /** The latest mandate and its UPI Intent attempt (polled while approval is open). */
    async mandateStatus(id: string, signal?: AbortSignal): Promise<MandateStatusViewDto> {
      return api.request(RECURRING_PATHS.mandate(id), {
        parse: (data) => mandateStatusViewSchema.parse(data),
        ...withSignal(signal),
      });
    },

    async verifyMandate(id: string, input: MandateVerifyInput): Promise<MandateVerifyDto> {
      return api.request(RECURRING_PATHS.mandateVerify(id), {
        method: 'POST',
        body: {
          providerOrderId: input.providerOrderId,
          providerPaymentId: input.providerPaymentId,
          signature: input.signature,
        },
        parse: (data) => mandateVerifySchema.parse(data),
      });
    },

    async prep(bookingId: string, signal?: AbortSignal): Promise<BookingPrepDto> {
      return api.request(RECURRING_PATHS.prep(bookingId), {
        parse: (data) => bookingPrepSchema.parse(data),
        ...withSignal(signal),
      });
    },

    /** Writable once a Cook is assigned (`409 PREP_NOT_OPEN` before). */
    async updatePrep(bookingId: string, input: BookingPrepInput): Promise<BookingPrepDto> {
      return api.request(RECURRING_PATHS.prep(bookingId), {
        method: 'PUT',
        body: { ...input },
        parse: (data) => bookingPrepSchema.parse(data),
      });
    },
  };
}

export type RecurringApi = ReturnType<typeof createRecurringApi>;
