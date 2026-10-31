import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import * as Haptics from 'expo-haptics';

import { isAppError } from '@core/errors';
import { useAndroidBackHandler, useNavigationGuard, useSafeBack } from '@core/navigation';
import { usePrefetchAddresses } from '@features/address';
import {
  displayPhone,
  LoginOtpScreen,
  loginVerifyFailure,
  requestPhoneEdit,
  resendCountdownLabel,
  usePrefetchMe,
  useSendOtp,
  useVerifyOtp,
} from '@features/auth';
import type { ResendState } from '@features/auth';
import { DEMO_LOGIN, DEMO_LOGIN_OTP } from '@/demo/fixtures/screens';

/**
 * Login OTP — Figma page "Login" (`1934:1080` / `1934:1358` / `1934:1648`), wired to
 * `POST /v1/auth/otp/verify` and, for resend, `POST /v1/auth/otp/send` again.
 *
 * The resend clock: dev note 2a says to "store the time when resend becomes available instead of
 * counting ticks, so the timer stays correct if the app goes to background". The interval is the
 * SERVER's `retryAfterSeconds`; the server still decides whether a resend is accepted (429 if not).
 *
 * Back and Edit both return to Login "with the number prefilled and the keyboard open", and are
 * blocked — swipe-back and Android back included — while a verify call is running.
 */
/** How long the OTP spinner waits for the boot gate's reads before handing over anyway. */
const BOOT_PREFETCH_CAP_MS = 6_000;

export default function OtpRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string; retryAfter?: string; devOtp?: string }>();
  const phone = params.phone ?? '';
  const verify = useVerifyOtp();
  const resend = useSendOtp();
  const prefetchMe = usePrefetchMe();
  const prefetchAddresses = usePrefetchAddresses();
  /**
   * Signed in, and fetching what the boot gate at `/` asks before it can redirect. The cells stay
   * locked with the spinner under them until then, so the next screen is Home (or the address
   * step) straight away instead of the launch splash.
   */
  const [finishing, setFinishing] = useState(false);
  const busy = verify.isPending || finishing;

  const [resendAt, setResendAt] = useState(
    () => Date.now() + (Number(params.retryAfter ?? 0) || 0) * 1000,
  );
  const [now, setNow] = useState(() => Date.now());
  const [limited, setLimited] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);
  const toast = useCallback(
    (message: string) => setNotice((prev) => ({ id: (prev?.id ?? 0) + 1, message })),
    [],
  );

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const goBack = useSafeBack('/login');
  // One pop per tap: a quick double tap on "edit number" must not pop Login too.
  const guard = useNavigationGuard();
  const back = useCallback(() => {
    if (busy) return;
    requestPhoneEdit();
    goBack();
  }, [goBack, busy]);
  useAndroidBackHandler(() => {
    if (busy) return true;
    back();
    return true;
  });

  // A failure that belongs in the cells' error slot. Toast-only failures are raised in `onError`.
  const failure = isAppError(verify.error) ? loginVerifyFailure(verify.error) : null;

  const phoneLabel = displayPhone(phone, DEMO_LOGIN.dialCode);

  const resendState: ResendState = limited
    ? { kind: 'limited', message: 'Too many attempts. Please try again in a few minutes.' }
    : secondsLeft > 0
      ? { kind: 'countdown', label: resendCountdownLabel(secondsLeft) }
      : { kind: 'available', sending: resend.isPending };

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !busy }} />
      <LoginOtpScreen
        otp={DEMO_LOGIN_OTP}
        phoneLabel={phoneLabel}
        verifying={busy}
        {...(failure?.kind === 'rejected' ? { errorMessage: failure.message } : {})}
        resend={resendState}
        notice={notice}
        resetKey={resetKey}
        onChangeCode={() => {
          if (verify.error !== null) verify.reset();
        }}
        onVerify={(code) => {
          // A code verifies once: a second submit while the first is out would race it.
          if (phone.length === 0 || busy) return;
          verify.mutate(
            { phone, otp: code },
            {
              onSuccess(result) {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                /*
                 * `onboardingRequired` is the SERVER's answer to "does this account still owe the
                 * profile page". A new customer goes straight there; everyone else falls through
                 * to the boot gate at `/`, which owns the address-versus-Home question — with its
                 * two reads already cached, so it redirects without showing the splash.
                 *
                 * Replacing rather than pushing, so Back cannot return to a spent OTP screen.
                 */
                // `profileUpdateRequired`: a profile that predates the current steps is asked again
                // (owner, 31 Oct 2026), straight from sign-in like a new customer's.
                if (result.user.onboardingRequired || result.user.profileUpdateRequired === true) {
                  router.replace('/profile/details?context=onboarding' as Href);
                  return;
                }
                // Capped: a slow read hands over to the gate, which holds the splash as before.
                setFinishing(true);
                void Promise.race([
                  Promise.all([prefetchMe(), prefetchAddresses()]),
                  new Promise((resolve) => setTimeout(resolve, BOOT_PREFETCH_CAP_MS)),
                ]).then(() => router.replace('/' as Href));
              },
              onError(error) {
                // "Network error: toast 'No connection. Try again.', boxes unlock, digits are kept."
                if (!isAppError(error)) return;
                const outcome = loginVerifyFailure(error);
                if (outcome.kind === 'toast') toast(outcome.message);
              },
            },
          );
        }}
        onResend={() => {
          if (phone.length === 0 || resend.isPending) return;
          resend.mutate(phone, {
            onSuccess(result) {
              verify.reset();
              setResendAt(Date.now() + result.retryAfterSeconds * 1000);
              setNow(Date.now());
              setResetKey((key) => key + 1);
              toast(`New code sent to ${phoneLabel}`);
            },
            onError(error) {
              if (isAppError(error) && error.code === 'RATE_LIMITED') setLimited(true);
              else toast('Couldn’t resend. Try again.');
            },
          });
        }}
        onBack={guard(back)}
      />
    </>
  );
}
