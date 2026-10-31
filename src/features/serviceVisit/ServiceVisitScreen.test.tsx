import { fireEvent, render, screen } from '@testing-library/react-native';

import type { BookingDetailDto } from '@features/booking';

import { ServiceVisitScreen } from './ServiceVisitScreen';
import type { ServiceVisitModel, ServiceVisitScreenProps } from './ServiceVisitScreen';
import {
  arrivalOf,
  defaultExtendMinutes,
  extendChoicesFrom,
  minutesLeft,
  servicePhaseOf,
  timerDigits,
} from './model';

jest.mock('react-native-worklets', () =>
  jest.requireActual('react-native-worklets/lib/module/mock'),
);
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));

const START = '2026-10-14T03:30:00.000Z';

function booking(overrides: Partial<BookingDetailDto> = {}): BookingDetailDto {
  return {
    status: 'assigned',
    slotType: 'scheduled',
    scheduledStart: START,
    durationMinutes: 60,
    totalDurationMinutes: 60,
    timing: { arrivedAt: null, actualStart: null, expectedEnd: null, actualEnd: null },
    ...overrides,
  } as BookingDetailDto;
}

const option = (minutes: number, totalAmountPaise: number) => ({
  minutes,
  pricePaise: totalAmountPaise,
  taxAmountPaise: 0,
  taxRateBps: 0,
  totalAmountPaise,
  currency: 'INR' as const,
  pricingVersion: 'v1',
  newExpectedEnd: '2026-10-14T05:00:00.000Z',
});

const MODEL: ServiceVisitModel = {
  phase: 'assigned',
  title: 'On-time visit',
  bannerTitle: 'Wed, 14 Oct',
  bannerSlot: '9:00 AM – 10:00 AM · 1 hr',
  cook: { eyebrow: 'SPOON TRAINED · VERIFIED', name: 'Cook Meera', note: '' },
  menu: [],
  cookName: 'Meera',
  cookPhoto: null,
  prepChecked: [],
  arrival: { by: '8:57 AM', minutes: 24, onTime: true },
  arrivedAt: '8:56 AM',
  startOtp: ['4', '8', '2', '7'],
  endOtp: ['6', '1', '9', '3'],
  minutesLeft: 102,
  endsAt: '9:58 AM',
  startedAt: '8:58 AM',
  extendChoices: extendChoicesFrom([option(10, 1500), option(20, 3500), option(30, 6900)]),
  extendedMinutes: 0,
  freeTill: '10:30 AM',
  tipPaid: null,
  canTip: true,
};

function renderPhase(
  overrides: Partial<ServiceVisitModel>,
  props: Partial<ServiceVisitScreenProps> = {},
) {
  const all: ServiceVisitScreenProps = {
    model: { ...MODEL, ...overrides },
    onBack: jest.fn(),
    onPaymentDetails: jest.fn(),
    onModifyBooking: jest.fn(),
    onHelp: jest.fn(),
    onCall: jest.fn(),
    briefChecked: [],
    onBriefToggle: jest.fn(),
    extending: false,
    onExtend: jest.fn(),
    onBookAnother: jest.fn(),
    tipping: false,
    onTip: jest.fn(),
    ...props,
  };
  render(<ServiceVisitScreen {...all} />);
  return all;
}

describe('model', () => {
  it('reads the phase off the server status; time’s up off the clock while cooking', () => {
    const now = new Date('2026-10-14T03:40:00.000Z');
    expect(servicePhaseOf(booking({ status: 'assigned' }), now)).toBe('assigned');
    expect(servicePhaseOf(booking({ status: 'cook_en_route' }), now)).toBe('onTheWay');
    expect(servicePhaseOf(booking({ status: 'cook_arrived' }), now)).toBe('arrived');
    const cooking = booking({
      status: 'cooking',
      timing: {
        arrivedAt: null,
        actualStart: '2026-10-14T03:28:00.000Z',
        expectedEnd: '2026-10-14T04:28:00.000Z',
        actualEnd: null,
      },
    });
    expect(servicePhaseOf(cooking, now)).toBe('cooking');
    expect(minutesLeft(cooking, now)).toBe(48);
    expect(servicePhaseOf(cooking, new Date('2026-10-14T04:30:00.000Z'))).toBe('timesUp');
    expect(servicePhaseOf(booking({ status: 'created' }), now)).toBeNull();
    expect(servicePhaseOf(booking({ status: 'cancelled' }), now)).toBeNull();
  });

  it('shows H : MM and an arrival that never drops below a minute', () => {
    expect(timerDigits(102)).toEqual({ hours: '1', tens: '4', units: '2' });
    const late = arrivalOf(
      booking(),
      { eta: { estimatedArrivalAt: '2026-10-14T03:50:00.000Z', updatedAt: null } } as never,
      new Date('2026-10-14T03:49:40.000Z'),
    );
    expect(late.minutes).toBe(1);
    expect(late.onTime).toBe(false);
  });

  it('defaults to +20 when it fits, else the largest that does', () => {
    expect(defaultExtendMinutes(extendChoicesFrom([option(10, 1500), option(20, 3500)]))).toBe(20);
    expect(defaultExtendMinutes(extendChoicesFrom([option(10, 1500)]))).toBe(10);
    expect(defaultExtendMinutes(extendChoicesFrom([]))).toBeNull();
  });
});

describe('Service flow screen (2165:11841)', () => {
  it('assigned: banner, cook, recipe and before-arrival checklist, with Modify booking', () => {
    renderPhase({ phase: 'assigned' });
    expect(screen.getByText('On-time visit')).toBeTruthy();
    expect(screen.getByText('ASSIGNED')).toBeTruthy();
    expect(screen.getByTestId('service-visit-prep')).toBeTruthy();
    expect(screen.getByTestId('service-visit-dock-modify')).toBeTruthy();
  });

  it('on the way: arrival tile with the minutes and the on-time pill', () => {
    renderPhase({ phase: 'onTheWay', bannerTitle: '9:00 AM · 1 hr', bannerSlot: null });
    expect(screen.getByText('ARRIVING')).toBeTruthy();
    expect(screen.getByText('Cook arriving by')).toBeTruthy();
    expect(screen.getByTestId('service-visit-arrival-minutes').props.children).toBe('24');
    expect(screen.getByText('On time')).toBeTruthy();
  });

  it('arrived: the Start OTP and "Brief your cook"; no Modify booking', () => {
    const props = renderPhase({ phase: 'arrived', bannerSlot: null });
    expect(screen.getByText('Arrived at 8:56 AM')).toBeTruthy();
    expect(screen.getByText('START OTP')).toBeTruthy();
    fireEvent.press(screen.getByTestId('service-visit-brief-menu'));
    expect(props.onBriefToggle).toHaveBeenCalledWith('menu');
    expect(screen.queryByTestId('service-visit-dock-modify')).toBeNull();
  });

  it('cooking: the countdown, Extend (+20 default, Popular) and the End OTP', () => {
    const props = renderPhase({ phase: 'cooking', bannerSlot: null });
    expect(screen.getByText('Ends at 9:58 AM')).toBeTruthy();
    expect(screen.getByText('Meera is free till 10:30 AM')).toBeTruthy();
    expect(screen.getByText('Popular')).toBeTruthy();
    fireEvent.press(screen.getByTestId('service-visit-extend-cta'));
    expect(props.onExtend).toHaveBeenCalledWith(20);
    expect(screen.getByText('END OTP')).toBeTruthy();
    expect(screen.getByText('What she’ll clean up')).toBeTruthy();
  });

  it('cooking with nothing free: "Can’t extend this visit" and Book another visit', () => {
    const props = renderPhase({ phase: 'cooking', extendChoices: extendChoicesFrom([]) });
    expect(screen.getByText('Can’t extend this visit')).toBeTruthy();
    fireEvent.press(screen.getByTestId('service-visit-extend-book-another'));
    expect(props.onBookAnother).toHaveBeenCalled();
  });

  it('extended: the confirmation banner and the new end', () => {
    renderPhase({ phase: 'cooking', extendedMinutes: 20, endsAt: '10:18 AM' });
    expect(screen.getByText('Extended by 20 mins')).toBeTruthy();
    expect(screen.getByText('Now ends at 10:18 AM')).toBeTruthy();
  });

  it('time’s up: 0:00 and "Wrap up the visit now" above Extend', () => {
    renderPhase({ phase: 'timesUp', minutesLeft: 0 });
    expect(screen.getByText('Time is up!')).toBeTruthy();
    expect(screen.getByText('Wrap up the visit now')).toBeTruthy();
  });

  it('completed: the tip card — CTA disabled until an amount is picked', () => {
    const props = renderPhase({ phase: 'completed' });
    expect(screen.getByText('Make Meera’s day with a tip')).toBeTruthy();
    expect(screen.getByText('Pick an amount to say thanks')).toBeTruthy();
    fireEvent.press(screen.getByTestId('service-visit-tip-50'));
    fireEvent.press(screen.getByTestId('service-visit-tip-pay'));
    expect(props.onTip).toHaveBeenCalledWith(5000);
  });

  it('completed: "Other" takes a typed amount', () => {
    const props = renderPhase({ phase: 'completed' });
    fireEvent.press(screen.getByTestId('service-visit-tip-other'));
    const input = screen.getByTestId('service-visit-tip-other-input');
    // The field holds "₹" and the amount together, centred in the pill.
    expect(input.props.value).toBe('₹');
    fireEvent.changeText(input, '₹75');
    expect(screen.getByTestId('service-visit-tip-other-input').props.value).toBe('₹75');
    // "₹" and five digits at most, held by the field itself.
    expect(screen.getByTestId('service-visit-tip-other-input').props.maxLength).toBe(6);
    fireEvent.press(screen.getByTestId('service-visit-tip-pay'));
    expect(props.onTip).toHaveBeenCalledWith(7500);
  });

  it('completed and tipped: the confirmation instead of the amounts', () => {
    renderPhase({ phase: 'completed', tipPaid: { amountPaise: 5000, when: 'Paid · Wed, 14 Oct' } });
    expect(screen.getByText('₹50 tip sent to Meera')).toBeTruthy();
    expect(screen.getByText('Thank you, you just made Meera’s day!')).toBeTruthy();
  });
});
