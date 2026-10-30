import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { CheckoutCancelledError, CheckoutFailedError } from '@features/payment';

import { useServicePaymentScreens } from './ServicePaymentScreens';

/**
 * The payment screens for an extension or a tip (`2702:855`, `2718:916`), over the visit.
 *
 * `start` stands in for the mutation: it gets `onVerifying` and settles however the test needs.
 */
function Harness({
  start,
  onSettled,
}: {
  start: (onVerifying: () => void) => Promise<string>;
  onSettled: (outcome: string) => void;
}) {
  const payment = useServicePaymentScreens();
  return (
    <>
      <Pressable
        testID="pay"
        onPress={() => {
          payment.run(start).then(
            (value) => onSettled(`resolved:${value}`),
            (error: unknown) => onSettled(`rejected:${(error as Error).name}`),
          );
        }}
      >
        <Text>Pay</Text>
      </Pressable>
      {payment.layer}
    </>
  );
}

function deferred() {
  let resolve: (value: string) => void = () => undefined;
  const promise = new Promise<string>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Payment screens for an extension or a tip', () => {
  it('shows "Confirming your payment" only while the backend verifies, then gets out of the way', async () => {
    const verify = deferred();
    const onSettled = jest.fn();
    let verifying: () => void = () => undefined;
    render(
      <Harness
        start={(onVerifying) => {
          verifying = onVerifying;
          return verify.promise;
        }}
        onSettled={onSettled}
      />,
    );

    fireEvent.press(screen.getByTestId('pay'));
    // Checkout is still open: nothing drawn over the visit yet.
    expect(screen.queryByText('Confirming your payment')).toBeNull();

    act(() => verifying());
    expect(screen.getByText('Confirming your payment')).toBeTruthy();

    await act(async () => verify.resolve('ok'));
    expect(screen.queryByText('Confirming your payment')).toBeNull();
    expect(onSettled).toHaveBeenCalledWith('resolved:ok');
  });

  it('shows "Payment failed" for a declined payment, and a retry that succeeds settles the first', async () => {
    const onSettled = jest.fn();
    let attempts = 0;
    render(
      <Harness
        start={() => {
          attempts += 1;
          return attempts === 1
            ? Promise.reject(new CheckoutFailedError(2, 'Payment declined'))
            : Promise.resolve('paid');
        }}
        onSettled={onSettled}
      />,
    );

    fireEvent.press(screen.getByTestId('pay'));
    await waitFor(() => expect(screen.getByText('Payment failed')).toBeTruthy());
    // The visit's own promise waits on the retry.
    expect(onSettled).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('payment-failed-change-method'));
    await waitFor(() => expect(onSettled).toHaveBeenCalledWith('resolved:paid'));
    expect(attempts).toBe(2);
    expect(screen.queryByText('Payment failed')).toBeNull();
  });

  it('leaves "Payment failed" when checkout is closed during a retry', async () => {
    const onSettled = jest.fn();
    let attempts = 0;
    render(
      <Harness
        start={() => {
          attempts += 1;
          return Promise.reject(
            attempts === 1 ? new CheckoutFailedError(2, null) : new CheckoutCancelledError(),
          );
        }}
        onSettled={onSettled}
      />,
    );

    fireEvent.press(screen.getByTestId('pay'));
    await waitFor(() => expect(screen.getByText('Payment failed')).toBeTruthy());
    fireEvent.press(screen.getByTestId('payment-failed-retry'));

    await waitFor(() => expect(onSettled).toHaveBeenCalledWith('rejected:CheckoutCancelledError'));
    expect(screen.queryByText('Payment failed')).toBeNull();
  });

  it('shows nothing for a closed checkout or a failure before checkout', async () => {
    for (const error of [new CheckoutCancelledError(), new Error('offline')]) {
      const onSettled = jest.fn();
      const view = render(<Harness start={() => Promise.reject(error)} onSettled={onSettled} />);

      fireEvent.press(screen.getByTestId('pay'));
      await waitFor(() => expect(onSettled).toHaveBeenCalled());
      expect(screen.queryByText('Payment failed')).toBeNull();
      expect(screen.queryByText('Confirming your payment')).toBeNull();
      view.unmount();
    }
  });
});
