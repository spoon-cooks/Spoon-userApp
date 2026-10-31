import { useRouter } from 'expo-router';

import { useNavigationGuard, useSafeBack } from '@core/navigation';
import { RecurringLandingScreen, useExplainerVideo } from '@features/recurringLanding';
import type { RecurringCta } from '@features/recurringLanding';
import { useRecurringEligibility } from '@features/recurringSetup';

/**
 * Recurring — the landing. The Cook Pool button opens the Cook Pool landing; it reads "Check your
 * Cook Pool" once eligibility reports at least one cook in the pool (`poolCount > 0`, the same
 * line the Account hub's Cook Pool card draws), "Make your Cook Pool" otherwise or while loading. Both "schedule"
 * buttons follow eligibility's `chip`, as Home's chip does: "Book Recurring" opens the plan flow's
 * day picker once Recurring is unlocked (DEC-086: 2 pool Cooks); below the unlock both stay
 * "Book Recurring" but disabled (the page's design notes); with a live Recurring booking both read
 * "Recurring · Live" and open it — the active one first, as Home's Live chip. While eligibility
 * has not answered, the flow opens as before and its own reads decide. Back returns to whatever opened it (`/home` when nothing did,
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
  // Set from Firebase Remote Config; with none set the explainer block is left out.
  const explainer = useExplainerVideo();
  const eligibility = useRecurringEligibility();
  const ready = eligibility.state.status === 'ready' ? eligibility.state.data : null;
  const liveBookings = ready?.liveBookings ?? [];
  const live = liveBookings.find((booking) => booking.status === 'active') ?? liveBookings[0];
  const cta: RecurringCta =
    ready === null
      ? 'book'
      : ready.chip === 'live' && live !== undefined
        ? 'live'
        : ready.chip === 'locked' || !ready.unlocked
          ? 'locked'
          : 'book';
  const hasCookPool = eligibility.state.status === 'ready' && eligibility.state.data.poolCount > 0;

  return (
    <RecurringLandingScreen
      onBack={guard(goBack)}
      cta={cta}
      onSchedule={guard(() => router.push('/recurring-setup/days'))}
      {...(live === undefined
        ? {}
        : {
            onOpenLive: guard(() =>
              router.push({
                pathname: '/recurring/[bookingId]',
                params: { bookingId: live.recurringBookingId },
              }),
            ),
          })}
      onMakeCookPool={guard(() => router.push('/cook-pool'))}
      hasCookPool={hasCookPool}
      {...(explainer === null ? {} : { explainer })}
    />
  );
}
