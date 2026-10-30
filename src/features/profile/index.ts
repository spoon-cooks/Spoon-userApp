import { createKeyFactory } from '@core/query';

/**
 * Feature: profile.
 *
 * Screen: `6:663` — identity card plus a 2×2 tile grid (My bookings · Addresses · My refunds ·
 * Help), and a footer carrying **Manage account** (opens `@features/account`) and Log Out (the
 * app's one confirmed destructive treatment: red on pink).
 *
 * Ruling R-1 — there is deliberately NO payment-methods entry: payment opens Razorpay directly.
 * Ruling R-6 (V9, superseded) — T&C / Privacy moved off this screen onto `@features/account`,
 * which also carries Delete Account.
 *
 * Logout must clear all three: SecureStore, the query cache and session status. That is wired in
 * `@core/auth` + `@core/runtime`, not here.
 *
 * V8 adds a SECOND screen to this feature: `338:4508` "Page 17- profile", the profile-details
 * form. It is reached from `6:663`'s completion card (`222:1570` / `456:3467`) in both of that
 * card's states, and from the boot gate on a first run — see `screens/ProfileDetailsScreen.tsx`
 * for the frame and `detailsData.ts` for what of it the backend can actually store.
 *
 * TODO(product B-10): the Help tile has no destination anywhere in the file.
 * BACKEND GAP: `PUT /v1/me/profile` accepts `name` and nothing else, so seven of the eight V8
 * answers cannot be persisted. Documented in `docs/FRONTEND_BACKEND_PENDING.md`.
 */
export const profileKeys = createKeyFactory('profile');

export { useProfileData } from './data';
export { ProfileView } from './screens/ProfileScreen';
export type { ProfileActions, ProfileViewProps } from './screens/ProfileScreen';

export { TasteProfileWizard } from './wizard/TasteProfileWizard';
export type { TasteProfileWizardProps } from './wizard/TasteProfileWizard';
export { ProfileCompletionCard } from './components/ProfileCompletionCard';
export type { ProfileCompletionCardProps } from './components/ProfileCompletionCard';
export {
  discardProfileDraft,
  parseDraft,
  profileDetailsFromMe,
  profileUpdateFrom,
  saveProfileDraft,
  useProfileDetailsData,
  useProfileDraft,
  useProfileGate,
  useAutosaveProfileDetails,
  useSaveProfileDetails,
} from './detailsData';
export type { ProfileDetailsData, ProfileDraft, ProfileGate } from './detailsData';
export { WIZARD_STEPS, dietLabel, regionLabel } from './fields';
export type { WizardStep, WizardStepId } from './fields';
export {
  EMPTY_PROFILE_DETAILS,
  canContinueStep,
  canSubmitProfileDetails,
  firstIncompleteStep,
} from './validation';
export type { ProfileDetailsValues } from './validation';

export type * from './types';
export { AccountHubScreen } from './v2/AccountHubScreen';
export type { AccountHubModel, AccountHubScreenProps } from './v2/AccountHubScreen';
export { firstNameOf, foodSummaryOf, phoneLabelOf, poolCardStateOf } from './v2/model';
export type { PoolCardState } from './v2/model';
