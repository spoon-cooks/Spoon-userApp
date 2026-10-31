import { fireEvent, render, screen } from '@testing-library/react-native';

import type { BookingDetailDto, RefundDto } from '@features/booking';
import { VisitDetailsScreen } from '@features/recurringLive';

import { ServiceVisitScreen } from './ServiceVisitScreen';
import type { ServiceVisitModel, ServiceVisitScreenProps } from './ServiceVisitScreen';
import {
  SPOON_CANCEL_REASON,
  cancelledVisitModelFrom,
  isSpoonCancellation,
  spoonCancelHelpMessage,
  spoonCancelledFrom,
} from './cancelledVisit';
import { reassignedOneTime } from './model';
import type { ServicePhase } from './model';
import { SpoonCancelledCard } from './notices';

jest.mock('react-native-worklets', () =>
  jest.requireActual('react-native-worklets/lib/module/mock'),
);
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));

const START = '2026-10-14T03:30:00.000Z';
const CANCELLED_AT = '2026-10-01T13:10:00.000Z';

function booking(overrides: Partial<BookingDetailDto> = {}): BookingDetailDto {
  return {
    id: 'bk-1',
    status: 'cancelled',
    slotType: 'scheduled',
    scheduledStart: START,
    durationMinutes: 60,
    totalDurationMinutes: 60,
    price: {
      amountPaise: 29900,
      durationMinutes: 60,
      serviceAmountPaise: 25339,
      taxRateBps: 1800,
      taxAmountPaise: 4561,
      totalAmountPaise: 29900,
      currency: 'INR',
      pricingVersion: 'v1',
    },
    timing: { arrivedAt: null, actualStart: null, expectedEnd: null, actualEnd: null },
    cancellation: null,
    reassignment: { occurred: false, sequence: 0, reassignedAt: null },
    recurring: null,
    cook: null,
    ...overrides,
  } as BookingDetailDto;
}

function cancelledBy(
  by: string,
  reasonCode: string | null = 'RECOVERY_NOT_POSSIBLE',
  overrides: Partial<BookingDetailDto> = {},
): BookingDetailDto {
  return booking({
    cancellation: {
      cancelledBy: by,
      reasonCode,
      reasonDetail: 'Cook Meera called in sick',
      cancelledAt: CANCELLED_AT,
      refundAmountPaise: 29900,
      chargeAmountPaise: 0,
    },
    ...overrides,
  });
}

const REFUND = {
  refundId: 'rfnd_1',
  bookingId: 'bk-1',
  reason: 'spoon_cancel',
  amountPaise: 29900,
  currency: 'INR',
  state: 'requested',
  requestedAt: CANCELLED_AT,
  completedAt: null,
} as RefundDto;

const MODEL: ServiceVisitModel = {
  phase: 'assigned',
  title: 'On-time visit',
  bannerTitle: 'Wed, 14 Oct',
  bannerSlot: '9:00 AM – 10:00 AM · 1 hr',
  cook: { eyebrow: '', name: 'Cook Meera', note: '' },
  menu: [],
  cookName: 'Meera',
  cookPhoto: null,
  prepChecked: [],
  arrival: { by: '8:57 AM', minutes: 24, onTime: true },
  arrivedAt: '8:56 AM',
  startOtp: ['4', '8', '2', '7'],
  endOtp: ['6', '1', '9', '3'],
  minutesLeft: 60,
  endsAt: '10:00 AM',
  startedAt: '9:00 AM',
  extendChoices: [],
  extendedMinutes: 0,
  freeTill: null,
  tipPaid: null,
  canTip: false,
};

function renderScreen(model: Partial<ServiceVisitModel>) {
  const props: ServiceVisitScreenProps = {
    model: { ...MODEL, ...model },
    onBack: jest.fn(),
    onPaymentDetails: jest.fn(),
    briefChecked: [],
    onBriefToggle: jest.fn(),
    extending: false,
    onExtend: jest.fn(),
    onBookAnother: jest.fn(),
    tipping: false,
    onTip: jest.fn(),
  };
  render(<ServiceVisitScreen {...props} />);
}

describe('Cook reassigned (2353:17562, dev note 2353:17578)', () => {
  it('counts only a reassignment that happened, on a one-time visit', () => {
    const swapped = { occurred: true, sequence: 1, reassignedAt: CANCELLED_AT };
    expect(reassignedOneTime(booking({ status: 'assigned', reassignment: swapped }))).toBe(true);
    expect(reassignedOneTime(booking({ status: 'assigned' }))).toBe(false);
    expect(reassignedOneTime(booking({ status: 'assigned', reassignment: null }))).toBe(false);
    expect(
      reassignedOneTime(
        booking({
          status: 'assigned',
          reassignment: swapped,
          recurring: { recurringBookingId: 'rb-1', visitId: 'v-1' },
        } as Partial<BookingDetailDto>),
      ),
    ).toBe(false);
  });

  it('sits above the cook card while assigned, without naming the previous cook', () => {
    renderScreen({ phase: 'assigned', reassigned: true });
    expect(screen.getByText('Sorry, we have assigned you another cook')).toBeTruthy();
    expect(
      screen.getByText(
        'We had to reassign your booking to another cook due to operational reasons with the previously assigned cook',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('service-visit-reassigned')).toBeTruthy();
    expect(screen.getByTestId('service-visit-cook')).toBeTruthy();
  });

  it.each<ServicePhase>(['onTheWay', 'arrived', 'cooking', 'completed'])(
    'is gone once the visit moves on (%s)',
    (phase) => {
      renderScreen({ phase, reassigned: true });
      expect(screen.queryByTestId('service-visit-reassigned')).toBeNull();
    },
  );

  it('is not drawn for a visit that was never reassigned', () => {
    renderScreen({ phase: 'assigned' });
    expect(screen.queryByTestId('service-visit-reassigned')).toBeNull();
  });
});

describe('Cancelled by Spoon (2342:4195, dev note 2342:4405)', () => {
  it('is Spoon’s cancellation only when ops or the system cancelled a paid one-time visit', () => {
    expect(isSpoonCancellation(cancelledBy('system'), REFUND)).toBe(true);
    expect(isSpoonCancellation(cancelledBy('operations', 'COOK_UNAVAILABLE'), null)).toBe(true);
    expect(isSpoonCancellation(cancelledBy('customer', 'URGENT_CHANGE'), REFUND)).toBe(false);
    // The customer's own abandoned or expired checkout, or Ops acting on their request.
    expect(isSpoonCancellation(cancelledBy('system', 'ABANDONED_CHECKOUT'), null)).toBe(false);
    expect(isSpoonCancellation(cancelledBy('system', 'CHECKOUT_EXPIRED'), null)).toBe(false);
    expect(isSpoonCancellation(cancelledBy('operations', 'CUSTOMER_REQUEST'), REFUND)).toBe(false);
    // Recurring visits keep the plan's own screen.
    expect(
      isSpoonCancellation(
        cancelledBy('system', 'RECOVERY_NOT_POSSIBLE', {
          recurring: { recurringBookingId: 'rb-1', visitId: 'v-1' },
        } as Partial<BookingDetailDto>),
        REFUND,
      ),
    ).toBe(false);
  });

  it('shows Figma’s one reason line for every code, never the operator’s words', () => {
    for (const code of ['RECOVERY_NOT_POSSIBLE', 'COOK_EMERGENCY', 'TECHNICAL_FAILURE', null]) {
      expect(spoonCancelledFrom(cancelledBy('operations', code), REFUND)?.reason).toBe(
        SPOON_CANCEL_REASON,
      );
    }
    expect(SPOON_CANCEL_REASON).toBe('None of our cooks could make it to your booked slot.');
  });

  it('reads the moment, the full refund and the rebook prefill off the booking', () => {
    expect(spoonCancelledFrom(cancelledBy('system'), REFUND)).toEqual({
      when: 'Thu, 1 Oct, 6:40 PM',
      reason: 'None of our cooks could make it to your booked slot.',
      refundLine: 'Full ₹299 refund started, no deductions',
      rebook: { date: '2026-10-14', durationId: 'dur-60' },
    });
    expect(spoonCancelledFrom(cancelledBy('customer', 'URGENT_CHANGE'), REFUND)).toBeNull();
    expect(spoonCancelHelpMessage(cancelledBy('system'))).toBe(
      'Hi Spoon, my visit on Wed, 14 Oct, 9:00 AM (booking bk-1) was cancelled by Spoon. Can you help me?',
    );
  });

  it('Payment & refund: Refund started, no deductions, nothing taken', () => {
    const model = cancelledVisitModelFrom(cancelledBy('system'), REFUND, null);
    expect(model.refund?.badge).toBe('Refund started');
    expect(model.refund?.badgeTone).toBe('neutral');
    expect(model.refund?.total.detail).toBe('Full refund, no deductions');
    expect(model.refund?.lines[2]).toEqual({
      label: 'Cancellation fee',
      amount: '– ₹0',
      minor: true,
    });
  });

  it('a customer’s own cancellation keeps the plain card and payment summary', () => {
    const model = cancelledVisitModelFrom(cancelledBy('customer', 'URGENT_CHANGE'), REFUND, null);
    expect(model.refund?.badge).toBe('Refund initiated');
    expect(model.refund?.badgeTone).toBeUndefined();
    expect(model.cancelled.byline).toBe('By you · Thu, 1 Oct, 6:40 PM');
  });

  it('draws the apology card in place of "Visit cancelled"; its buttons call their handlers', () => {
    const data = spoonCancelledFrom(cancelledBy('system'), REFUND);
    const onRebook = jest.fn();
    const onTalkToUs = jest.fn();
    render(
      <VisitDetailsScreen
        model={cancelledVisitModelFrom(cancelledBy('system'), REFUND, null)}
        title="On-time visit"
        onBack={jest.fn()}
        cancelledSlot={
          data === null ? undefined : (
            <SpoonCancelledCard
              when={data.when}
              reason={data.reason}
              refundLine={data.refundLine}
              onRebook={onRebook}
              onTalkToUs={onTalkToUs}
              testID="spoon"
            />
          )
        }
      />,
    );
    expect(screen.getByText('We’re so sorry, we had to cancel your visit')).toBeTruthy();
    expect(screen.getAllByText('CANCELLED')).toHaveLength(2); // the banner's badge and the eyebrow
    expect(screen.getByText('Thu, 1 Oct, 6:40 PM')).toBeTruthy();
    expect(
      screen.getByText(
        'None of our cooks could make it to your booked slot. This one’s on us, & we know you were counting on us.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Full ₹299 refund started, no deductions')).toBeTruthy();
    expect(screen.getByText('We’ve flagged this so it doesn’t happen again')).toBeTruthy();
    expect(screen.queryByText('Visit cancelled')).toBeNull();
    expect(screen.getByText('Refund started')).toBeTruthy();
    fireEvent.press(screen.getByTestId('spoon-rebook'));
    expect(onRebook).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('spoon-talk'));
    expect(onTalkToUs).toHaveBeenCalledTimes(1);
  });

  it('without the apology slot the plain "Visit cancelled" card stays', () => {
    render(
      <VisitDetailsScreen
        model={cancelledVisitModelFrom(cancelledBy('customer', 'URGENT_CHANGE'), REFUND, null)}
        title="On-time visit"
        onBack={jest.fn()}
      />,
    );
    expect(screen.getByText('Visit cancelled')).toBeTruthy();
    expect(screen.queryByText('We’re so sorry, we had to cancel your visit')).toBeNull();
  });
});
