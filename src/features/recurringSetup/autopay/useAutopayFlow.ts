import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { readLastUpiApp, writeLastUpiApp } from '@core/auth';
import { isAppError } from '@core/errors';
import { razorpayCheckoutLauncher } from '@features/payment';
import type { CheckoutLauncher } from '@features/payment';

import {
  recurringKeys,
  useCreateRecurringBooking,
  useRecurringMandateStatus,
  useStartRecurringMandate,
} from '../api';
import type { RecurringBookingDto, RecurringDraftInput } from '../api';
import { isLapsedBooking, useApproveRecurringMandate } from '../booking';
import { INITIAL_AUTOPAY_STATE, autopayReducer, isPolling } from './machine';
import type { AutopayState } from './machine';
import { listInstalledUpiApps, openUpiApp, sortUpiApps } from './upiApps';
import type { UpiApp } from './upiApps';
import { useServerUpiIntent } from './useAutopayIntentEnabled';

/**
 * Runs the UPI Autopay sheet (Figma 2316:3558 … 2317:4009): finds the UPI apps, saves the booking,
 * starts a UPI Intent attempt for the picked app, opens it, and polls the server until it says
 * how the approval ended. The state itself is `autopayReducer`'s.
 *
 * Two ways in:
 *   draft    from the Summary's "Book Now". The booking is saved (one pool Cook held per visit,
 *            `pending_mandate`) as the sheet opens, with the same draft-scoped idempotency as
 *            `useBookRecurring`, so a retry can never hold Cooks twice. From that save the Cooks
 *            are held 6 minutes for an app to be picked; opening the app or Checkout starts the
 *            8-minute approval window (V0 DEC-119).
 *   booking  a booking already saved: waiting for its first approval, or live with a lapsed
 *            mandate (the re-approve path).
 *
 * ## Falling back to Checkout
 *
 * When the backend refuses an Intent attempt (`PROVIDER_TEMPORARILY_UNAVAILABLE`: UPI Intent
 * switched off, or Razorpay not taking S2S payments), the same booking is approved through
 * Razorpay's Checkout instead (`useApproveRecurringMandate`), on the same authorisation order. The
 * customer sees Checkout open rather than an error.
 */
export type AutopaySource =
  | { readonly kind: 'draft'; readonly draft: RecurringDraftInput }
  | {
      readonly kind: 'booking';
      readonly booking: RecurringBookingDto;
      /** The plans it was saved from, so a booking that lapsed can be saved again. */
      readonly draft?: RecurringDraftInput | undefined;
    };

export interface AutopayFlow {
  readonly state: AutopayState;
  readonly apps: readonly UpiApp[];
  readonly lastUsedId: string | null;
  readonly showAllApps: boolean;
  readonly now: number;
  /** The saved booking, once there is one. */
  readonly bookingId: string | null;
  readonly pick: (app: UpiApp) => void;
  readonly showMoreApps: () => void;
  readonly openAgain: () => void;
  readonly cancel: () => void;
  readonly tryAgain: () => void;
  readonly chooseAnother: () => void;
  readonly rescan: () => void;
}

const TICK_MS = 1_000;

interface FoundApps {
  readonly apps: readonly UpiApp[];
  readonly lastUsedId: string | null;
}

/** The installed apps, and the last used one if it is still installed. */
async function findApps(userId: string | null): Promise<FoundApps> {
  const [apps, last] = await Promise.all([
    listInstalledUpiApps(),
    userId === null ? Promise.resolve(null) : readLastUpiApp(userId),
  ]);
  return { apps, lastUsedId: apps.some((app) => app.id === last) ? last : null };
}

export function useAutopayFlow({
  open,
  source,
  userId,
  launcher = razorpayCheckoutLauncher,
  onBookingSaved,
}: {
  readonly open: boolean;
  readonly source: AutopaySource;
  readonly userId: string | null;
  readonly launcher?: CheckoutLauncher;
  /**
   * The draft was saved. The caller keeps it, so reopening the sheet for the same plans reuses
   * the booking (the save's idempotency scope is spent once it succeeded).
   */
  readonly onBookingSaved?: (booking: RecurringBookingDto) => void;
}): AutopayFlow {
  const [state, dispatch] = useReducer(autopayReducer, INITIAL_AUTOPAY_STATE);
  const [apps, setApps] = useState<readonly UpiApp[]>([]);
  const [lastUsedId, setLastUsedId] = useState<string | null>(null);
  const [showAllApps, setShowAllApps] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [booking, setBooking] = useState<RecurringBookingDto | null>(
    source.kind === 'booking' ? source.booking : null,
  );
  const saved = useRef<{ key: string; booking: RecurringBookingDto } | null>(null);
  /** The save in flight, so the save on open and an app tap share one request. */
  const saving = useRef<{ key: string; promise: Promise<RecurringBookingDto> } | null>(null);
  /** Saves after a lapse take a new idempotency scope: the old one would replay the lapsed booking. */
  const resaves = useRef(0);
  const lapsed = useRef(false);

  const queryClient = useQueryClient();
  const create = useCreateRecurringBooking();
  const startMandate = useStartRecurringMandate();
  const checkout = useApproveRecurringMandate(launcher);
  /** Off: a picked app goes straight to Checkout, not to an Intent request the server refuses. */
  const serverIntent = useServerUpiIntent();
  const bookingId = booking?.recurringBookingId ?? null;
  const status = useRecurringMandateStatus(isPolling(state) ? bookingId : null, {
    poll: isPolling(state),
  });

  const applyApps = useCallback((found: FoundApps) => {
    setApps(sortUpiApps(found.apps, found.lastUsedId));
    setLastUsedId(found.lastUsedId);
    dispatch({ type: 'APPS_FOUND', count: found.apps.length });
  }, []);

  const scan = useCallback(() => {
    void findApps(userId).then(applyApps);
  }, [userId, applyApps]);

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    void findApps(userId).then((found) => {
      if (live) applyApps(found);
    });
    return () => {
      live = false;
    };
  }, [open, userId, applyApps]);

  const { mutateAsync: createBooking } = create;
  const ensureBooking = useCallback(async (): Promise<RecurringBookingDto> => {
    const draft = source.draft;
    if (source.kind === 'booking' && (!lapsed.current || draft === undefined)) {
      return source.booking;
    }
    if (draft === undefined) throw new Error('A draft source always carries its draft');
    const key = JSON.stringify(draft);
    if (saved.current?.key === key) return saved.current.booking;
    if (saving.current?.key === key) return saving.current.promise;
    const attempt = resaves.current === 0 ? '' : `#${String(resaves.current)}`;
    const promise = createBooking({
      input: draft,
      scope: `recurring.booking.create:${key}${attempt}`,
    });
    saving.current = { key, promise };
    try {
      const created = await promise;
      saved.current = { key, booking: created };
      lapsed.current = false;
      onBookingSaved?.(created);
      return created;
    } finally {
      if (saving.current?.promise === promise) saving.current = null;
    }
  }, [source, createBooking, onBookingSaved]);

  /**
   * The saved booking lapsed: not sent to approve within the hold, or not approved in time. Its
   * Cooks are released, so the draft is saved again under a new scope (`useBookRecurring` does
   * the same). False when there is no draft to save again from.
   */
  const dropLapsed = useCallback((): boolean => {
    if (source.draft === undefined) return false;
    saved.current = null;
    lapsed.current = true;
    resaves.current += 1;
    return true;
  }, [source]);

  // "Book Now" opened the sheet: save now, so the Cooks are held while an app is picked.
  const ensureRef = useRef(ensureBooking);
  useEffect(() => {
    ensureRef.current = ensureBooking;
  }, [ensureBooking]);
  const draftToSave = open && source.kind === 'draft' ? JSON.stringify(source.draft) : null;
  useEffect(() => {
    if (draftToSave === null) return;
    ensureRef.current().then(setBooking, (error: unknown) =>
      dispatch({
        type: 'SAVE_FAILED',
        notice: isAppError(error) && error.code === 'SLOT_UNAVAILABLE' ? 'slotTaken' : 'error',
      }),
    );
  }, [draftToSave]);

  const viaCheckout = useCallback(
    async (target: RecurringBookingDto) => {
      try {
        const outcome = await checkout.approve(target);
        if (outcome.kind === 'cancelled') {
          dispatch({ type: 'CHECKOUT_CLOSED' });
          return;
        }
        dispatch({
          type: 'CHECKOUT_DONE',
          // The mandate's own status, never `bookingStatus`: see `applyStatus` in `machine.ts`.
          confirmed: outcome.mandate.status === 'confirmed',
          handleMasked: outcome.mandate.handleMasked,
        });
      } catch (error) {
        // A lapsed booking is the caller's to save again.
        if (isLapsedBooking(error)) throw error;
        dispatch({ type: 'START_FAILED', notice: 'error' });
      }
    },
    [checkout],
  );

  /** Sends the customer to approve `target`: a UPI Intent where the server allows it, else Checkout. */
  const approve = useCallback(
    async (target: RecurringBookingDto, app: UpiApp): Promise<void> => {
      if (!serverIntent) {
        await viaCheckout(target);
        return;
      }
      let attempt;
      try {
        attempt = await startMandate.mutateAsync({
          id: target.recurringBookingId,
          scope: `recurring.mandate.intent:${target.recurringBookingId}`,
          flow: 'intent',
        });
      } catch (error) {
        if (isAppError(error) && error.code === 'PROVIDER_TEMPORARILY_UNAVAILABLE') {
          await viaCheckout(target);
          return;
        }
        throw error;
      }
      if (attempt.intentLink === undefined || attempt.attemptExpiresAt === undefined) {
        await viaCheckout(target);
        return;
      }
      // A cached read about an earlier attempt must not decide this one.
      queryClient.removeQueries({
        queryKey: recurringKeys.mandateStatus(target.recurringBookingId),
      });
      const opened = await openUpiApp(attempt.intentLink, app);
      setNow(Date.now());
      dispatch(
        opened
          ? {
              type: 'OPENED',
              link: attempt.intentLink,
              expiresAt: Date.parse(attempt.attemptExpiresAt),
              now: Date.now(),
            }
          : { type: 'OPEN_FAILED' },
      );
    },
    [startMandate, viaCheckout, queryClient, serverIntent],
  );

  const pick = useCallback(
    (app: UpiApp) => {
      dispatch({ type: 'PICK', app });
      void (async () => {
        const save = async (): Promise<RecurringBookingDto | null> => {
          try {
            const target = await ensureBooking();
            setBooking(target);
            return target;
          } catch (error) {
            dispatch({
              type: 'START_FAILED',
              notice:
                isAppError(error) && error.code === 'SLOT_UNAVAILABLE' ? 'slotTaken' : 'error',
            });
            return null;
          }
        };
        let target = await save();
        if (target === null) return;
        try {
          await approve(target, app);
        } catch (error) {
          // Picked after the 6-minute hold (or the approval window) ran out: save the plans
          // again — the times are re-checked and held afresh — and try once more.
          if (!isLapsedBooking(error) || !dropLapsed()) {
            dispatch({ type: 'START_FAILED', notice: 'error' });
            return;
          }
          target = await save();
          if (target === null) return;
          try {
            await approve(target, app);
          } catch {
            dispatch({ type: 'START_FAILED', notice: 'error' });
          }
        }
      })();
    },
    [ensureBooking, approve, dropLapsed],
  );

  // The server's word, as it arrives.
  const statusData = status.state.status === 'ready' ? status.state.data : null;
  useEffect(() => {
    if (statusData !== null) dispatch({ type: 'STATUS', status: statusData, now: Date.now() });
  }, [statusData]);

  // Back from the UPI app: ask at once rather than at the next 3s tick.
  const { refetch } = status;
  const polling = isPolling(state);
  useEffect(() => {
    if (!polling) return undefined;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') refetch();
    });
    return () => subscription.remove();
  }, [polling, refetch]);

  // The expiry chip's clock, and the waiting → left / confirming timeouts.
  const waiting = state.kind === 'waiting';
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(() => {
      const at = Date.now();
      setNow(at);
      dispatch({ type: 'TICK', now: at });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [waiting]);

  // Remember the app once Autopay is on ("Last used"), and refresh every Recurring read.
  const activeAppId = state.kind === 'active' ? (state.app?.id ?? null) : null;
  const active = state.kind === 'active';
  useEffect(() => {
    if (!active) return;
    if (activeAppId !== null && userId !== null) void writeLastUpiApp(userId, activeAppId);
    void queryClient.invalidateQueries({ queryKey: recurringKeys.all() });
  }, [active, activeAppId, userId, queryClient]);

  // No UPI app yet: look again when the customer comes back (they may have installed one).
  const noApp = state.kind === 'noApp';
  useEffect(() => {
    if (!noApp) return undefined;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') scan();
    });
    return () => subscription.remove();
  }, [noApp, scan]);

  return {
    state,
    apps,
    lastUsedId,
    showAllApps,
    now,
    bookingId,
    pick,
    showMoreApps: () => setShowAllApps(true),
    openAgain: () => {
      if (state.kind === 'waiting') void openUpiApp(state.link, state.app);
    },
    cancel: () => dispatch({ type: 'CANCEL' }),
    tryAgain: () => {
      if ((state.kind === 'left' || state.kind === 'failed') && state.app !== null) {
        pick(state.app);
      } else {
        dispatch({ type: 'CHOOSE_ANOTHER' });
      }
    },
    chooseAnother: () => dispatch({ type: 'CHOOSE_ANOTHER' }),
    rescan: scan,
  };
}
