import type { MandateStatusViewDto } from '../api';
import type { UpiApp } from './upiApps';

/**
 * The UPI Autopay sheet's state machine (Figma 2316:3558 … 2317:4009, dev notes 2317:13580 …
 * 2317:13617). Pure: the hook (`useAutopayFlow`) feeds it what happened and renders what it says.
 *
 *   choose ──pick──▶ creating ──opened──▶ waiting ──▶ active
 *     ▲  ▲                │                 │  ╲──▶ confirming ──▶ active | failed
 *     │  └──cancel────────┼─────────────────┘   ╲─▶ left | failed
 *     │                   └──(could not open)──▶ left
 *     └── choose another app ◀── left | failed
 *   noApp: the device has no UPI app at all (no frame: the user's decision, install PhonePe or
 *          Google Pay).
 *
 * The server is the only judge of the outcome (`GET …/mandate`):
 *   - mandate `confirmed`                         → active
 *   - attempt failed, `NOT_APPROVED`, or expired  → left ("You left before approving it")
 *   - attempt failed, `DECLINED`                  → failed ("didn't go through")
 *   - approved, the bank still confirming         → waiting, then confirming once the attempt is
 *     `CONFIRMING_AFTER_MS` old (2317:13605: "still pending after 60s of polling")
 * The countdown (2317:13587: "Request expires in 4:52 … At 0, show Left without approving") is the
 * attempt's own `attemptExpiresAt`, read off the server, so it survives the app being in the
 * background while the customer is in their UPI app.
 */
export const CONFIRMING_AFTER_MS = 60_000;

export type AutopayNotice = 'slotTaken' | 'error' | null;

export type AutopayState =
  | { readonly kind: 'choose'; readonly notice: AutopayNotice }
  | { readonly kind: 'creating'; readonly app: UpiApp }
  | {
      readonly kind: 'waiting';
      readonly app: UpiApp;
      readonly link: string;
      readonly startedAt: number;
      readonly expiresAt: number;
      /** When the server first said "approved, bank confirming". */
      readonly authorizedAt: number | null;
    }
  /** `app` is null after a Checkout approval: "Try again" then goes back to the list. */
  | { readonly kind: 'left'; readonly app: UpiApp | null }
  | { readonly kind: 'failed'; readonly app: UpiApp | null }
  | { readonly kind: 'confirming'; readonly app: UpiApp | null }
  | { readonly kind: 'active'; readonly app: UpiApp | null; readonly handleMasked: string | null }
  | { readonly kind: 'noApp' };

export type AutopayEvent =
  | { readonly type: 'APPS_FOUND'; readonly count: number }
  | { readonly type: 'PICK'; readonly app: UpiApp }
  | {
      readonly type: 'OPENED';
      readonly link: string;
      readonly expiresAt: number;
      readonly now: number;
    }
  | { readonly type: 'OPEN_FAILED' }
  | { readonly type: 'START_FAILED'; readonly notice: Exclude<AutopayNotice, null> }
  /** The save on "Book Now" (sheet open) failed before any app was picked. */
  | { readonly type: 'SAVE_FAILED'; readonly notice: Exclude<AutopayNotice, null> }
  | { readonly type: 'STATUS'; readonly status: MandateStatusViewDto; readonly now: number }
  | { readonly type: 'TICK'; readonly now: number }
  | { readonly type: 'CANCEL' }
  | { readonly type: 'CHOOSE_ANOTHER' }
  /** Checkout fallback came back approved, or the bank is still confirming it. */
  | {
      readonly type: 'CHECKOUT_DONE';
      readonly confirmed: boolean;
      readonly handleMasked: string | null;
    }
  /** Checkout fallback was closed: back to the list, nothing lost. */
  | { readonly type: 'CHECKOUT_CLOSED' };

export const INITIAL_AUTOPAY_STATE: AutopayState = { kind: 'choose', notice: null };

function appOf(state: AutopayState): UpiApp | null {
  return 'app' in state ? state.app : null;
}

/** Whether the hook should be polling the server in this state. */
export function isPolling(state: AutopayState): boolean {
  return state.kind === 'waiting' || state.kind === 'confirming';
}

export function autopayReducer(state: AutopayState, event: AutopayEvent): AutopayState {
  switch (event.type) {
    case 'APPS_FOUND':
      if (event.count === 0 && state.kind === 'choose') return { kind: 'noApp' };
      if (event.count > 0 && state.kind === 'noApp') return { kind: 'choose', notice: null };
      return state;
    case 'PICK':
      if (state.kind === 'choose' || state.kind === 'left' || state.kind === 'failed') {
        return { kind: 'creating', app: event.app };
      }
      return state;
    case 'OPENED':
      if (state.kind !== 'creating') return state;
      return {
        kind: 'waiting',
        app: state.app,
        link: event.link,
        startedAt: event.now,
        expiresAt: event.expiresAt,
        authorizedAt: null,
      };
    case 'OPEN_FAILED':
      return state.kind === 'creating' ? { kind: 'left', app: state.app } : state;
    case 'START_FAILED':
      return state.kind === 'creating' ? { kind: 'choose', notice: event.notice } : state;
    case 'SAVE_FAILED':
      return state.kind === 'choose' || state.kind === 'creating'
        ? { kind: 'choose', notice: event.notice }
        : state;
    case 'STATUS':
      return applyStatus(state, event.status, event.now);
    case 'TICK':
      if (state.kind !== 'waiting') return state;
      if (state.authorizedAt !== null) {
        return event.now - state.startedAt >= CONFIRMING_AFTER_MS
          ? { kind: 'confirming', app: state.app }
          : state;
      }
      return event.now >= state.expiresAt ? { kind: 'left', app: state.app } : state;
    case 'CANCEL':
      return state.kind === 'waiting' ? { kind: 'choose', notice: null } : state;
    case 'CHOOSE_ANOTHER':
      return state.kind === 'left' || state.kind === 'failed'
        ? { kind: 'choose', notice: null }
        : state;
    case 'CHECKOUT_DONE':
      return event.confirmed
        ? { kind: 'active', app: appOf(state), handleMasked: event.handleMasked }
        : { kind: 'confirming', app: appOf(state) };
    case 'CHECKOUT_CLOSED':
      return state.kind === 'creating' ? { kind: 'choose', notice: null } : state;
  }
}

function applyStatus(state: AutopayState, status: MandateStatusViewDto, now: number): AutopayState {
  if (state.kind !== 'waiting' && state.kind !== 'confirming') return state;
  const app = appOf(state);
  // Only the bank's confirmation of THIS mandate is approval. `bookingStatus` cannot stand in for
  // it: on a re-approval (paused, revoked or expired mandate) the booking is already `active`
  // while the new mandate is still pending, so it read as approved on the first poll. V0 sets
  // the booking `active` only in the same step that confirms its mandate (`mandate-service.ts`).
  if (status.status === 'confirmed') {
    return { kind: 'active', app, handleMasked: status.handleMasked };
  }
  const attempt = status.attempt;
  // A read about an earlier attempt (still cached, or raced by a fresh one) says nothing here.
  if (
    state.kind === 'waiting' &&
    attempt?.expiresAt != null &&
    Date.parse(attempt.expiresAt) !== state.expiresAt
  ) {
    return state;
  }
  if (status.status === 'rejected' || attempt?.state === 'failed') {
    return attempt?.failureReason === 'NOT_APPROVED'
      ? { kind: 'left', app }
      : { kind: 'failed', app };
  }
  if (state.kind === 'confirming') return state;
  if (attempt?.state === 'expired') return { kind: 'left', app: state.app };
  if (attempt?.state === 'authorized' || status.status === 'initiated') {
    const authorizedAt = state.authorizedAt ?? now;
    return now - state.startedAt >= CONFIRMING_AFTER_MS
      ? { kind: 'confirming', app: state.app }
      : { ...state, authorizedAt };
  }
  return state;
}

/** "4:52" — the expiry chip (2317:3657). */
export function countdownLabel(expiresAt: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
}
