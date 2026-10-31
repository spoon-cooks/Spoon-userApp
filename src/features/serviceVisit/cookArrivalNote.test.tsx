import { render, screen } from '@testing-library/react-native';

import { bookingDetailSchema } from '@features/booking/api/schemas';

import { ServiceVisitScreen } from './ServiceVisitScreen';
import type { ServiceVisitModel, ServiceVisitScreenProps } from './ServiceVisitScreen';
import type { ServicePhase } from './model';

jest.mock('react-native-worklets', () =>
  jest.requireActual('react-native-worklets/lib/module/mock'),
);
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));

/**
 * "Visit details / upcoming · Cook in -15 mins" (`2878:7730`) and "· Cook in +10 mins"
 * (`2878:7959`): the customer keeps the booked time, and is told when the cook may come early or
 * late (Business Rules Spec §8).
 */

const MODEL: ServiceVisitModel = {
  phase: 'assigned',
  title: 'On-time visit',
  bannerTitle: 'Wed, 14 Oct',
  bannerSlot: '9:00 AM – 10:00 AM · 1 hr',
  cook: { eyebrow: '', name: 'Cook Sanchita', note: '' },
  menu: [],
  cookName: 'Sanchita',
  cookPhoto: null,
  prepChecked: [],
  arrival: { by: null, minutes: null, onTime: true },
  arrivedAt: null,
  startOtp: null,
  endOtp: null,
  minutesLeft: 60,
  endsAt: null,
  startedAt: null,
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

describe('Cook due early or late (2878:7730, 2878:7959)', () => {
  it('tells the customer the cook may come up to 15 minutes early', () => {
    renderScreen({ cookArrival: 'early' });
    expect(screen.getByText('Your cook might arrive up to 15 minutes early')).toBeTruthy();
    expect(
      screen.getByText(
        'Thanks for accommodating, your assigned cook would really benefit from starting just a little early :)',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('service-visit-cook')).toBeTruthy();
  });

  it('tells the customer the cook may come up to 10 minutes late', () => {
    renderScreen({ cookArrival: 'late' });
    expect(screen.getByText('Your cook might arrive up to 10 minutes late')).toBeTruthy();
    expect(
      screen.getByText(
        'Thanks for accommodating, your assigned cook would just wrapping up a nearby job :)',
      ),
    ).toBeTruthy();
  });

  it('says nothing when the cook is due at the booked time', () => {
    renderScreen({ cookArrival: null });
    expect(screen.queryByTestId('service-visit-arrival-note')).toBeNull();
  });

  it('gives way to the reassigned note, which is the bigger news', () => {
    renderScreen({ cookArrival: 'late', reassigned: true });
    expect(screen.getByTestId('service-visit-reassigned')).toBeTruthy();
    expect(screen.queryByTestId('service-visit-arrival-note')).toBeNull();
  });

  it.each<ServicePhase>(['onTheWay', 'arrived', 'cooking', 'completed'])(
    'is gone once the visit moves on (%s)',
    (phase) => {
      renderScreen({ phase, cookArrival: 'early' });
      expect(screen.queryByTestId('service-visit-arrival-note')).toBeNull();
    },
  );

  it('reads the field from the API, and an older API without it as on time', () => {
    const shape = bookingDetailSchema.shape.cookArrival;
    expect(shape.parse('early')).toBe('early');
    expect(shape.parse('late')).toBe('late');
    expect(shape.parse(undefined)).toBeUndefined();
    expect(shape.safeParse('soon').success).toBe(false);
  });
});
