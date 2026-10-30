import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import type { CheckoutLauncher } from '@features/payment';
import { fromStatus } from '@core/errors';
import { createStubApi, createTestRuntime, renderWithRuntime } from '@/test/renderWithRuntime';

import type { RecurringDraftInput } from '../api';
import { useAutopayFlow } from './useAutopayFlow';
import type { AutopaySource } from './useAutopayFlow';
import type { UpiApp } from './upiApps';

/**
 * The Autopay sheet's save and approval timing (V0 DEC-119): "Book Now" opens the sheet and saves
 * the booking at once, holding its Cooks while an app is picked; a booking that lapsed before the
 * customer was sent to approve is saved again rather than left stuck.
 */

const PHONEPE: UpiApp = { id: 'phonepe', name: 'PhonePe', packageName: 'com.phonepe.app' };

jest.mock('./upiApps', () => ({
  ...jest.requireActual<object>('./upiApps'),
  listInstalledUpiApps: async () => [PHONEPE],
  openUpiApp: async () => true,
}));

const DRAFT: RecurringDraftInput = {
  addressId: '11111111-1111-4111-8111-111111111111',
  plans: [
    {
      planNumber: 1,
      dates: ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'],
      visits: [{ visitNumber: 1, timeOfDay: 'morning', startTime: '09:00', durationMinutes: 60 }],
    },
  ],
} as unknown as RecurringDraftInput;

const ELIGIBILITY = {
  policyVersion: 'recurring-two-stage-hold',
  unlocked: true,
  poolCount: 2,
  unlockThreshold: 2,
  chip: 'book',
  liveBookings: [],
  window: { startDate: '2026-11-02', endDate: '2026-11-22' },
  limits: { minDays: 5, maxDays: 14 },
  timesOfDay: [],
  durations: [],
  charging: { notifyLeadHours: 27, debitLeadHours: 3, mandateMaxChargePaise: 100000 },
};

function booking(id: string) {
  return {
    recurringBookingId: id,
    status: 'pending_mandate',
    addressId: DRAFT.addressId,
    window: ELIGIBILITY.window,
    policyVersion: 'recurring-two-stage-hold',
    mandate: null,
    banner: null,
    counts: { done: 0, cancelled: 0, toGo: 5 },
    plans: [],
    days: [],
    upNext: null,
    chargeRange: { minPaise: 105, maxPaise: 105 },
    support: { whatsappUrl: null },
    createdAt: '2026-10-30T15:00:00.000Z',
    cancelledAt: null,
    cancelledBy: null,
  };
}

function checkout(id: string) {
  return {
    mandateId: `mandate-${id}`,
    recurringBookingId: id,
    method: 'upi',
    status: 'pending',
    provider: 'razorpay',
    providerOrderId: `order_${id}`,
    providerCustomerId: 'cust_1',
    amountPaise: 100,
    currency: 'INR',
    maxAmountPaise: 100000,
    approveBy: '2026-10-30T15:08:00.000Z',
    keyId: 'rzp_live_key',
  };
}

function verified(id: string) {
  return {
    mandateId: `mandate-${id}`,
    recurringBookingId: id,
    method: 'upi',
    status: 'confirmed',
    bookingStatus: 'active',
    handleMasked: 'ra••••@okhdfc',
    confirmedAt: '2026-10-30T15:03:00.000Z',
  };
}

function Harness({ source }: { readonly source: AutopaySource }) {
  const launcher: CheckoutLauncher = {
    open: async () => ({ providerPaymentId: 'pay_1', signature: 'sig' }),
  };
  const flow = useAutopayFlow({ open: true, source, userId: null, launcher });
  return (
    <>
      <Text testID="state">{flow.state.kind}</Text>
      <Text testID="booking">{flow.bookingId ?? 'none'}</Text>
      <Pressable testID="pick" onPress={() => flow.pick(PHONEPE)} />
    </>
  );
}

function setup(options: { lapsedFirst?: boolean } = {}) {
  const calls: string[] = [];
  let creates = 0;
  let lapses = options.lapsedFirst === true ? 1 : 0;
  const runtime = createTestRuntime({
    api: createStubApi({
      'GET /v1/recurring/eligibility': () => ELIGIBILITY,
      'POST /v1/recurring/bookings': () => {
        creates += 1;
        calls.push(`create rb-${String(creates)}`);
        return booking(`rb-${String(creates)}`);
      },
      'POST /v1/me/recurring-bookings/rb-1/mandate': () => {
        calls.push('mandate rb-1');
        if (lapses > 0) {
          lapses -= 1;
          throw fromStatus(409, {
            code: 'INVALID_BOOKING_STATE',
            details: { reason: 'MANDATE_WINDOW_CLOSED' },
          });
        }
        return checkout('rb-1');
      },
      'POST /v1/me/recurring-bookings/rb-1/mandate/verify': () => {
        calls.push('verify rb-1');
        return verified('rb-1');
      },
      'POST /v1/me/recurring-bookings/rb-2/mandate': () => {
        calls.push('mandate rb-2');
        return checkout('rb-2');
      },
      'POST /v1/me/recurring-bookings/rb-2/mandate/verify': () => {
        calls.push('verify rb-2');
        return verified('rb-2');
      },
    }),
  });
  return { calls, runtime };
}

describe('useAutopayFlow — save on "Book Now", then approve (DEC-119)', () => {
  it('saves the booking as the sheet opens, before any app is picked, and only once', async () => {
    const { calls, runtime } = setup();
    renderWithRuntime(<Harness source={{ kind: 'draft', draft: DRAFT }} />, { runtime });

    await waitFor(() => expect(screen.getByTestId('booking')).toHaveTextContent('rb-1'));
    expect(calls).toEqual(['create rb-1']);

    fireEvent.press(screen.getByTestId('pick'));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('active'));
    // Picking the app sent the customer to approve; it did not save a second time.
    expect(calls).toEqual(['create rb-1', 'mandate rb-1', 'verify rb-1']);
  });

  it('saves the plans again when the booking lapsed before an app was picked', async () => {
    const { calls, runtime } = setup({ lapsedFirst: true });
    renderWithRuntime(<Harness source={{ kind: 'draft', draft: DRAFT }} />, { runtime });
    await waitFor(() => expect(screen.getByTestId('booking')).toHaveTextContent('rb-1'));

    fireEvent.press(screen.getByTestId('pick'));

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('active'));
    expect(calls).toEqual([
      'create rb-1',
      'mandate rb-1',
      'create rb-2',
      'mandate rb-2',
      'verify rb-2',
    ]);
    expect(screen.getByTestId('booking')).toHaveTextContent('rb-2');
  });

  it('saves a reopened booking again from its plans once it has lapsed', async () => {
    const { calls, runtime } = setup({ lapsedFirst: true });
    renderWithRuntime(
      <Harness source={{ kind: 'booking', booking: booking('rb-1') as never, draft: DRAFT }} />,
      { runtime },
    );

    // A saved booking is not saved again just because the sheet opened.
    expect(calls).toEqual([]);
    fireEvent.press(screen.getByTestId('pick'));

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('active'));
    expect(calls).toEqual(['mandate rb-1', 'create rb-1', 'mandate rb-1', 'verify rb-1']);
  });
});
