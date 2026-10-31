import { useCallback, useState } from 'react';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { isGuest } from '@core/auth';
import { useNavigationGuard } from '@core/navigation';
import { getLogger } from '@core/logging';
import { useSessionStore } from '@core/store';
import { useTriedPlace } from '@features/address';
import { useMe } from '@features/auth';
import { destinationForPayment, durationIdFor, useBookingSubmission } from '@features/booking';
import {
  HomeRedesignView,
  joinWaitlist,
  useGuestHomeRedesignData,
  useHomeRedesignData,
  useJoinWaitlist,
  useWaitlistState,
} from '@features/homeRedesign';
import type { BookingRequest, RecurringTarget } from '@features/homeRedesign';
import { ConfirmingAutopayBanner, useConfirmingAutopay } from '@features/recurringSetup';
import { QueryBoundary } from '@ui';

const logger = getLogger('home');

/**
 * Home — the redesign (Figma `cCQlzTeiObQkpVBzwI8mZi`: `941:4884`, `1255:2973`, `1290:1280`,
 * `1302:3539`), on live data from `useHomeRedesignData`.
 *
 * Book now (Now, instant available) creates an instant booking and opens Razorpay, exactly as
 * the old Instant sheet did — `useBookingSubmission` owns the hold, idempotency and checkout, and
 * `destinationForPayment` decides where the outcome lands. Schedule hands the chosen duration to
 * `/scheduled`, so only a slot and payment remain.
 *
 * An address OUTSIDE the service area now renders the not-live Home (waitlist + referral) rather
 * than bouncing to the map; only an account with no saved address at all is sent to add one.
 *
 * The pool block: "Check Recurring" and "Book Recurring" both open the Recurring landing (owner,
 * 31 Oct 2026: shown on every booking, not only the first; its own "Book Recurring" opens the
 * plan flow), the pool card the Cook Pool, and a bead that cook's profile. "Recurring · Live" opens that booking's Live booking tab (`/recurring/[bookingId]`).
 *
 * Active bookings (`2243:1120`): a card opens its booking (`/booking/[id]`); "View all" opens My
 * bookings on Upcoming.
 */
export default function HomeRoute() {
  const status = useSessionStore((state) => state.status);
  return isGuest(status) ? <GuestHomeRoute /> : <SignedInHomeRoute />;
}

/**
 * Home for a GUEST — skipped Login (iOS only; App Store review requires browsing without an
 * account). The same screen on the catalogue alone (`useGuestHomeRedesignData`): real durations
 * and prices, nothing per-account. Every action that needs an account asks them to sign in.
 *
 * Split from the signed-in route rather than branched inside it so neither mounts the other's
 * reads — the signed-in ones would all 401 for a guest. "Sign in" REPLACES to Login: Login's
 * Skip replaces straight back here, so the stack never grows a Login/Home ping-pong, and a
 * successful OTP runs the normal first-run path through the boot gate (profile → address → Home).
 */
function GuestHomeRoute() {
  const router = useRouter();
  const home = useGuestHomeRedesignData();
  // One screen per tap: a quick double tap must not open Login twice.
  const guard = useNavigationGuard();
  const signIn = guard(() => router.replace('/login'));

  return (
    <QueryBoundary state={home.state} onRetry={home.refetch}>
      {(model) => (
        <HomeRedesignView
          model={model}
          onPressAddress={signIn}
          onPressProfile={signIn}
          onDurationSelected={(event) => logger.info('duration_selected', event)}
          onBookNow={signIn}
          onPickSlot={signIn}
          onPressRecurring={() => {
            signIn();
            return true;
          }}
          onPressCookPool={signIn}
          onPressPoolCook={signIn}
          onRefreshAvailability={home.refetch}
          // Unreachable: a guest's Home is always the live variant, which has no waitlist.
          onJoinWaitlist={async () => signIn()}
        />
      )}
    </QueryBoundary>
  );
}

function SignedInHomeRoute() {
  const router = useRouter();
  const [waitlistJoined, setWaitlistJoined] = useState(false);
  const me = useMe();
  const userId = me.state.status === 'ready' ? me.state.data.id : null;
  /**
   * The place this customer was last refused at, read from the device once their id is known. A
   * customer with no saved address sees the inactive-pincode Home for it (`1302:3539`) instead of
   * being sent back to the map — the loop the Not serviceable redirect used to land in.
   */
  const triedPlace = useTriedPlace(userId);
  // The server's waitlist state: joined (so "You're on the list" survives a relaunch) and how many
  // others are waiting in this pincode, for the meter.
  const waitlistState = useWaitlistState();
  /**
   * Home is on screen and its tiles show Later availability: the three-day overview is re-read
   * every 30 seconds only then (DEC-094).
   */
  const [focused, setFocused] = useState(false);
  const [laterTiles, setLaterTiles] = useState(false);
  const home = useHomeRedesignData({
    waitlistJoined,
    waitlistState: waitlistState.state.status === 'ready' ? waitlistState.state.data : undefined,
    triedPlace,
    pollLater: focused && laterTiles,
  });
  /** No saved address: the header's address opens the map to add one, not the empty list. */
  const hasAddress = home.addressId !== null;
  const join = useJoinWaitlist();
  /** A Recurring booking whose Autopay the bank is still confirming (note 2317:13605). */
  const confirmingAutopay = useConfirmingAutopay();

  // The duration the submission prices and books. Kept in step with every new selection.
  const [durationId, setDurationId] = useState<string | null>(null);
  const submission = useBookingSubmission({ slotType: 'instant', durationId });
  /**
   * One-line notices. A refused booking's copy is read from `submitError` at render — the
   * rejection handler would only see the previous render's value.
   */
  const [notice, setNotice] = useState<{ id: number; message: string | 'booking' } | null>(null);
  const say = (message: string | 'booking') =>
    setNotice((prev) => ({ id: (prev?.id ?? 0) + 1, message }));
  const shownNotice =
    notice === null
      ? null
      : {
          id: notice.id,
          message:
            notice.message === 'booking'
              ? (submission.submitError ?? 'Couldn’t start the booking. Please try again.')
              : notice.message,
        };

  // One screen per tap: a quick double tap must not open the same screen twice. "Book now" has its
  // own guard — it ignores a press while a submission is in flight.
  const guard = useNavigationGuard();

  // Re-resolve the variant on every Home focus (address change, a first completed booking).
  const { refetch } = home;
  useFocusEffect(
    useCallback(() => {
      refetch();
      setFocused(true);
      return () => setFocused(false);
    }, [refetch]),
  );

  if (home.needsAddress) {
    return <Redirect href="/address/location?onboarding=1" />;
  }

  const bookNow = (request: BookingRequest) => {
    if (!submission.canSubmit || submission.submitting) return;
    if (durationId !== request.duration.id) return;
    submission.submit().then(
      ({ booking, payment }) => {
        // Verified → the confirming screen; failed → Payment Failed; dismissed → stay on Home.
        const destination = destinationForPayment(payment, booking.booking.id);
        if (destination !== null) router.push(destination);
      },
      () => say('booking'),
    );
  };

  /** `liveBookingId`: the household's live Recurring booking, which the "Live" chip opens. */
  const openRecurring = (target: RecurringTarget, liveBookingId: string | null): boolean => {
    if (target === 'recurringFlow' || target === 'explainer') {
      router.push('/recurring');
      return true;
    }
    // "Recurring · Live" comes from the same eligibility answer as its booking, so this has a
    // booking to open. Should it ever not (a refresh caught between the two), the Recurring
    // explainer is a real page to land on rather than a dead tap.
    if (liveBookingId === null) {
      router.push('/recurring');
      return true;
    }
    router.push({ pathname: '/recurring/[bookingId]', params: { bookingId: liveBookingId } });
    return true;
  };

  return (
    <QueryBoundary state={home.state} onRetry={home.refetch}>
      {(model) => (
        <HomeRedesignView
          model={model}
          bookingBusy={submission.submitting}
          notice={shownNotice}
          focused={focused}
          banner={
            confirmingAutopay === null ? null : (
              <ConfirmingAutopayBanner
                onPress={guard(() =>
                  router.push({
                    pathname: '/recurring/[bookingId]',
                    params: { bookingId: confirmingAutopay.recurringBookingId },
                  }),
                )}
              />
            )
          }
          onPressAddress={guard(() =>
            router.push(hasAddress ? '/address?from=home' : '/address/location?from=home'),
          )}
          onPressProfile={guard(() => router.push('/profile'))}
          onPressActiveBooking={guard((card) =>
            router.push({ pathname: '/booking/[id]', params: { id: card.bookingId } }),
          )}
          onPressViewAllBookings={guard(() => router.push('/history'))}
          onDurationSelected={(event) => {
            setDurationId(durationIdFor(event.durationMin));
            logger.info('duration_selected', event);
          }}
          onBookNow={bookNow}
          onPickSlot={guard((request: BookingRequest) =>
            router.push({
              pathname: '/scheduled',
              params: { durationId: request.duration.id },
            }),
          )}
          onPressRecurring={(target) => {
            guard(() => openRecurring(target, model.activeRecurringPlan?.id ?? null))();
            return true;
          }}
          onPressCookPool={guard(() => router.push('/cook-pool'))}
          onPressPoolCook={guard((cook: { readonly id: string }) =>
            router.push({ pathname: '/cook-pool/[cookId]', params: { cookId: cook.id } }),
          )}
          onRefreshAvailability={home.refetch}
          onLaterTilesChange={setLaterTiles}
          onJoinWaitlist={async () => {
            const meData = me.state.status === 'ready' ? me.state.data : null;
            const name = meData?.name?.trim() || meData?.phone || 'Spoon customer';
            await joinWaitlist(
              { pincode: model.address.pincode, alreadyJoined: model.waitlist?.joined === true },
              {
                requestPushPermission: async () => {
                  const existing = await Notifications.getPermissionsAsync();
                  if (existing.granted) return true;
                  return (await Notifications.requestPermissionsAsync()).granted;
                },
                // The backend takes no channel; push permission is asked for its own sake.
                register: async () => {
                  await join.mutateAsync({
                    name,
                    addressId: home.addressId,
                    pincode: model.address.pincode ?? null,
                  });
                },
              },
            ).catch((error: unknown) => {
              say('Couldn’t add you to the list. Please try again.');
              throw error;
            });
            setWaitlistJoined(true);
          }}
        />
      )}
    </QueryBoundary>
  );
}
