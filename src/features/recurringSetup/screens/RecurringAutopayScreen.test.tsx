import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { CheckoutLauncher } from '@features/payment';
import { CheckoutCancelledError, CheckoutNoPaymentMethodsError } from '@features/payment';
import { createStubApi, createTestRuntime, renderWithRuntime } from '@/test/renderWithRuntime';

import type { RecurringPlanDraft } from '../types';
import { RecurringAutopayScreen } from './RecurringAutopayScreen';

/** The screen hands Android's back button to the stack, which needs a navigator; none is mounted. */
jest.mock('expo-router', () => ({
  __esModule: true,
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(effect, [effect]);
  },
}));

/**
 * Step 8, UPI Autopay (DEC-086): what the screen states comes from the quote and eligibility, and
 * "Approve" saves once, opens Razorpay's recurring checkout and verifies — or says why not.
 */

const ADDRESS = '11111111-1111-4111-8111-111111111111';
const PLANS: readonly RecurringPlanDraft[] = [
  {
    id: 'plan-1',
    dayIds: ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'],
    visits: [{ timeOfDay: 'morning', durationId: 'd60', startMinutes: 9 * 60 }],
  },
];

const QUOTE = {
  policyVersion: 'recurring-v2-spec-1',
  bookable: true,
  window: { startDate: '2026-10-05', endDate: '2026-10-25' },
  firstDate: '2026-10-06',
  lastDate: '2026-10-10',
  daysCount: 5,
  visitsCount: 5,
  overlaps: [],
  visits: [
    {
      planNumber: 1,
      visitNumber: 1,
      date: '2026-10-07',
      timeOfDay: 'morning',
      startTime: '09:00',
      durationMinutes: 60,
      start: '2026-10-07T03:30:00.000Z',
      available: true,
      reason: 'AVAILABLE',
    },
  ],
  visitSummaries: [],
  chargeRange: { minPaise: 13545, maxPaise: 13545 },
  totalPaise: 67725,
  mandateMaxChargePaise: 100000,
};

const ELIGIBILITY = {
  policyVersion: 'recurring-v2-spec-1',
  unlocked: true,
  poolCount: 2,
  unlockThreshold: 2,
  chip: 'book',
  liveBookings: [],
  window: QUOTE.window,
  limits: { minDays: 5, maxDays: 14 },
  timesOfDay: [],
  durations: [],
  charging: { notifyLeadHours: 27, debitLeadHours: 3, mandateMaxChargePaise: 100000 },
};

const BOOKING = {
  recurringBookingId: 'rb-1',
  status: 'pending_mandate',
  addressId: ADDRESS,
  window: QUOTE.window,
  policyVersion: 'recurring-v2-spec-1',
  mandate: null,
  banner: null,
  counts: { done: 0, cancelled: 0, toGo: 5 },
  plans: [],
  days: [],
  upNext: null,
  chargeRange: { minPaise: 13545, maxPaise: 13545 },
  support: { whatsappUrl: null },
  createdAt: '2026-10-02T06:00:00.000Z',
  cancelledAt: null,
  cancelledBy: null,
};

const CHECKOUT = {
  mandateId: 'mandate-1',
  recurringBookingId: 'rb-1',
  method: 'upi',
  status: 'pending',
  provider: 'razorpay',
  providerOrderId: 'order_1',
  providerCustomerId: 'cust_1',
  amountPaise: 100,
  currency: 'INR',
  maxAmountPaise: 100000,
  approveBy: '2026-10-02T06:30:00.000Z',
  keyId: 'rzp_test_key',
};

const VERIFIED = {
  mandateId: 'mandate-1',
  recurringBookingId: 'rb-1',
  method: 'upi',
  status: 'confirmed',
  bookingStatus: 'active',
  handleMasked: 'ra••••@okhdfc',
  confirmedAt: '2026-10-02T06:05:00.000Z',
};

function setup(
  options: {
    launcher?: CheckoutLauncher;
    create?: () => unknown;
    quote?: unknown;
    /** What a quote reads once the booking is saved: its own reservations claim those times. */
    quoteAfterSave?: unknown;
    mandate?: () => unknown;
  } = {},
) {
  let savedOnce = false;
  const calls: string[] = [];
  const opened: Parameters<CheckoutLauncher['open']>[0][] = [];
  const launcher: CheckoutLauncher = options.launcher ?? {
    open: async (input) => {
      opened.push(input);
      return { providerPaymentId: 'pay_1', signature: 'sig' };
    },
  };
  const runtime = createTestRuntime({
    api: createStubApi({
      'POST /v1/recurring/bookings/quote': () =>
        savedOnce && options.quoteAfterSave !== undefined
          ? options.quoteAfterSave
          : (options.quote ?? QUOTE),
      'GET /v1/recurring/eligibility': () => ELIGIBILITY,
      'POST /v1/recurring/bookings': () => {
        calls.push('create');
        const created = (options.create ?? (() => BOOKING))();
        savedOnce = true;
        return created;
      },
      'POST /v1/me/recurring-bookings/rb-1/mandate': () => {
        calls.push('mandate');
        return (options.mandate ?? (() => CHECKOUT))();
      },
      'POST /v1/me/recurring-bookings/rb-1/mandate/verify': () => {
        calls.push('verify');
        return VERIFIED;
      },
    }),
  });
  const onBooked = jest.fn();
  const onChangeTimes = jest.fn();
  const { queryClient } = renderWithRuntime(
    <RecurringAutopayScreen
      addressId={ADDRESS}
      plans={PLANS}
      onBack={jest.fn()}
      onChangeTimes={onChangeTimes}
      onBooked={onBooked}
      launcher={launcher}
    />,
    { runtime },
  );
  return { calls, opened, onBooked, onChangeTimes, queryClient };
}

const approve = () => fireEvent.press(screen.getByTestId('recurring-autopay-screen-approve'));

describe('RecurringAutopayScreen', () => {
  it('states the charge per visit, the total, and how Autopay works, from the backend', async () => {
    setup();

    expect(await screen.findByText('₹135.45')).toBeTruthy();
    expect(screen.getByText('₹677.25')).toBeTruthy();
    expect(screen.getByText(/5 days · 5 visits/)).toBeTruthy();
    expect(screen.getByText(/Charged 3 hrs before your first visit of the day/)).toBeTruthy();
    expect(screen.getByText(/about 27 hours before each charge/)).toBeTruthy();
    expect(screen.getByText(/more than ₹1000/)).toBeTruthy();
    expect(screen.getByText('Cancelled visits are never charged.')).toBeTruthy();
  });

  it('saves, opens recurring checkout on the Razorpay Customer, verifies, then hands over', async () => {
    const { calls, opened, onBooked } = setup();
    await screen.findByText('₹135.45');

    approve();

    await waitFor(() => expect(onBooked).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(['create', 'mandate', 'verify']);
    expect(opened[0]).toMatchObject({
      keyId: 'rzp_test_key',
      providerOrderId: 'order_1',
      amountPaise: 100,
      recurring: { providerCustomerId: 'cust_1' },
    });
    expect(onBooked.mock.calls[0]?.[1]).toMatchObject({ status: 'confirmed' });
  });

  it('keeps the saved booking when checkout is closed, and reopens it without saving again', async () => {
    let attempt = 0;
    const { calls, onBooked } = setup({
      launcher: {
        open: async () => {
          attempt += 1;
          if (attempt === 1) throw new CheckoutCancelledError();
          return { providerPaymentId: 'pay_1', signature: 'sig' };
        },
      },
    });
    await screen.findByText('₹135.45');

    approve();
    expect(await screen.findByText("Autopay isn't approved yet")).toBeTruthy();

    approve();
    await waitFor(() => expect(onBooked).toHaveBeenCalledTimes(1));
    expect(calls.filter((call) => call === 'create')).toHaveLength(1);
  });

  /*
   * Saving reserves a pool Cook for every visit and claims the dates, so a quote refetched when the
   * app comes back from checkout reads `bookable: false`. That is the customer's own booking, not
   * a time someone took: the screen must keep "Approve" and reopen the same booking.
   */
  it("keeps Approve after checkout is closed, though the refetched quote counts the customer's own hold", async () => {
    let attempt = 0;
    const { calls, onBooked, queryClient } = setup({
      quoteAfterSave: {
        ...QUOTE,
        bookable: false,
        visits: [{ ...QUOTE.visits[0], available: false, reason: 'DATE_IN_LIVE_RECURRING' }],
      },
      launcher: {
        open: async () => {
          attempt += 1;
          if (attempt === 1) throw new CheckoutCancelledError();
          return { providerPaymentId: 'pay_1', signature: 'sig' };
        },
      },
    });
    await screen.findByText('₹135.45');

    approve();
    expect(await screen.findByText("Autopay isn't approved yet")).toBeTruthy();

    // What returning to the app does: every active query refetches, the quote included.
    await queryClient.invalidateQueries();
    await waitFor(() => expect(calls.filter((call) => call === 'create')).toHaveLength(1));
    expect(screen.queryByText('Some times were just taken')).toBeNull();
    expect(screen.queryByTestId('recurring-autopay-screen-change-times')).toBeNull();
    expect(screen.getByText("Autopay isn't approved yet")).toBeTruthy();

    approve();
    await waitFor(() => expect(onBooked).toHaveBeenCalledTimes(1));
    expect(calls.filter((call) => call === 'create')).toHaveLength(1);
  });

  it('saves again when the saved booking lapsed before it was approved', async () => {
    let mandates = 0;
    let opens = 0;
    const { calls, onBooked } = setup({
      mandate: () => {
        mandates += 1;
        if (mandates === 2) {
          throw {
            kind: 'server',
            status: 409,
            message: 'window closed',
            code: 'INVALID_BOOKING_STATE',
            details: { reason: 'MANDATE_WINDOW_CLOSED' },
          };
        }
        return CHECKOUT;
      },
      launcher: {
        open: async () => {
          opens += 1;
          if (opens === 1) throw new CheckoutCancelledError();
          return { providerPaymentId: 'pay_1', signature: 'sig' };
        },
      },
    });
    await screen.findByText('₹135.45');

    approve();
    expect(await screen.findByText("Autopay isn't approved yet")).toBeTruthy();

    approve();
    await waitFor(() => expect(onBooked).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(['create', 'mandate', 'mandate', 'create', 'mandate', 'verify']);
  });

  it('asks for a UPI app when checkout has no way to approve Autopay, and keeps Approve', async () => {
    setup({
      launcher: {
        open: async () => {
          throw new CheckoutNoPaymentMethodsError(2, 'no_payment_methods');
        },
      },
    });
    await screen.findByText('₹135.45');

    approve();

    expect(
      await screen.findByText(
        'Install a UPI app such as Google Pay or PhonePe to set up Autopay, then try again.',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('recurring-autopay-screen-approve')).toBeTruthy();
  });

  it('sends the customer back to change times when a slot was taken since the Summary', async () => {
    const { onChangeTimes } = setup({
      create: () => {
        throw {
          kind: 'server',
          status: 409,
          message: 'slot taken',
          code: 'SLOT_UNAVAILABLE',
          details: { reason: 'VISIT_UNAVAILABLE' },
        };
      },
    });
    await screen.findByText('₹135.45');

    approve();

    expect(await screen.findByText('Some times were just taken')).toBeTruthy();
    fireEvent.press(screen.getByTestId('recurring-autopay-screen-change-times'));
    expect(onChangeTimes).toHaveBeenCalledTimes(1);
  });

  it('asks for new times straight away when the quote is no longer bookable', async () => {
    const { onChangeTimes } = setup({
      quote: {
        ...QUOTE,
        bookable: false,
        visits: [{ ...QUOTE.visits[0], available: false, reason: 'POOL_CAPACITY_EXHAUSTED' }],
      },
    });

    expect(await screen.findByText('Some times were just taken')).toBeTruthy();
    fireEvent.press(screen.getByTestId('recurring-autopay-screen-change-times'));
    expect([...(onChangeTimes.mock.calls[0]?.[0] as Set<string>)]).toEqual(['plan-1#2026-10-07']);
  });

  it('names the days over the Autopay limit instead of saying a time was taken', async () => {
    const { onChangeTimes } = setup({
      quote: {
        ...QUOTE,
        bookable: false,
        dayTotals: [
          { date: '2026-10-07', visitsCount: 2, totalPaise: 120000, overLimit: true },
          { date: '2026-10-08', visitsCount: 1, totalPaise: 35400, overLimit: false },
        ],
      },
    });

    expect(await screen.findByText('Over the Autopay limit on some days')).toBeTruthy();
    expect(screen.getByText(/up to ₹1,000 a day/)).toBeTruthy();
    expect(screen.getByText(/\(₹1,200\)/)).toBeTruthy();
    expect(screen.queryByText('Some times were just taken')).toBeNull();
    fireEvent.press(screen.getByTestId('recurring-autopay-screen-change-times'));
    expect(onChangeTimes).toHaveBeenCalledTimes(1);
  });
});
