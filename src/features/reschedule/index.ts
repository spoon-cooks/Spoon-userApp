import { createKeyFactory } from '@core/query';

/**
 * Feature: reschedule.
 *
 * Confirmed C-2 — the same screen as Scheduled with `mode: 'reschedule'`: header and bottom bar
 * read "Reschedule", and the bar carries no price.
 * Confirmed C-3 — there is NO Duration step in reschedule. Rescheduling moves *when*, never
 * *how long*.
 * Ruling R-3 — a booking may be rescheduled up to the server's cap (10, DEC-112); afterwards the
 * option is not shown.
 * Eligibility comes from the backend (see `./eligibility`).
 *
 * TODO(product B-4): whether rescheduling can ever charge is unanswered — the bar shows no price
 * but still shows `Pay →`, which after R-1 means "open Razorpay" for an unspecified amount.
 * Until answered, no submit path may call checkout.
 * TODO(backend-contract): no reschedule endpoint or eligibility field name exists.
 */
export const rescheduleKeys = createKeyFactory('reschedule');

export { canOfferReschedule } from './eligibility';
