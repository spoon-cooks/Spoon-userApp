import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert, ScrollView } from 'react-native';

import {
  DEFAULT_API_STUBS,
  createStubApi,
  createTestRuntime,
  renderWithRuntime,
} from '@/test/renderWithRuntime';
import RecurringBookingRoute from '@/app/(app)/recurring/[bookingId]';

/**
 * A live Recurring booking's "Manage plans" tab on the booking itself: read-only plans, past visits
 * that open their details, and the trash cancelling every visit still to come.
 */
jest.mock('react-native-worklets', () =>
  jest.requireActual('react-native-worklets/lib/module/mock'),
);
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    dismissTo: jest.fn(),
  }),
  useLocalSearchParams: () => ({ bookingId: 'rb-1' }),
  useFocusEffect: () => undefined,
}));

const PRICE = {
  basePricePaise: 33814,
  pricePaise: 25339,
  gstPaise: 4561,
  totalPaise: 29900,
  pricingVersion: 'v1',
};

const DONE = {
  visitId: 'visit-done',
  planNumber: 1,
  visitNumber: 1,
  date: '2026-10-02',
  timeOfDay: 'morning',
  startTime: '09:00',
  start: '2026-10-02T03:30:00.000Z',
  durationMinutes: 60,
  status: 'completed',
  displayState: 'completed',
  cookConfirmBy: '2026-10-02T00:30:00.000Z',
  cook: {
    cookId: 'c-1',
    displayName: 'Cook Meera',
    profileImageUrl: null,
    rating: { average: 4.8, count: 12 },
  },
  bookingId: 'bk-1',
  totalPaise: 29900,
  cancelledBy: null,
};

const BOOKING = {
  recurringBookingId: 'rb-1',
  status: 'active',
  addressId: 'addr-1',
  window: { startDate: '2026-09-28', endDate: '2026-10-30' },
  policyVersion: 'recurring-v2-spec-1',
  mandate: null,
  banner: null,
  counts: { done: 1, cancelled: 0, toGo: 4 },
  plans: [
    {
      planNumber: 1,
      days: ['2026-10-02', '2026-10-14', '2026-10-21'],
      visits: [
        {
          visitNumber: 1,
          timeOfDay: 'morning',
          durationMinutes: 90,
          startTime: '09:00',
          days: ['2026-10-02', '2026-10-14', '2026-10-21'],
          price: PRICE,
        },
      ],
      history: [DONE],
    },
  ],
  days: [{ date: '2026-10-02', group: 'past', visits: [DONE] }],
  upNext: null,
  chargeRange: { minPaise: 29900, maxPaise: 29900 },
  support: { whatsappUrl: null },
  createdAt: '2026-09-20T06:00:00.000Z',
  cancelledAt: null,
  cancelledBy: null,
};

function render(onCancel = jest.fn(), booking: Record<string, unknown> = BOOKING) {
  renderWithRuntime(<RecurringBookingRoute />, {
    runtime: createTestRuntime({
      api: createStubApi({
        ...DEFAULT_API_STUBS,
        'GET /v1/me/recurring-bookings/rb-1': () => booking,
        'GET /v1/me/recurring-bookings/rb-1/cancellation-quote': () => ({
          recurringBookingId: 'rb-1',
          cancellable: true,
          freeCount: 2,
          debited: [],
          startedCount: 0,
          totals: { feePaise: 0, refundPaise: 0 },
        }),
        'GET /v1/me/recurring-bookings/rb-1/plans/1/cancellation-quote': () => ({
          recurringBookingId: 'rb-1',
          planNumber: 1,
          cancellable: true,
          cancelDates: ['2026-10-14', '2026-10-21'],
          keptDates: ['2026-10-02'],
          visitsCancelled: 2,
        }),
        'POST /v1/me/recurring-bookings/rb-1/plans/1/cancel': (body) => {
          onCancel(body);
          return {
            booking: { ...BOOKING, status: 'completed' },
            planNumber: 1,
            visitsCancelled: 2,
            cancelDates: ['2026-10-14', '2026-10-21'],
            keptDates: ['2026-10-02'],
          };
        },
      }),
    }),
  });
  return onCancel;
}

async function openPlans() {
  fireEvent.press(await screen.findByTestId('recurring-live-screen-header-plans'));
  await screen.findByTestId('recurring-plans-screen');
}

describe('Recurring Manage plans route', () => {
  beforeEach(() => mockPush.mockClear());

  it('shows the booking’s own plans, with only the duration pencil (DEC-093)', async () => {
    render();
    await openPlans();

    expect(screen.getByText('Plan 1 selected dates')).toBeTruthy();
    expect(screen.getByText('90 minutes')).toBeTruthy();
    expect(screen.getByText('1 past visit')).toBeTruthy();
    expect(screen.getByText('Completed · Cook Meera')).toBeTruthy();
    // Nothing from the frames, and no add plan / add visit. The pencil opens Edit duration for
    // the visit on screen.
    expect(screen.queryByText(/Rani|Plan 2/)).toBeNull();
    fireEvent.press(screen.getByTestId('recurring-plans-screen-calendar-edit'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/recurring/[bookingId]/duration',
        params: expect.objectContaining({ planNumber: '1', visitNumber: '1' }),
      }),
    );
    expect(screen.queryByTestId('recurring-plans-screen-bar-add-plan')).toBeNull();
    expect(screen.queryByTestId('recurring-plans-screen-bar-add-visit')).toBeNull();
  });

  it('opens a past visit’s details', async () => {
    render();
    await openPlans();
    fireEvent.press(screen.getByTestId('recurring-plans-screen-history-row-visit-done'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/recurring/[bookingId]/visits/[visitId]',
      params: { bookingId: 'rb-1', visitId: 'visit-done' },
    });
  });

  // DEC-092: the trash deletes the Plan on screen; its days not charged yet go, the paid one stays.
  it('deletes the plan on screen from the trash, keeping the day already paid', async () => {
    const onCancel = render();
    const alert = jest.spyOn(Alert, 'alert');
    await openPlans();

    // The app's own confirm (`542:1669`), not a system alert: what goes, what stays, which days.
    await waitFor(() => {
      fireEvent.press(screen.getByTestId('recurring-plans-screen-header-delete'));
      expect(screen.getByTestId('delete-plan-dialog')).toBeTruthy();
    });
    expect(screen.getByText('Delete Plan 1?')).toBeTruthy();
    expect(
      screen.getByText(
        '2 days still to come will be cancelled. Nothing is charged for them. 1 day already paid for or done stays as booked.',
      ),
    ).toBeTruthy();
    expect(alert).not.toHaveBeenCalledWith('Delete Plan 1?', expect.anything(), expect.anything());
    alert.mockImplementation(() => undefined);
    fireEvent.press(screen.getByTestId('delete-plan-dialog-confirm'));

    fireEvent.press(await screen.findByTestId('cancel-reason-URGENT_CHANGE'));
    fireEvent.press(screen.getByTestId('cancel-continue-reason'));
    fireEvent.press(await screen.findByTestId('cancel-confirm'));

    await waitFor(() => expect(onCancel).toHaveBeenCalledWith({ reasonCode: 'URGENT_CHANGE' }));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        'Plan 1 deleted',
        '2 days cancelled, nothing charged. That was your last plan, so this Recurring booking is closed and Autopay is stopped.',
      ),
    );
    alert.mockRestore();
  });

  it('asks to approve Autopay on a booking saved but never approved, and scrolls', async () => {
    render(jest.fn(), { ...BOOKING, status: 'pending_mandate' });
    expect(await screen.findByTestId('autopay-notice')).toBeTruthy();
    expect(screen.getAllByText('Approve UPI Autopay')).toHaveLength(2);
    // The notice adds height above the calendar, so the tab scrolls rather than cropping it.
    expect(screen.UNSAFE_getAllByType(ScrollView).length).toBeGreaterThan(0);
  });

  it('offers to re-approve a paused mandate', async () => {
    render(jest.fn(), {
      ...BOOKING,
      banner: { kind: 'MANDATE_PAUSED', action: 'REAPPROVE_MANDATE' },
    });
    expect(await screen.findByText('Autopay is paused')).toBeTruthy();
    expect(screen.getByText('Re-approve Autopay')).toBeTruthy();
  });

  it('draws no Autopay notice on an active booking', async () => {
    render();
    await screen.findByTestId('recurring-live-screen');
    expect(screen.queryByTestId('autopay-notice')).toBeNull();
  });
});
