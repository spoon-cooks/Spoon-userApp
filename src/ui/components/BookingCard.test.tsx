import { fireEvent, render, screen } from '@testing-library/react-native';

import { DEMO_BOOKING_COMPLETED, DEMO_REFUND_PROCESSING } from '@/demo/fixtures/bookings';
import { BookingCard } from './BookingCard';

describe('BookingCard — history variant', () => {
  it('renders headline, cook, the slot subtitle, amount, rating and status', () => {
    render(<BookingCard booking={DEMO_BOOKING_COMPLETED} />);

    expect(screen.getByText('12th April • 1 hr')).toBeTruthy();
    expect(screen.getByText('Cook Asha')).toBeTruthy();
    expect(screen.getByText('Scheduled • 4:00 PM')).toBeTruthy();
    expect(screen.getByTestId('booking-card-amount')).toBeTruthy();
    expect(screen.getByTestId('booking-card-rating')).toBeTruthy();
    expect(screen.getByTestId('booking-card-status')).toBeTruthy();
  });

  it('is inert without an onPress and becomes a button with one', () => {
    const { unmount } = render(<BookingCard booking={DEMO_BOOKING_COMPLETED} />);
    expect(screen.queryByTestId('booking-card-pressable')).toBeNull();
    unmount();

    const onPress = jest.fn();
    render(<BookingCard booking={DEMO_BOOKING_COMPLETED} onPress={onPress} />);

    fireEvent.press(screen.getByTestId('booking-card-pressable'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('BookingCard — refund variant', () => {
  it('shows the refund line and status but no rating', () => {
    render(<BookingCard booking={DEMO_REFUND_PROCESSING} variant="refund" />);

    expect(screen.getByText('Refund expected by 15th Apr')).toBeTruthy();
    expect(screen.getByTestId('booking-card-status')).toBeTruthy();
    expect(screen.getByTestId('booking-card-amount')).toBeTruthy();
    expect(screen.queryByTestId('booking-card-rating')).toBeNull();
  });
});

describe('BookingCard — optional fields', () => {
  it('renders with only a headline', () => {
    render(<BookingCard booking={{ id: 'b1', headline: '12th April' }} />);

    expect(screen.getByText('12th April')).toBeTruthy();
    expect(screen.queryByTestId('booking-card-status')).toBeNull();
    expect(screen.queryByTestId('booking-card-amount')).toBeNull();
    expect(screen.queryByTestId('booking-card-avatar')).toBeNull();
    expect(screen.queryByTestId('booking-card-rating')).toBeNull();
  });
});

describe('BookingCard — status is presentation only', () => {
  it('renders whatever status label and tone the caller supplies', () => {
    // No backend status enum exists; the card must not know or validate values.
    render(
      <BookingCard
        booking={{
          id: 'b3',
          headline: '12th April',
          statusLabel: 'Cancelled',
          statusTone: 'danger',
        }}
      />,
    );

    expect(screen.getByText('Cancelled')).toBeTruthy();
  });

  it('accepts an unknown-but-valid presentation tone without special-casing', () => {
    render(
      <BookingCard
        booking={{ id: 'b4', headline: '12th April', statusLabel: 'Anything', statusTone: 'info' }}
      />,
    );

    expect(screen.getByText('Anything')).toBeTruthy();
  });
});
