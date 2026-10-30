import { Keyboard, StyleSheet } from 'react-native';

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import {
  DEMO_LOGIN,
  DEMO_LOGIN_ERROR,
  DEMO_LOGIN_OTP,
  DEMO_OTP,
  DEMO_OTP_ERROR,
  DEMO_OTP_RESEND_READY,
} from '@/demo/fixtures/screens';

import { LoginOtpScreen } from './LoginOtpScreen';
import type { ResendState } from './LoginOtpScreen';
import { LoginScreen } from './LoginScreen';
import { OtpScreen } from './OtpScreen';

/**
 * Auth screens. Login and its OTP screen follow the redesign (`cCQlzTeiObQkpVBzwI8mZi`, page
 * "Login"); `OtpScreen` below is the previous design, still used by account deletion.
 *
 * These cover the two contracts the finalized frames changed, both of which are easy to regress:
 * the OTP screen has NO submit control, and the last digit is therefore the submit gesture.
 */

describe('LoginScreen — 1923:1139 (dev notes 1949:2203 / 1949:2258)', () => {
  const noop = () => undefined;
  const phone = () => screen.getByTestId('login-screen-phone');
  const ctaDisabled = () =>
    screen.getByTestId('login-screen-cta').props.accessibilityState.disabled as boolean;

  it('draws Skip only when the host offers guest mode, and raises it on press', () => {
    const { rerender } = render(<LoginScreen login={DEMO_LOGIN} onRequestOtp={noop} />);
    expect(screen.queryByTestId('login-screen-skip')).toBeNull();

    const onSkip = jest.fn();
    rerender(<LoginScreen login={DEMO_LOGIN} onRequestOtp={noop} onSkip={onSkip} />);
    fireEvent.press(screen.getByTestId('login-screen-skip'));

    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('enables Get OTP only for a 10-digit number starting 6–9, and raises the digits', () => {
    const requested: string[] = [];
    render(<LoginScreen login={DEMO_LOGIN} onRequestOtp={(digits) => requested.push(digits)} />);
    expect(ctaDisabled()).toBe(true);

    fireEvent.changeText(phone(), '987654321');
    expect(ctaDisabled()).toBe(true);
    fireEvent.changeText(phone(), '5876543210');
    expect(ctaDisabled()).toBe(true);

    fireEvent.changeText(phone(), '9876543210');
    expect(ctaDisabled()).toBe(false);
    fireEvent.press(screen.getByTestId('login-screen-cta'));
    expect(requested).toEqual(['9876543210']);
  });

  it('strips +91, a leading 0, spaces and dashes from a paste, keeping the last 10 digits', () => {
    render(<LoginScreen login={DEMO_LOGIN} onRequestOtp={noop} />);

    // The field shows a complete number grouped as in `1945:1526`.
    fireEvent.changeText(phone(), '+91 98765-43210');
    expect(phone().props.value).toBe('98765 43210');
    fireEvent.changeText(phone(), '');
    fireEvent.changeText(phone(), '09876543210');
    expect(phone().props.value).toBe('98765 43210');
  });

  it('groups the number as it is typed, from the 6th digit', () => {
    render(<LoginScreen login={DEMO_LOGIN} onRequestOtp={noop} />);

    fireEvent.changeText(phone(), '98765');
    expect(phone().props.value).toBe('98765');
    fireEvent.changeText(phone(), '987654');
    expect(phone().props.value).toBe('98765 4');
    fireEvent.changeText(phone(), '98765 43');
    expect(phone().props.value).toBe('98765 43');
  });

  it('ignores typing past 10 digits, and backspace over the space deletes the digit before it', () => {
    render(<LoginScreen login={DEMO_LOGIN} onRequestOtp={noop} />);

    fireEvent.changeText(phone(), '9876543210');
    fireEvent.changeText(phone(), '98765 432101');
    expect(phone().props.value).toBe('98765 43210');

    // The space removed: digits unchanged, so the 5th digit goes.
    fireEvent.changeText(phone(), '9876543210');
    expect(phone().props.value).toBe('98764 3210');
  });

  it('shows the invalid-number message when the disabled Get OTP is tapped', () => {
    const requested: string[] = [];
    render(<LoginScreen login={DEMO_LOGIN} onRequestOtp={(d) => requested.push(d)} />);

    fireEvent.changeText(phone(), '98');
    fireEvent.press(screen.getByTestId('login-screen-cta'));
    expect(screen.getByText(DEMO_LOGIN.invalidPhoneMessage)).toBeTruthy();
    expect(requested).toEqual([]);
  });

  it('shows the invalid-number message only after leaving the field, and clears it on edit', () => {
    render(<LoginScreen login={DEMO_LOGIN} onRequestOtp={noop} />);

    fireEvent.changeText(phone(), '2345687');
    expect(phone().props.value).toBe('23456 87');
    expect(screen.queryByText(DEMO_LOGIN.invalidPhoneMessage)).toBeNull();

    fireEvent(phone(), 'blur');
    expect(screen.getByText(DEMO_LOGIN.invalidPhoneMessage)).toBeTruthy();

    fireEvent.changeText(phone(), '23456878');
    expect(screen.queryByText(DEMO_LOGIN.invalidPhoneMessage)).toBeNull();
  });

  it('locks Get OTP behind a spinner while sending', () => {
    render(<LoginScreen login={{ ...DEMO_LOGIN, submitting: true }} onRequestOtp={noop} />);
    fireEvent.changeText(phone(), '9876543210');

    expect(screen.getByTestId('login-screen-sending')).toBeTruthy();
    expect(ctaDisabled()).toBe(true);
  });

  it('shows a send failure in the same slot under the field', () => {
    render(<LoginScreen login={DEMO_LOGIN_ERROR} onRequestOtp={noop} />);
    expect(screen.getByText(DEMO_LOGIN_ERROR.errorMessage!)).toBeTruthy();
  });

  it('prefills the remembered number once, never over one already typed', () => {
    const { rerender } = render(<LoginScreen login={DEMO_LOGIN} onRequestOtp={noop} />);
    fireEvent.changeText(phone(), '81112223');
    rerender(<LoginScreen login={DEMO_LOGIN} onRequestOtp={noop} initialPhone="+919876543210" />);
    expect(phone().props.value).toBe('81112 223');
  });

  it('prefills the field from initialPhone, dropping the country code', () => {
    render(<LoginScreen login={DEMO_LOGIN} onRequestOtp={noop} initialPhone="+919876543210" />);
    expect(phone().props.value).toBe('98765 43210');
  });

  it('fades the badges out while the keyboard is open, and back when it closes', () => {
    const handlers: Record<string, (event: unknown) => void> = {};
    jest
      .spyOn(Keyboard, 'addListener')
      .mockImplementation((event: string, handler: (payload: never) => void) => {
        handlers[event] = handler as (payload: unknown) => void;
        return { remove: jest.fn() } as never;
      });

    render(<LoginScreen login={DEMO_LOGIN} onRequestOtp={noop} />);
    fireEvent(screen.getByTestId('login-screen-hero'), 'layout', {
      nativeEvent: { layout: { width: 402, height: 440 } },
    });
    expect(screen.getByTestId('login-badge-verified')).toBeTruthy();

    const show = handlers['keyboardWillShow'] ?? handlers['keyboardDidShow'];
    act(() => show?.({ endCoordinates: { height: 291 }, duration: 250 }));
    // The logo drops to 60 % with the keyboard up.
    expect(StyleSheet.flatten(screen.getByLabelText('Spoon').props.style)).toMatchObject({
      width: 138 * 0.6,
    });

    const hide = handlers['keyboardWillHide'] ?? handlers['keyboardDidHide'];
    act(() => hide?.({ endCoordinates: { height: 0 }, duration: 250 }));
    expect(StyleSheet.flatten(screen.getByLabelText('Spoon').props.style)).toMatchObject({
      width: 138,
    });

    jest.restoreAllMocks();
  });
});

describe('LoginOtpScreen — 1934:1080 / 1934:1358 / 1934:1648', () => {
  const noop = () => undefined;
  const base = {
    otp: DEMO_LOGIN_OTP,
    phoneLabel: '+91 98765 43210',
    verifying: false,
    resend: { kind: 'countdown', label: 'Resend in 0:25' } as ResendState,
    onVerify: noop,
    onResend: noop,
    onBack: noop,
  };
  const input = () => screen.getByTestId('login-otp-screen-input');

  it('submits on the 6th digit, with no Verify button', () => {
    const onVerify = jest.fn();
    render(<LoginOtpScreen {...base} onVerify={onVerify} />);

    fireEvent.changeText(input(), '48271');
    expect(onVerify).not.toHaveBeenCalled();
    fireEvent.changeText(input(), '482719');
    expect(onVerify).toHaveBeenCalledWith('482719');
    expect(screen.queryByText('Verify & Proceed')).toBeNull();
  });

  it('fills all six cells from a paste or the SMS suggestion', () => {
    const onVerify = jest.fn();
    render(<LoginOtpScreen {...base} onVerify={onVerify} />);

    fireEvent.changeText(input(), '4 8 2-7 1 9');
    expect(input().props.value).toBe('482719');
    expect(onVerify).toHaveBeenCalledWith('482719');
  });

  it('never sends the same rejected code twice — an edit is needed first', () => {
    const onVerify = jest.fn();
    const { rerender } = render(<LoginOtpScreen {...base} onVerify={onVerify} />);
    fireEvent.changeText(input(), '482719');
    rerender(
      <LoginOtpScreen
        {...base}
        onVerify={onVerify}
        errorMessage="That code didn’t match. Please try again."
      />,
    );
    expect(screen.getByText('That code didn’t match. Please try again.')).toBeTruthy();

    // Deleting and retyping the same last digit is the same wrong code: not sent again.
    fireEvent.changeText(input(), '48271');
    rerender(<LoginOtpScreen {...base} onVerify={onVerify} />);
    fireEvent.changeText(input(), '482719');
    expect(onVerify).toHaveBeenCalledTimes(1);

    fireEvent.changeText(input(), '48271');
    fireEvent.changeText(input(), '482718');
    expect(onVerify).toHaveBeenCalledTimes(2);
    expect(onVerify).toHaveBeenLastCalledWith('482718');
  });

  it('shows the countdown pill until resend is offered, then Resend via SMS', () => {
    const onResend = jest.fn();
    const { rerender } = render(<LoginOtpScreen {...base} onResend={onResend} />);
    expect(screen.getByText('Resend in 0:25')).toBeTruthy();
    expect(screen.queryByTestId('login-otp-screen-resend')).toBeNull();

    rerender(<LoginOtpScreen {...base} onResend={onResend} resend={{ kind: 'available' }} />);
    fireEvent.press(screen.getByTestId('login-otp-screen-resend'));
    expect(onResend).toHaveBeenCalledTimes(1);
  });

  it('replaces the pill with plain text once the resend limit is hit', () => {
    render(
      <LoginOtpScreen
        {...base}
        resend={{
          kind: 'limited',
          message: 'Too many attempts. Please try again in a few minutes.',
        }}
      />,
    );
    expect(screen.getByTestId('login-otp-screen-limited')).toBeTruthy();
    expect(screen.queryByTestId('login-otp-screen-timer')).toBeNull();
  });

  it('always draws Verify & continue: disabled until 6 digits, auto-submits, never resends a rejected code', () => {
    const onVerify = jest.fn();
    const { rerender } = render(<LoginOtpScreen {...base} onVerify={onVerify} />);
    const verifyDisabled = () =>
      screen.getByTestId('login-otp-screen-verify').props.accessibilityState.disabled as boolean;
    // Shown with the keyboard down too (owner, 2026-10-30).
    expect(verifyDisabled()).toBe(true);

    // The 6th digit submits on its own: no tap needed.
    fireEvent.changeText(input(), '482719');
    expect(onVerify).toHaveBeenCalledTimes(1);
    rerender(
      <LoginOtpScreen {...base} onVerify={onVerify} errorMessage="That code didn’t match." />,
    );
    expect(verifyDisabled()).toBe(false);
    fireEvent.press(screen.getByTestId('login-otp-screen-verify'));
    expect(onVerify).toHaveBeenCalledTimes(1);
  });

  it('keeps the input editable (keyboard up) but ignores keys while verifying', () => {
    const onVerify = jest.fn();
    const { rerender } = render(<LoginOtpScreen {...base} onVerify={onVerify} />);
    fireEvent.changeText(input(), '482719');
    rerender(<LoginOtpScreen {...base} onVerify={onVerify} verifying />);

    expect(input().props.editable).not.toBe(false);
    fireEvent.changeText(input(), '48271');
    expect(input().props.value).toBe('482719');
  });

  it('clears the cells after a resend', () => {
    const { rerender } = render(<LoginOtpScreen {...base} />);
    fireEvent.changeText(input(), '4827');
    rerender(<LoginOtpScreen {...base} resetKey={1} />);
    expect(input().props.value).toBe('');
  });

  it('Back and Edit both return to the number, and are blocked while verifying', () => {
    const onBack = jest.fn();
    const { rerender } = render(<LoginOtpScreen {...base} onBack={onBack} />);
    fireEvent.press(screen.getByTestId('login-otp-screen-back'));
    fireEvent.press(screen.getByTestId('login-otp-screen-edit'));
    expect(onBack).toHaveBeenCalledTimes(2);

    rerender(<LoginOtpScreen {...base} onBack={onBack} verifying />);
    expect(screen.getByTestId('login-otp-screen-verifying')).toBeTruthy();
    fireEvent.press(screen.getByTestId('login-otp-screen-back'));
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});

describe('OtpScreen — 275:4289 / 250:2439 / 275:4349', () => {
  const noop = () => undefined;

  const renderOtp = (otp = DEMO_OTP, onVerify: (code: string) => void = noop) =>
    render(<OtpScreen otp={otp} onVerify={onVerify} onResend={noop} onEditNumber={noop} />);

  it('draws no submit CTA — the finalized frames have none', () => {
    renderOtp();
    expect(screen.queryByTestId('otp-screen-cta')).toBeNull();
  });

  it('raises onVerify exactly once, when the last digit lands', () => {
    const verified: string[] = [];
    renderOtp(DEMO_OTP, (code) => verified.push(code));

    const input = screen.getByTestId('otp-screen-input');

    fireEvent.changeText(input, '333');
    expect(verified).toEqual([]);

    fireEvent.changeText(input, '333333');
    expect(verified).toEqual(['333333']);
  });

  /**
   * The platform offers an SMS code only above a keyboard that is already showing, and only for
   * an input marked as a one-time code. Losing any of these three silently brings back "read the
   * SMS, remember it, type it".
   */
  it('opens focused and marked as an SMS one-time code', () => {
    renderOtp();

    const input = screen.getByTestId('otp-screen-input');
    expect(input.props.autoFocus).toBe(true);
    expect(input.props.textContentType).toBe('oneTimeCode');
    expect(input.props.autoComplete).toBe('sms-otp');
  });

  it('submits a code that arrives in one piece, as an SMS suggestion delivers it', () => {
    const verified: string[] = [];
    renderOtp(DEMO_OTP, (code) => verified.push(code));

    // Some keyboards insert the code with a space in the middle ("123 456").
    fireEvent.changeText(screen.getByTestId('otp-screen-input'), '123 456');
    expect(verified).toEqual(['123456']);
  });

  it('never submits more digits than the payload asks for', () => {
    const verified: string[] = [];
    renderOtp(DEMO_OTP, (code) => verified.push(code));

    fireEvent.changeText(screen.getByTestId('otp-screen-input'), '3333339999');
    expect(verified).toEqual(['333333']);
  });

  it('renders the error message inside the digits panel (275:4467)', () => {
    renderOtp(DEMO_OTP_ERROR);

    expect(screen.getByTestId('otp-screen-error')).toBeTruthy();
    expect(screen.getByText('Incorrect OTP. Please try again')).toBeTruthy();

    // `275:4449` — every box swaps to the red tint in this state.
    expect(screen.getAllByTestId(/^otp-screen-digit-\d+$/)).toHaveLength(6);
  });

  /**
   * A device-only defect, guarded here because nothing else can guard it.
   *
   * The tagline is one `Text` of TWO runs: the lead, then "minutes" in `#FFD600`. With
   * `alignItems: 'center'` on its container the line shrink-wrapped, Android measured the pair
   * short, framed the view from the first run and never painted the accent. Nothing in JS could
   * see it — the string was in the layout AND in the accessibility tree, so `getByText('minutes')`
   * passed while the screen showed "Trained cooks in".
   *
   * So this asserts the SHAPE that avoids the mis-measure rather than the paint: the lines fill
   * the 268pt block and centre via `textAlign`. Re-adding `alignItems` here brings the bug back.
   */
  it('lets the tagline lines fill their block instead of shrink-wrapping (275:4305)', () => {
    renderOtp(DEMO_OTP);

    const tagline = screen.getByTestId('otp-screen-tagline');
    const style = StyleSheet.flatten(tagline.props.style) as {
      alignItems?: string;
      width?: number;
    };

    expect(style.width).toBe(268);
    expect(style.alignItems).toBeUndefined();
  });

  it('renders both runs of the tagline, lead and accent', () => {
    renderOtp(DEMO_OTP);

    expect(screen.getByText('minutes')).toBeTruthy();
    expect(screen.getByText(/Trained cooks in/)).toBeTruthy();
  });

  it('offers resend only when the payload says so', () => {
    renderOtp(DEMO_OTP);
    expect(screen.getByTestId('otp-screen-resend').props.accessibilityState.disabled).toBe(true);

    screen.unmount();

    renderOtp(DEMO_OTP_RESEND_READY);
    expect(screen.getByTestId('otp-screen-resend').props.accessibilityState.disabled).toBe(false);
  });
});
