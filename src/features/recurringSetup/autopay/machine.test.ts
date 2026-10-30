import type { MandateStatusViewDto } from '../api';
import {
  CONFIRMING_AFTER_MS,
  INITIAL_AUTOPAY_STATE,
  autopayReducer,
  countdownLabel,
  isPolling,
} from './machine';
import type { AutopayEvent, AutopayState } from './machine';
import type { UpiApp } from './upiApps';

const PHONEPE: UpiApp = { id: 'phonepe', name: 'PhonePe', packageName: 'com.phonepe.app' };
const T0 = Date.UTC(2026, 9, 13, 6, 0, 0);
const EXPIRES = T0 + 5 * 60_000;

function run(events: readonly AutopayEvent[], from: AutopayState = INITIAL_AUTOPAY_STATE) {
  return events.reduce(autopayReducer, from);
}

const waiting = (): AutopayState =>
  run([
    { type: 'PICK', app: PHONEPE },
    { type: 'OPENED', link: 'upi://mandate?x', expiresAt: EXPIRES, now: T0 },
  ]);

function status(overrides: Partial<MandateStatusViewDto> = {}): MandateStatusViewDto {
  return {
    mandateId: 'm-1',
    recurringBookingId: 'rb-1',
    status: 'pending',
    bookingStatus: 'pending_mandate',
    attempt: { state: 'waiting', failureReason: null, expiresAt: new Date(EXPIRES).toISOString() },
    approveBy: null,
    handleMasked: null,
    maxAmountPaise: 100_000,
    ...overrides,
  };
}

describe('autopayReducer (Figma 2316:3558 … 2317:4009)', () => {
  it('goes choose → creating → waiting for the picked app', () => {
    const state = waiting();
    expect(state).toMatchObject({ kind: 'waiting', app: PHONEPE, expiresAt: EXPIRES });
    expect(isPolling(state)).toBe(true);
  });

  it('shows "No UPI app found" when the device has none, and the list once one appears', () => {
    const none = run([{ type: 'APPS_FOUND', count: 0 }]);
    expect(none).toEqual({ kind: 'noApp' });
    expect(run([{ type: 'APPS_FOUND', count: 2 }], none)).toEqual({ kind: 'choose', notice: null });
  });

  it('is active once the server says the mandate is confirmed', () => {
    const state = autopayReducer(waiting(), {
      type: 'STATUS',
      status: status({ status: 'confirmed', bookingStatus: 'active', handleMasked: 'ra••••@ybl' }),
      now: T0 + 10_000,
    });
    expect(state).toEqual({ kind: 'active', app: PHONEPE, handleMasked: 'ra••••@ybl' });
  });

  /*
   * Re-approving a paused, revoked or expired mandate happens on a booking that is already
   * `active`. The new mandate's own status decides; the first poll must not read as approved.
   */
  it('stays waiting on a re-approval until the new mandate itself is confirmed', () => {
    const state = autopayReducer(waiting(), {
      type: 'STATUS',
      status: status({ status: 'initiated', bookingStatus: 'active' }),
      now: T0 + 3_000,
    });
    expect(state.kind).toBe('waiting');
    expect(isPolling(state)).toBe(true);
  });

  it('does not call a checkout re-approval approved while the bank is still confirming', () => {
    const state = run([
      { type: 'PICK', app: PHONEPE },
      { type: 'CHECKOUT_DONE', confirmed: false, handleMasked: null },
    ]);
    expect(state.kind).toBe('confirming');
  });

  it('tells "left without approving" from "didn’t go through"', () => {
    const left = autopayReducer(waiting(), {
      type: 'STATUS',
      status: status({
        status: 'rejected',
        attempt: {
          state: 'failed',
          failureReason: 'NOT_APPROVED',
          expiresAt: new Date(EXPIRES).toISOString(),
        },
      }),
      now: T0 + 10_000,
    });
    expect(left).toEqual({ kind: 'left', app: PHONEPE });
    const failed = autopayReducer(waiting(), {
      type: 'STATUS',
      status: status({
        status: 'rejected',
        attempt: {
          state: 'failed',
          failureReason: 'DECLINED',
          expiresAt: new Date(EXPIRES).toISOString(),
        },
      }),
      now: T0 + 10_000,
    });
    expect(failed).toEqual({ kind: 'failed', app: PHONEPE });
  });

  it('is "left" when the request expires: by the server, or the countdown reaching 0', () => {
    expect(
      autopayReducer(waiting(), {
        type: 'STATUS',
        status: status({
          attempt: {
            state: 'expired',
            failureReason: null,
            expiresAt: new Date(EXPIRES).toISOString(),
          },
        }),
        now: EXPIRES,
      }),
    ).toEqual({ kind: 'left', app: PHONEPE });
    expect(autopayReducer(waiting(), { type: 'TICK', now: EXPIRES - 1 }).kind).toBe('waiting');
    expect(autopayReducer(waiting(), { type: 'TICK', now: EXPIRES })).toEqual({
      kind: 'left',
      app: PHONEPE,
    });
  });

  it('moves to "still confirming" once an approved request is 60s old without the bank', () => {
    const approved = autopayReducer(waiting(), {
      type: 'STATUS',
      status: status({
        status: 'initiated',
        attempt: {
          state: 'authorized',
          failureReason: null,
          expiresAt: new Date(EXPIRES).toISOString(),
        },
      }),
      now: T0 + 20_000,
    });
    expect(approved).toMatchObject({ kind: 'waiting', authorizedAt: T0 + 20_000 });
    // Approved requests no longer expire into "left".
    expect(autopayReducer(approved, { type: 'TICK', now: T0 + 59_000 }).kind).toBe('waiting');
    const confirming = autopayReducer(approved, { type: 'TICK', now: T0 + CONFIRMING_AFTER_MS });
    expect(confirming).toEqual({ kind: 'confirming', app: PHONEPE });
    expect(isPolling(confirming)).toBe(true);
    expect(
      autopayReducer(confirming, {
        type: 'STATUS',
        status: status({ status: 'confirmed', bookingStatus: 'active' }),
        now: T0 + 90_000,
      }).kind,
    ).toBe('active');
  });

  it('ignores a read about an earlier attempt', () => {
    const stale = status({
      status: 'rejected',
      attempt: {
        state: 'failed',
        failureReason: 'DECLINED',
        expiresAt: new Date(EXPIRES - 60_000).toISOString(),
      },
    });
    expect(autopayReducer(waiting(), { type: 'STATUS', status: stale, now: T0 }).kind).toBe(
      'waiting',
    );
  });

  it('cancel returns to the list; try again and choose another come from left and failed', () => {
    expect(autopayReducer(waiting(), { type: 'CANCEL' })).toEqual({ kind: 'choose', notice: null });
    const left: AutopayState = { kind: 'left', app: PHONEPE };
    expect(autopayReducer(left, { type: 'PICK', app: PHONEPE })).toEqual({
      kind: 'creating',
      app: PHONEPE,
    });
    expect(autopayReducer(left, { type: 'CHOOSE_ANOTHER' })).toEqual({
      kind: 'choose',
      notice: null,
    });
  });

  it('returns to the list with a notice when the attempt could not start', () => {
    const creating = run([{ type: 'PICK', app: PHONEPE }]);
    expect(autopayReducer(creating, { type: 'START_FAILED', notice: 'slotTaken' })).toEqual({
      kind: 'choose',
      notice: 'slotTaken',
    });
    expect(autopayReducer(creating, { type: 'OPEN_FAILED' })).toEqual({
      kind: 'left',
      app: PHONEPE,
    });
  });

  it('ends on the Checkout fallback’s outcome', () => {
    const creating = run([{ type: 'PICK', app: PHONEPE }]);
    expect(
      autopayReducer(creating, { type: 'CHECKOUT_DONE', confirmed: true, handleMasked: null }),
    ).toEqual({ kind: 'active', app: PHONEPE, handleMasked: null });
    expect(
      autopayReducer(creating, { type: 'CHECKOUT_DONE', confirmed: false, handleMasked: null }),
    ).toEqual({ kind: 'confirming', app: PHONEPE });
    expect(autopayReducer(creating, { type: 'CHECKOUT_CLOSED' })).toEqual({
      kind: 'choose',
      notice: null,
    });
  });
});

describe('countdownLabel', () => {
  it('reads m:ss, never below 0:00', () => {
    expect(countdownLabel(T0 + 292_000, T0)).toBe('4:52');
    expect(countdownLabel(T0 + 5_500, T0)).toBe('0:06');
    expect(countdownLabel(T0, T0 + 1_000)).toBe('0:00');
  });

  it('shows why when the save on "Book Now" fails, before any app is picked', () => {
    expect(run([{ type: 'SAVE_FAILED', notice: 'slotTaken' }])).toEqual({
      kind: 'choose',
      notice: 'slotTaken',
    });
    expect(
      run([
        { type: 'PICK', app: PHONEPE },
        { type: 'SAVE_FAILED', notice: 'error' },
      ]),
    ).toEqual({ kind: 'choose', notice: 'error' });
    // Once an app is open, a late save failure does not pull the sheet back.
    expect(run([{ type: 'SAVE_FAILED', notice: 'error' }], waiting())).toEqual(waiting());
  });
});
