import { useRouter } from 'expo-router';

import { useNavigationGuard, useSafeBack } from '@core/navigation';
import { RecurringLandingScreen, useExplainerVideoSource } from '@features/recurringLanding';
import { useRecurringEligibility } from '@features/recurringSetup';

/**
 * Recurring — the landing. The Cook Pool button opens the Cook Pool landing; it reads "Check your
 * Cook Pool" once eligibility reports at least one cook in the pool (`poolCount > 0`, the same
 * line the Account hub's Cook Pool card draws), "Make your Cook Pool" otherwise or while loading. Both "schedule"
 * buttons open the plan flow's day picker once Recurring is unlocked (DEC-086: 2 pool Cooks);
 * until then they open the Cook Pool too — the spec's locked action — rather than a flow whose
 * every read would refuse the household. While eligibility has not answered, the flow opens as
 * before and its own reads decide. Back returns to whatever opened it (`/home` when nothing did,
 * as on a deep link).
 *
 * The explainer video's URL is set in one place, `@features/recurringLanding`'s `video.ts`.
 *
 * Opened on every Recurring booking, first or not (owner, 31 Oct 2026): Home's "Check Recurring"
 * and "Book Recurring" chips and a visit's "Book again" all land here, never on the plan flow.
 */
export default function RecurringRoute() {
  const router = useRouter();
  // One screen per tap: a quick double tap must not open (or pop) a screen twice.
  const guard = useNavigationGuard();
  const goBack = useSafeBack('/home');
  const videoSource = useExplainerVideoSource();
  const eligibility = useRecurringEligibility();
  const locked = eligibility.state.status === 'ready' && !eligibility.state.data.unlocked;
  const hasCookPool = eligibility.state.status === 'ready' && eligibility.state.data.poolCount > 0;

  return (
    <RecurringLandingScreen
      onBack={guard(goBack)}
      onSchedule={guard(() => router.push(locked ? '/cook-pool' : '/recurring-setup/days'))}
      onMakeCookPool={guard(() => router.push('/cook-pool'))}
      hasCookPool={hasCookPool}
      {...(videoSource === undefined ? {} : { videoSource })}
    />
  );
}
