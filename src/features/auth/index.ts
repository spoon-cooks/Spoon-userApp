/**
 * Feature: auth.
 *
 * Screens (NEW Figma `1kd1u3WEc00SENkToIPloW`):
 *   `53:174`  Page 17a Login No. — hero, logo lockup, tagline, pill phone field, legal footer
 *   `227:1649` Page 17b Login OTP — six-box code entry, resend line, "Verify & Proceed"
 *
 * The OTP screen's previous DESIGN_PENDING / B-7 status is OBSOLETE: it is now fully designed.
 * Ruling R-6 (V9): T&C / Privacy live on the Account screen (`@features/account`), reached from
 * Profile's "Manage account" row; no additional legal UI is to be added to Login.
 *
 * Headless session machinery (the machine, the token store, the controller) lives in
 * `@core/auth` because it is cross-cutting. This module owns the auth SCREENS, the auth
 * ENDPOINTS and the adapter between them.
 *
 * `createSessionGateway` is exported from here rather than from `@core/auth` because it is the
 * only piece of session machinery that knows a URL: `POST /v1/auth/refresh`. Keeping the endpoint
 * with the other endpoints means there is exactly one description of the auth contract in the
 * codebase, and the composition root wires the two halves together.
 */

export { LoginScreen } from './screens/LoginScreen';
export type { LoginScreenProps } from './screens/LoginScreen';
export { LoginOtpScreen } from './screens/LoginOtpScreen';
export type { LoginOtpScreenProps, ResendState } from './screens/LoginOtpScreen';
export { displayPhone } from './login/phone';
export { consumePhoneEdit, requestPhoneEdit } from './login/editRequest';
export { OtpScreen } from './screens/OtpScreen';
export type { OtpNotice, OtpScreenProps } from './screens/OtpScreen';
export type { LoginOtpViewModel, LoginViewModel, OtpViewModel } from './types';
export { isGuestModeAvailable } from './guestMode';

export {
  AUTH_PATHS,
  authKeys,
  createAuthApi,
  createSessionGateway,
  loginSendErrorMessage,
  loginVerifyFailure,
  loginWithError,
  meResponseSchema,
  otpViewModel,
  otpWithError,
  resendCountdownLabel,
  resendLabelFor,
  profileDataSchema,
  sentToLabelFor,
  toE164,
  updateProfileResponseSchema,
  useContinueAsGuest,
  useMe,
  usePrefetchMe,
  useSendOtp,
  useSignOut,
  useUpdateProfile,
  useVerifyOtp,
} from './api';
export { useCrashIdentity } from './useCrashIdentity';
export {
  ADDRESS_STEPS_VERSION,
  PROFILE_STEPS_VERSION,
  useStepVersionsSupported,
} from './stepVersions';
export type {
  LoginVerifyFailure,
  AuthApi,
  AuthUser,
  MeResponse,
  OtpSendResponse,
  OtpVerifyResponse,
  ProfileData,
  ProfileUpdateRequest,
  SendOtpOptions,
} from './api';
