import { useMemo, useState } from 'react';
import { Stack, useRouter } from 'expo-router';

import { useMe } from '@features/auth';
import {
  AutopayFlowSheet,
  draftFromPlans,
  RecurringAutopayScreen,
  RecurringBookedScreen,
  RecurringPlanFlow,
  RecurringPlanningProvider,
  summaryFromPlans,
  useAutopayIntentEnabled,
  useRecurringEligibility,
  useRecurringPlanningSource,
} from '@features/recurringSetup';
import type {
  AutopaySource,
  MandateVerifyDto,
  RecurringBookingDto,
  RecurringPlanDraft,
} from '@features/recurringSetup';
import { useNavigationGuard, useSafeBack } from '@core/navigation';

/**
 * Recurring setup — the whole flow: pick days and plans → Schedule each plan's visits → Summary
 * → UPI Autopay → confirmation. Reachable at `spoon://recurring-setup/days`. (The file keeps its
 * name: `/recurring-setup` itself is the dev preview's path, `(dev)/recurring-setup.tsx`, and two
 * routes can't share it.)
 *
 * The flow plans against the backend's Recurring reads (DEC-086): the window and day limits, the
 * days a live Recurring booking already has, the durations with their base and effective prices,
 * and start times per visit by time of day (`useRecurringPlanningSource`). Each falls back to the
 * local rules until it has answered.
 *
 * "Book Now" opens UPI Autopay: the Figma sheet over the Summary (`2316:3558` … `2317:4009`,
 * note 2317:13580: "Back closes the sheet and returns to Summary") on any build that can list UPI
 * apps (`useAutopayIntentEnabled`). "Back to home" while the bank confirms goes Home; "View my
 * plan" opens the live booking. The app picked approves by UPI Intent when the server has it on
 * (V0 `RECURRING_UPI_INTENT_ENABLED`), otherwise through Razorpay's Checkout from the sheet.
 *   - A build that cannot list apps keeps the plain Checkout step and its confirmation; back (and
 *     "Change times") returns to the Summary.
 *
 * The "?" on every screen opens the Recurring landing page (`/recurring`, `1302:2617`).
 *
 * Not linked from anywhere in the app yet; `/home` is a placeholder fallback for the same reason:
 * nothing has decided where this flow is entered from, nor where the Recurring tab lives.
 */
type Stage =
  | { readonly kind: 'flow'; readonly plans: readonly RecurringPlanDraft[] | null }
  | { readonly kind: 'autopay'; readonly plans: readonly RecurringPlanDraft[] }
  | {
      readonly kind: 'booked';
      readonly booking: RecurringBookingDto;
      readonly mandate: MandateVerifyDto;
    };

export default function RecurringSetupRoute() {
  const router = useRouter();
  // One screen per tap: a quick double tap must not open (or pop) a screen twice.
  const guard = useNavigationGuard();
  const goBack = useSafeBack('/home');
  const planning = useRecurringPlanningSource();
  const [stage, setStage] = useState<Stage>({ kind: 'flow', plans: null });
  const intent = useAutopayIntentEnabled();
  const eligibility = useRecurringEligibility();
  const me = useMe();
  /** The plans the sheet was opened with, and a fresh sheet per "Book Now". */
  const [sheet, setSheet] = useState<{
    readonly plans: readonly RecurringPlanDraft[];
    readonly open: boolean;
    readonly key: number;
  } | null>(null);
  /** The booking the sheet saved, by draft: reopening it for the same plans reuses it. */
  const [saved, setSaved] = useState<{
    readonly key: string;
    readonly booking: RecurringBookingDto;
  } | null>(null);
  const addressId = planning.addressId;
  const sheetSource = useMemo((): AutopaySource | null => {
    if (sheet === null || addressId === null) return null;
    const draft = draftFromPlans(addressId, sheet.plans);
    return saved?.key === JSON.stringify(draft)
      ? { kind: 'booking', booking: saved.booking, draft }
      : { kind: 'draft', draft };
  }, [sheet, addressId, saved]);

  if (stage.kind === 'booked') {
    return (
      <RecurringBookedScreen
        booking={stage.booking}
        mandate={stage.mandate}
        onDone={guard(() => router.dismissTo('/home'))}
        onViewPlan={guard(() =>
          router.replace({
            pathname: '/recurring/[bookingId]',
            params: { bookingId: stage.booking.recurringBookingId },
          }),
        )}
      />
    );
  }

  if (stage.kind === 'autopay' && planning.addressId !== null) {
    const backToSummary = () => setStage({ kind: 'flow', plans: stage.plans });
    return (
      <RecurringPlanningProvider value={planning}>
        <RecurringAutopayScreen
          addressId={planning.addressId}
          plans={stage.plans}
          onBack={backToSummary}
          onChangeTimes={backToSummary}
          onBooked={(booking, mandate) => setStage({ kind: 'booked', booking, mandate })}
        />
      </RecurringPlanningProvider>
    );
  }

  // Swipe-back is off: a sweep across the calendar from its Monday column would otherwise start
  // the stack's back gesture. Each screen has its own back button.
  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <RecurringPlanningProvider value={planning}>
        <RecurringPlanFlow
          onExit={guard(goBack)}
          onOpenInfo={guard(() => router.push('/recurring'))}
          onComplete={(plans) =>
            intent && addressId !== null
              ? setSheet((previous) => ({ plans, open: true, key: (previous?.key ?? 0) + 1 }))
              : setStage({ kind: 'autopay', plans })
          }
          {...(stage.plans === null
            ? {}
            : {
                seed: {
                  plans: stage.plans,
                  stage: { kind: 'summary', planIndex: 0, visitIndex: 0 },
                },
              })}
        />
      </RecurringPlanningProvider>
      {sheet === null || sheetSource === null ? null : (
        <AutopayFlowSheet
          key={sheet.key}
          visible={sheet.open}
          source={sheetSource}
          summary={summaryFromPlans(
            sheet.plans,
            eligibility.state.status === 'ready' ? eligibility.state.data : null,
          )}
          userId={me.state.status === 'ready' ? me.state.data.id : null}
          onClose={() => setSheet({ ...sheet, open: false })}
          onBookingSaved={(booking) => {
            if (sheetSource?.kind === 'draft') {
              setSaved({ key: JSON.stringify(sheetSource.draft), booking });
            }
          }}
          onBackToHome={guard(() => router.dismissTo('/home'))}
          onViewPlan={guard((recurringBookingId: string) =>
            router.replace({
              pathname: '/recurring/[bookingId]',
              params: { bookingId: recurringBookingId },
            }),
          )}
        />
      )}
    </>
  );
}
