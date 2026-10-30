import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import {
  DEFAULT_API_STUBS,
  createStubApi,
  createTestRuntime,
  renderWithRuntime,
} from '@/test/renderWithRuntime';

/**
 * The V7 founder comments, as behaviour (task §22, §32).
 *
 * Everything asserted here is a PRODUCT DECISION written on the final Figma rather than something
 * a frame draws, which is exactly why it needs tests: a screenshot comparison cannot see any of
 * it. Each block names the comment it defends.
 *
 * The router is mocked. What matters is which router method each control reaches and with what —
 * mounting a real navigator would need the whole app and would assert less.
 */

import SavedAddressesRoute from '@/app/(app)/address/index';
import BookingConfirmingRoute from '@/app/(app)/booking/confirming';
import PaymentFailedRoute from '@/app/(app)/booking/payment-failed';
import BookingRoute from '@/app/(app)/booking/[id]';

import { HOME_USECASE_SLIDES } from '@features/home/assets';
import { sessionStore } from '@core/store';

let mockRouter: {
  push: jest.Mock;
  back: jest.Mock;
  replace: jest.Mock;
  dismissAll: jest.Mock;
  dismissTo: jest.Mock;
  canGoBack: jest.Mock;
  canDismiss: jest.Mock;
};
let mockSearchParams: Record<string, string> = {};

// The booking route's visit details draw the rate card, which animates with Reanimated.
jest.mock('react-native-worklets', () =>
  jest.requireActual('react-native-worklets/lib/module/mock'),
);
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockSearchParams,
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(effect, [effect]);
  },
  Redirect: () => null,
  Stack: () => null,
}));

const PRICE = {
  amountPaise: 12900,
  durationMinutes: 60,
  serviceAmountPaise: 12900,
  taxRateBps: 500,
  taxAmountPaise: 645,
  totalAmountPaise: 13545,
  currency: 'INR',
  pricingVersion: 'pricing-policy-v0',
};

const ADDRESS = {
  label: 'Home',
  latitude: 12.902746,
  longitude: 77.648817,
  flat: 'E102',
  tower: null,
  society: 'Purva Skydale',
  street: 'Silver County Road',
  pincode: '560102',
  city: 'Bengaluru',
  state: 'Karnataka',
  hubName: null,
  receiverName: null,
  receiverPhone: null,
};

/** A booking in whatever lifecycle state a test needs. */
function bookingWith(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bk-1',
    status: 'assigned',
    slotType: 'instant',
    scheduledStart: null,
    durationMinutes: 60,
    price: PRICE,
    holdExpiresAt: null,
    address: ADDRESS,
    mealNotes: null,
    referenceUrl: null,
    mealBrief: null,
    cook: null,
    timing: { arrivedAt: null, actualStart: null, expectedEnd: null, actualEnd: null },
    cancellation: null,
    allowedActions: {
      canCancel: true,
      canReschedule: true,
      canExtend: false,
      canRate: false,
      canTip: false,
      canCallCook: false,
    },
    ...overrides,
  };
}

beforeEach(() => {
  mockRouter = {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    dismissAll: jest.fn(),
    dismissTo: jest.fn(),
    canGoBack: jest.fn(() => true),
    canDismiss: jest.fn(() => true),
  };
  mockSearchParams = {};
  sessionStore.reset();
  sessionStore.dispatch({ type: 'BOOTSTRAP_FOUND_SESSION' });
});

/* ------------------------------------------------------------------ Page 18d */

describe('Saved addresses row menu — closing it stays on the list', () => {
  function renderList() {
    return renderWithRuntime(<SavedAddressesRoute />, {
      runtime: createTestRuntime({
        api: createStubApi({ ...DEFAULT_API_STUBS, 'GET /v1/me/bookings/active': () => [] }),
      }),
    });
  }

  /**
   * The row's actions are a kebab MENU anchored over the list (`1870:2770`, dev note
   * `2075:11950`): "tap outside closes". Closing it must not NAVIGATE — a router call here would
   * take the customer off the list the menu is sitting on.
   */
  it('closes the menu on a tap outside and stays on the list', async () => {
    // The menu is anchored by measuring the kebab; the test host's measure never answers.
    jest
      .requireActual<{ default: { measureInWindow: jest.Mock } }>(
        '@react-native/jest-preset/jest/MockNativeMethods',
      )
      .default.measureInWindow.mockImplementation(
        (callback: (x: number, y: number, w: number, h: number) => void) =>
          callback(326, 200, 32, 32),
      );
    renderList();
    await screen.findByTestId('saved-addresses');

    fireEvent.press(screen.getByTestId('saved-addresses-card-addr-1-kebab'));
    expect(await screen.findByTestId('saved-addresses-menu-edit')).toBeTruthy();

    fireEvent.press(screen.getByTestId('saved-addresses-menu-backdrop'));

    await waitFor(() => expect(screen.queryByTestId('saved-addresses-menu-edit')).toBeNull());
    expect(screen.getByTestId('saved-addresses')).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------ payment -> Page 21 -> Home */

describe('`433:2290` Page 21 — payment, then the SERVER (task §9, §10)', () => {
  /**
   * Razorpay returning is not a booking. A verified payment goes to Page 21, which waits on the
   * backend; anything else has no confirmation to wait for and goes to the booking screen, where
   * the hold is visible and still payable.
   */
  function renderConfirming(status: string) {
    mockSearchParams = { id: 'bk-1' };
    return renderWithRuntime(<BookingConfirmingRoute />, {
      runtime: createTestRuntime({
        api: createStubApi({
          ...DEFAULT_API_STUBS,
          'GET /v1/bookings/bk-1': () => ({ booking: bookingWith({ status }) }),
        }),
      }),
    });
  }

  it('holds while the booking is still `created`', async () => {
    renderConfirming('created');

    expect(await screen.findByTestId('confirmation-loading')).toBeTruthy();

    // Give the poll several turns. The screen must NOT leave on its own.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('goes to the confirmation page once the server has confirmed the booking', async () => {
    renderConfirming('assigned');

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/booking/bk-1'));
    // The stack is collapsed first, so back from the confirmation page is Home and not the sheet
    // the customer booked from.
    expect(mockRouter.dismissAll).toHaveBeenCalled();
  });

  /**
   * The distinction the destination turns on. `cancelled` is settled too -- it is covered by the
   * test below -- so "not awaiting confirmation" cannot be what sends a booking to a page headed
   * "Booking confirmed!". Every status the server confirms with goes there; nothing else does.
   */
  it.each(['cook_en_route', 'cook_arrived', 'cooking', 'completed'])(
    'treats %s as confirmed rather than as something to report on Home',
    async (status) => {
      renderConfirming(status);

      await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/booking/bk-1'));
    },
  );

  /**
   * A booking the server CANCELLED is an answer too. It goes to its own screen, which draws the
   * cancellation (and, when the system cancelled it after the payment landed, the refund) — Home
   * used to swallow it in silence.
   */
  it('goes to the booking’s cancelled screen on a cancellation', async () => {
    renderConfirming('cancelled');

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/booking/bk-1'));
    expect(mockRouter.replace).not.toHaveBeenCalledWith('/home');
  });

  /** A read that failed is not a reason to hold a customer on a screen with no controls. */
  it('goes to Home when the booking cannot be read at all', async () => {
    mockSearchParams = { id: 'bk-1' };
    renderWithRuntime(<BookingConfirmingRoute />, {
      runtime: createTestRuntime({
        api: createStubApi({
          ...DEFAULT_API_STUBS,
          'GET /v1/bookings/bk-1': () => {
            throw new Error('offline');
          },
        }),
      }),
    });

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/home'));
  });
});

/* --------------------------------------------------------- Payment Failed */

describe('Payment Failed — retry against the same hold, or leave once the server disagrees', () => {
  const CANCELLATION_STUBS = {
    'GET /v1/bookings/bk-1/cancellation-preview': () => ({
      bookingId: 'bk-1',
      cancellable: true,
      band: null,
      refundPercent: null,
      minutesToStart: null,
      serviceAmountPaise: 12900,
      capturedAmountPaise: 0,
      refundAmountPaise: 0,
      chargeAmountPaise: 0,
      policyVersion: 'cancellation-policy-v0',
    }),
    'GET /v1/bookings/bk-1/reschedule-options': () => ({
      bookingId: 'bk-1',
      durationMinutes: 60,
      currentServiceStart: '2026-08-18T12:00:00.000Z',
      rescheduleCount: 0,
      maxReschedules: 2,
      reschedulable: false,
    }),
  };

  function renderPaymentFailed(overrides: Record<string, unknown> = {}) {
    mockSearchParams = { id: 'bk-1' };
    return renderWithRuntime(<PaymentFailedRoute />, {
      runtime: createTestRuntime({
        api: createStubApi({
          ...DEFAULT_API_STUBS,
          ...CANCELLATION_STUBS,
          'GET /v1/bookings/bk-1': () => ({
            booking: bookingWith({ status: 'created', ...overrides }),
          }),
        }),
      }),
    });
  }

  it('offers Retry Payment and Change payment method while the hold is still `created` (2718:916)', async () => {
    renderPaymentFailed();

    expect(await screen.findByTestId('payment-failed-retry')).toBeTruthy();
    expect(screen.getByTestId('payment-failed-change-method')).toBeTruthy();
    // The frame offers no Cancel: the unpaid hold is released by the backend on its own.
    expect(screen.queryByTestId('payment-failed-cancel')).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('leaves for the real booking screen once the server settles the hold — paid after all', async () => {
    renderPaymentFailed({ status: 'assigned' });

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/booking/bk-1'));
  });

  it('leaves for the real booking screen once the hold is gone — cancelled', async () => {
    renderPaymentFailed({ status: 'cancelled' });

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/booking/bk-1'));
  });

  it('goes Home when opened with no booking id', async () => {
    mockSearchParams = {};
    renderWithRuntime(<PaymentFailedRoute />, {
      runtime: createTestRuntime({ api: createStubApi(DEFAULT_API_STUBS) }),
    });

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/home'));
    expect(mockRouter.dismissAll).toHaveBeenCalled();
  });

  /**
   * A read that keeps failing is not a reason to hold the customer on an error screen forever —
   * the same call `confirming.tsx` makes for the identical situation. Without this, a booking
   * that actually settled while the device was offline would leave the customer stuck on a dead
   * end instead of at Home, where the next successful read reports the truth.
   */
  it('goes Home when the booking cannot be read at all', async () => {
    mockSearchParams = { id: 'bk-1' };
    renderWithRuntime(<PaymentFailedRoute />, {
      runtime: createTestRuntime({
        api: createStubApi({
          ...DEFAULT_API_STUBS,
          ...CANCELLATION_STUBS,
          'GET /v1/bookings/bk-1': () => {
            throw new Error('offline');
          },
        }),
      }),
    });

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/home'));
  });
});

/* ------------------------------------------------------------- Cancel booking */

describe('Cancel visit — the redesigned C1–C5 sheets on a one-time booking', () => {
  const CANCELLATION_STUBS = {
    'GET /v1/bookings/bk-1/cancellation-preview': () => ({
      bookingId: 'bk-1',
      cancellable: true,
      band: 'SCHEDULED_FULL_REFUND',
      refundPercent: 100,
      minutesToStart: 600,
      serviceAmountPaise: 12900,
      capturedAmountPaise: 12900,
      refundAmountPaise: 12900,
      chargeAmountPaise: 0,
      policyVersion: 'cancellation-policy-v0',
    }),
    'GET /v1/bookings/bk-1/reschedule-options': () => ({
      bookingId: 'bk-1',
      durationMinutes: 60,
      currentServiceStart: '2026-08-18T12:00:00.000Z',
      rescheduleCount: 0,
      maxReschedules: 2,
      reschedulable: false,
    }),
    'GET /v1/bookings/bk-1/refunds': () => ({ refunds: [] }),
  };

  function renderCancellable(cancelCalls: unknown[] = []) {
    mockSearchParams = { id: 'bk-1' };
    renderWithRuntime(<BookingRoute />, {
      runtime: createTestRuntime({
        api: createStubApi({
          ...DEFAULT_API_STUBS,
          ...CANCELLATION_STUBS,
          'GET /v1/bookings/bk-1': () => ({
            booking: bookingWith({ status: 'assigned', slotType: 'scheduled' }),
          }),
          'POST /v1/bookings/bk-1/cancel': (body: unknown) => {
            cancelCalls.push(body);
            return {};
          },
        }),
      }),
    });
  }

  async function cancelThrough() {
    fireEvent.press(await screen.findByTestId('service-visit-dock-modify'));
    fireEvent.press(await screen.findByTestId('cancel-visit-option-cancel'));
    fireEvent.press(await screen.findByTestId('cancel-visit-continue'));
    fireEvent.press(await screen.findByTestId('cancel-visit-reason-URGENT_CHANGE'));
    fireEvent.press(screen.getByTestId('cancel-visit-reason-continue'));
    fireEvent.press(await screen.findByTestId('cancel-visit-confirm'));
    await screen.findByTestId('cancel-visit-done');
  }

  /** Nothing is cancelled before C4's Cancel, and that press sends the picked reason once. */
  it('walks Modify → policy → reason → review → cancelled, sending the reason once', async () => {
    const cancelCalls: unknown[] = [];
    renderCancellable(cancelCalls);

    await cancelThrough();

    expect(cancelCalls).toEqual([{ reasonCode: 'URGENT_CHANGE' }]);
    expect(screen.getByText('Visit cancelled')).toBeTruthy();
  });

  /** Dev note `2071:2869`: Done → Bookings; "Book a visit" → the booking flow. */
  it.each([
    ['cancel-visit-finish', '/history'],
    ['cancel-visit-book', '/scheduled'],
  ])('routes %s to %s from the cancelled sheet', async (testId, destination) => {
    renderCancellable();
    await cancelThrough();

    fireEvent.press(screen.getByTestId(testId));

    expect(mockRouter.replace).toHaveBeenCalledWith(destination);
  });

  it('closes on a scrim tap without cancelling anything', async () => {
    const cancelCalls: unknown[] = [];
    renderCancellable(cancelCalls);

    fireEvent.press(await screen.findByTestId('service-visit-dock-modify'));
    fireEvent.press(await screen.findByTestId('cancel-visit-modify-backdrop'));

    await waitFor(() => expect(screen.queryByTestId('cancel-visit-modify')).toBeNull());
    expect(cancelCalls).toEqual([]);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

/* --------------------------------------------------- service back buttons -> Home */

describe('service lifecycle — every back button goes Home (task §11)', () => {
  /**
   * "all these back buttons take the user to the home page".
   *
   * One route renders every lifecycle state, so the states are driven by the SERVER payload and
   * the same assertion is made against each: Home, deterministically, on a stack that could pop.
   * Popping is specifically wrong here — the booking advances underneath the customer, so a stack
   * entry can describe a state the booking has already left.
   */
  const STATES = [
    ['confirmed', { status: 'assigned' }],
    ['reassigned', { status: 'assigned', reassigned: true }],
    ['arriving', { status: 'cook_en_route' }],
    ['arrived', { status: 'cook_arrived' }],
    ['in service', { status: 'cooking' }],
    ['auto-cancelled', { status: 'cancelled', cancelledBy: 'system' }],
  ] as const;

  it.each(STATES)('%s backs out to Home', async (_name, overrides) => {
    mockSearchParams = { id: 'bk-1' };
    renderWithRuntime(<BookingRoute />, {
      runtime: createTestRuntime({
        api: createStubApi({
          ...DEFAULT_API_STUBS,
          'GET /v1/bookings/bk-1': () => ({ booking: bookingWith(overrides) }),
          'GET /v1/bookings/bk-1/tracking': () => ({
            status: 'ok',
            etaMinutes: 12,
            refreshAfterSeconds: 30,
          }),
        }),
      }),
    });

    // The redesigned visit details draw the drawn phases and the cancelled state (`2165:11853`);
    // other states keep the booking screen.
    const back = () =>
      screen.queryByTestId('service-visit-header-back') ??
      screen.queryByTestId('cancelled-visit-header-back') ??
      screen.queryByTestId('booking-back');
    await waitFor(() => expect(back()).not.toBeNull());
    fireEvent.press(back()!);

    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/home');
  });
});

/* ------------------------------------------------------------- Page 4a Instant */

describe('`378:189` + `406:1325` — the carousel is nine cards in the founder order (task §16)', () => {
  /**
   * V7 adds `406:1325` "assist", which sits OUTSIDE the `378:189` grid and was missing entirely.
   *
   * The order is the founder's, resolved card-by-card against the ARTWORK rather than the frame
   * names — "roti" is the card that reads "You deserve to eat it hot!", "mealprep" is "Sorted for
   * days!". The ids are asserted rather than the labels so a copy fix does not fail this, but the
   * labels are checked to be present so an id cannot silently point at the wrong picture.
   */
  it('is exactly the nine cards, in order', () => {
    expect(HOME_USECASE_SLIDES.map((slide) => slide.id)).toEqual([
      'snacks',
      'absent',
      'tiffin',
      'assist',
      'guests',
      'drysnacks',
      'breakfast',
      'roti',
      'mealprep',
    ]);
  });

  it('carries the artwork transcription each id promises', () => {
    const byId = new Map(HOME_USECASE_SLIDES.map((slide) => [slide.id, slide.label]));

    expect(byId.get('snacks')).toContain('Crave guilt free');
    expect(byId.get('absent')).toContain('Cook absent');
    expect(byId.get('tiffin')).toContain('Sleep for longer');
    expect(byId.get('assist')).toContain("don't have to do it all");
    expect(byId.get('guests')).toContain('Tension free gatherings');
    expect(byId.get('drysnacks')).toContain('Munch as much as you want');
    expect(byId.get('breakfast')).toContain('Breakfast only when required');
    expect(byId.get('roti')).toContain('You deserve to eat it hot');
    expect(byId.get('mealprep')).toContain('Sorted for days');
  });

  it('gives every card a distinct artwork', () => {
    const sources = HOME_USECASE_SLIDES.map((slide) => slide.source);
    expect(new Set(sources).size).toBe(HOME_USECASE_SLIDES.length);
  });
});
