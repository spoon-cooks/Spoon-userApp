import { fireEvent, render, screen } from '@testing-library/react-native';

import { PaymentFailedBody } from './PaymentFailedBody';

const actions = {
  onRetry: jest.fn(),
  onChangeMethod: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PaymentFailedBody (2718:916)', () => {
  it('says what failed and that nothing was charged', () => {
    render(<PaymentFailedBody retrying={false} {...actions} />);

    expect(screen.getByText('Payment failed')).toBeTruthy();
    expect(
      screen.getByText('We couldn’t process your payment. Don’t worry, you haven’t been charged.'),
    ).toBeTruthy();
  });

  it('retries on Retry Payment', () => {
    render(<PaymentFailedBody retrying={false} {...actions} />);

    fireEvent.press(screen.getByTestId('payment-failed-retry'));
    expect(actions.onRetry).toHaveBeenCalledTimes(1);
    expect(actions.onChangeMethod).not.toHaveBeenCalled();
  });

  it('hands Change payment method to its own callback', () => {
    render(<PaymentFailedBody retrying={false} {...actions} />);

    fireEvent.press(screen.getByTestId('payment-failed-change-method'));
    expect(actions.onChangeMethod).toHaveBeenCalledTimes(1);
  });

  it('takes no second Retry while a checkout is open, and offers no Cancel', () => {
    render(<PaymentFailedBody retrying {...actions} />);

    fireEvent.press(screen.getByTestId('payment-failed-retry'));
    expect(actions.onRetry).not.toHaveBeenCalled();
    expect(screen.queryByTestId('payment-failed-cancel')).toBeNull();
  });
});
