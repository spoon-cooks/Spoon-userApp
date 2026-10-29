import { useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';

import { LoadingState, QueryBoundary } from '@ui';
import { getUserMessage, normalizeError } from '@core/errors';
import { useNavigationGuard, useSafeBack } from '@core/navigation';
import { useAddressGate } from '@features/address';
import {
  TasteProfileWizard,
  discardProfileDraft,
  firstIncompleteStep,
  saveProfileDraft,
  useAutosaveProfileDetails,
  useProfileDetailsData,
  useProfileDraft,
  useSaveProfileDetails,
  WIZARD_STEPS,
} from '@features/profile';
import type { ProfileDetailsData, ProfileDetailsValues, WizardStepId } from '@features/profile';

/**
 * The taste-profile wizard (Figma page `1405:448`), wired to `PUT /v1/me/profile`.
 *
 * ## Two entry contexts, one screen
 *
 * `onboarding` — reached from the boot gate at `/` (and from OTP) while the server reports the
 *   profile incomplete. NON-SKIPPABLE: step 1 draws no Back and Android's back is swallowed there;
 *   later steps go back a step. Save & Continue saves, then opens the address step for a customer
 *   with no address yet, else Home (dev note `2505:4937`).
 *
 * `edit` (anything else) — reached from the Account hub. Opens PREFILLED, Back on step 1 returns
 *   to the hub, and Save & Continue returns there too: editing a preference is not onboarding.
 *
 * The context is an explicit parameter rather than read from `profileComplete` or the stack: both
 * change at exactly the moment it matters (a save makes the profile complete; a deep link has an
 * empty stack).
 *
 * ## The draft (dev note `2505:4916`)
 *
 * During onboarding every change is kept on the device, per customer, and a customer who leaves
 * mid-flow comes back to the step and answers they left. It is removed once the save lands. Each
 * change is also saved to the server once there is a name (R-AREA-23), so on another device the
 * wizard opens with those answers and at the first step still missing one. The
 * edit context keeps none: Back out of an edit is a cancel, and the next edit opens from what is
 * saved.
 *
 * ## Why the save must land before the navigation
 *
 * `onSuccess` is the ONLY path that moves. A first-run customer whose `PUT` failed but who was
 * advanced anyway would reach Home with no profile and no way back to the wizard. So a rejection
 * keeps them on the last step with every answer intact and the reason on screen.
 */

const ONBOARDING = 'onboarding';

export default function ProfileDetailsRoute() {
  const { context } = useLocalSearchParams<{ context?: string }>();
  const onboarding = context === ONBOARDING;
  const { state, refetch } = useProfileDetailsData();

  return (
    <QueryBoundary state={state} onRetry={refetch} loadingVariant="screen">
      {(data) =>
        onboarding ? <OnboardingWizard data={data} /> : <WizardRoute data={data} draft={null} />
      }
    </QueryBoundary>
  );
}

/** Waits for the device draft before the wizard opens, so it never jumps from blank to restored. */
function OnboardingWizard({ data }: { data: ProfileDetailsData }) {
  const draft = useProfileDraft(data.userId);
  if (draft === undefined) return <LoadingState variant="screen" />;
  return <WizardRoute data={data} draft={draft} onboarding />;
}

function WizardRoute({
  data,
  draft,
  onboarding = false,
}: {
  data: ProfileDetailsData;
  draft: ReturnType<typeof useProfileDraft>;
  onboarding?: boolean;
}) {
  const router = useRouter();
  const save = useSaveProfileDetails();
  const autosave = useAutosaveProfileDetails();

  /**
   * Where a first-run save lands. A customer can owe the profile while already having an address
   * (the boot gate opens this whenever the server reports the profile incomplete), and sending them
   * to the first-run map would ask for an address they have. The same gate `/` and Home read.
   */
  const addressGate = useAddressGate();

  // One screen per tap: a quick double tap must not pop the screen twice (`4e0b9e6`).
  const guard = useNavigationGuard();
  // A pop, not `dismissAll` + `replace`, so the edit context closes with the platform's own
  // reverse-of-push animation (`5dfd7c1`). A deep link straight into it still lands on `/profile`.
  const goBack = useSafeBack('/profile');

  // The draft is written a moment after the last change, not on every keystroke of the name.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pending.current !== null) clearTimeout(pending.current);
    },
    [],
  );

  /**
   * A rejected save must ALWAYS produce a visible reason: `normalizeError` lands an unclassified
   * failure in the taxonomy too, so "the button spun and then nothing happened" cannot happen on a
   * screen the customer cannot leave.
   */
  const error = save.error === null ? undefined : getUserMessage(normalizeError(save.error));

  const initialValues = draft?.values ?? data.values;
  // Resume where the customer left, but never past a step whose required answer is missing. With
  // no device draft, answers already saved to the server (R-AREA-23) resume at the first gap.
  const initialStep =
    draft === null || draft === undefined
      ? onboarding
        ? firstIncompleteStep(data.values)
        : 'family'
      : resumeStep(draft.step, draft.values);

  return (
    <TasteProfileWizard
      initialValues={initialValues}
      initialStep={initialStep}
      onExit={onboarding ? undefined : guard(goBack)}
      onChange={
        onboarding
          ? (step, values) => {
              if (pending.current !== null) clearTimeout(pending.current);
              pending.current = setTimeout(() => {
                saveProfileDraft(data.userId, { step, values });
                autosave(values);
              }, 400);
            }
          : undefined
      }
      submitting={save.isPending}
      {...(error === undefined ? {} : { errorMessage: error })}
      onSubmit={(values) => {
        save.save(values, {
          onSuccess() {
            if (pending.current !== null) clearTimeout(pending.current);
            discardProfileDraft(data.userId);
            if (onboarding) {
              // `replace`, so back cannot return to a wizard already answered and saved.
              // `onboarding=1` is what makes the address step draw no back control and end at Home.
              router.replace(
                (addressGate === 'required' ? '/address/location?onboarding=1' : '/home') as Href,
              );
              return;
            }
            // The hub re-reads `/me`, which the save has already updated.
            goBack();
          },
        });
      }}
    />
  );
}

function resumeStep(saved: WizardStepId, values: ProfileDetailsValues): WizardStepId {
  const order = WIZARD_STEPS.map((step) => step.id);
  const blocked = firstIncompleteStep(values);
  return order.indexOf(saved) <= order.indexOf(blocked) ? saved : blocked;
}
