import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { currentSkewMs } from '@core/time';

import { useExtensionOptions, useMyRatingMedia, useTracking } from '@features/booking';
import type { BookingDetailDto, ExtensionOptionDto } from '@features/booking';
import { cookCardLines, cookProfileFrom, useCookPoolProfile } from '@features/cookPool';
import { TaxDetailsDialog } from '@features/homeRedesign';
import {
  PaymentDetailsSheet,
  RateVisitCard,
  ratingRequestFor,
  submittedFeedbackFrom,
  todayInKolkata,
  useCancelWholeBooking,
  visitDetailsFrom,
} from '@features/recurringLive';
import type {
  PaymentDetailsSheetData,
  RateVisitSubmission,
  VisitRatingValue,
  VisitRatingRequest,
  VisitMenuSection,
  VisitPrepKey,
} from '@features/recurringLive';
import {
  useBookingPrep,
  useRecurringBooking,
  useRecurringVisit,
  useUpdateBookingPrep,
} from '@features/recurringSetup';

import { ServiceVisitScreen } from './ServiceVisitScreen';
import type { ServiceVisitModel } from './ServiceVisitScreen';
import type { BriefKey } from './components';
import {
  arrivalOf,
  clock,
  day,
  duration,
  endsAt,
  extendChoicesFrom,
  extendedMinutes,
  cookNameOf,
  freeTill,
  minutesLeft,
  otpDigits,
  paidTipOf,
  paymentSheetFrom,
  reassignedOneTime,
  recurringPaymentSheetFrom,
  servicePhaseOf,
  visitBannerOf,
} from './model';
import type { ServicePhase } from './model';

/**
 * The live data behind `ServiceVisitScreen` for one booking. The host owns the reads (tracking
 * while the visit is live, the cook's profile and menu, the prep checklist, extension options)
 * and a minute clock; every write that takes money — extending, tipping — and the rating go
 * through the route's existing mutations, so checkout and idempotency stay where they are.
 */
export interface ServiceVisitHostProps {
  readonly booking: BookingDetailDto;
  readonly phase: ServicePhase;
  readonly onBack: () => void;
  readonly onModifyBooking?: (() => void) | undefined;
  readonly onHelp?: (() => void) | undefined;
  readonly onCall?: (() => void) | undefined;
  readonly onShareRecipe?: (() => void) | undefined;
  readonly onExtend: (minutes: number) => Promise<unknown>;
  readonly extending: boolean;
  readonly onTip: (amountPaise: number) => Promise<unknown>;
  readonly tipping: boolean;
  /** The rate card's submission: uploads its media, then sends the rating. */
  readonly onRate: (request: VisitRatingRequest) => Promise<unknown>;
  readonly rating: boolean;
  readonly onBookAnother: () => void;
  /** A Recurring visit's Payment details → Manage → "View refunds" on the cancellation result. */
  readonly onViewRefunds?: (() => void) | undefined;
}

/** "Brief your cook" ticks: optional, per visit, kept for the app session. */
const briefByBooking = new Map<string, readonly BriefKey[]>();

export function ServiceVisitHost({
  booking,
  phase,
  onBack,
  onModifyBooking,
  onHelp,
  onCall,
  onShareRecipe,
  onExtend,
  extending,
  onTip,
  tipping,
  onRate,
  rating,
  onBookAnother,
  onViewRefunds,
}: ServiceVisitHostProps) {
  const now = useMinuteClock(phase);
  const live =
    phase === 'onTheWay' || phase === 'arrived' || phase === 'cooking' || phase === 'timesUp';
  const tracking = useTracking(live ? booking.id : null, { poll: true });
  const cookId = booking.cook?.id ?? null;
  const profile = useCookPoolProfile(cookId ?? 'none', { enabled: cookId !== null });
  const prep = useBookingPrep(phase === 'assigned' || phase === 'onTheWay' ? booking.id : null);
  const updatePrep = useUpdateBookingPrep();
  const extension = useExtensionOptions(
    (phase === 'cooking' || phase === 'timesUp') && booking.allowedActions.canExtend
      ? booking.id
      : null,
  );
  const [brief, setBrief] = useState<readonly BriefKey[]>(
    () => briefByBooking.get(booking.id) ?? [],
  );
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [tipPaid, setTipPaid] = useState<ServiceVisitModel['tipPaid']>(null);
  const [rated, setRated] = useState(false);
  // The score picked on the rate card; 4 and above warms the tip card (`2165:14445`).
  const [picked, setPicked] = useState<VisitRatingValue | null>(null);
  const ratedHigh = picked !== null && (picked === '5+' || picked >= 4);

  // A Recurring visit's booking (Figma `2165:13928` → `2216:6600`): the same screens titled
  // "Recurring visit", paid by the plan's UPI Autopay — whose "Manage" cancels the whole booking,
  // as it does on the plan's own Visit details.
  const link = booking.recurring ?? null;
  const planVisit = useRecurringVisit(link?.recurringBookingId ?? null, link?.visitId ?? null);
  const planBooking = useRecurringBooking(link?.recurringBookingId ?? null);
  const planActive =
    planBooking.state.status === 'ready' && planBooking.state.data.status === 'active';
  const wholeBooking = useCancelWholeBooking({
    bookingId: link?.recurringBookingId ?? null,
    enabled: planActive,
    onCancelled: () => {
      planVisit.refetch();
      planBooking.refetch();
    },
    ...(onViewRefunds === undefined ? {} : { onViewRefunds }),
  });

  const options: readonly ExtensionOptionDto[] =
    extension.state.status === 'ready' ? extension.state.data : [];
  const trackingData = tracking.state.status === 'ready' ? tracking.state.data : null;
  const card = profile.state.status === 'ready' ? profile.state.data.cook : null;
  const cookName = booking.cook?.name ?? card?.displayName ?? null;
  const photoUrl = booking.cook?.photoUrl ?? card?.profileImageUrl ?? null;
  const cookPhoto: ImageSourcePropType | null = photoUrl === null ? null : { uri: photoUrl };

  const menu: readonly VisitMenuSection[] = useMemo(() => {
    if (profile.state.status !== 'ready') return [];
    return cookProfileFrom(profile.state.data).menu.map((section) => ({
      id: section.id,
      title: section.title,
      dishes: section.dishes.map((dish) => ({
        id: dish.id,
        name: dish.name,
        ...(dish.image === undefined ? {} : { image: dish.image as ImageSourcePropType }),
      })),
    }));
  }, [profile.state]);

  const start = booking.scheduledStart ?? booking.timing.actualStart;
  const length = duration(booking.durationMinutes);
  const end = endsAt(booking);
  // The trust marks, caption and stat lines are the backend's (DEC-114), first visit included.
  const lines = cookCardLines(
    profile.state.status === 'ready' ? profile.state.data.presentation : undefined,
  );
  /*
   * `2353:17562` — a ONE-TIME visit whose cook ops/system swapped before the trip: the
   * "Sorry, we have assigned you another cook" note sits above the (new) cook's card until she
   * starts the trip, then the screen moves on to Cook on the way as usual. A Recurring visit
   * never shows it (dev note `2353:17578`).
   */
  const reassigned = reassignedOneTime(booking);
  const banner = visitBannerOf(booking, phase);

  const model: ServiceVisitModel = {
    phase,
    reassigned,
    // `2878:7730` / `2878:7959`: the cook is due early or late against the booked time (§8).
    cookArrival: booking.cookArrival ?? null,
    title:
      // Every one-time visit, Instant or scheduled, is "One-time visit" (Figma's "On-time" was a typo, 31 Oct 2026).
      link !== null ? 'Recurring visit' : 'One-time visit',
    bannerTitle: banner.title,
    bannerSlot: banner.slot,
    cook: {
      name: cookNameOf(cookName) ?? 'Your cook',
      ...lines,
      note: '',
      ...(photoUrl === null ? {} : { photo: { uri: photoUrl } }),
    },
    menu,
    cookName: cookNameOf(cookName),
    cookPhoto,
    prepChecked:
      prep.state.status !== 'ready'
        ? []
        : [
            ...(prep.state.data.entryApproved ? (['entry'] as const) : []),
            ...(prep.state.data.groceriesReady ? (['groceries'] as const) : []),
            ...(prep.state.data.utensilsReady ? (['utensils'] as const) : []),
          ],
    arrival: arrivalOf(booking, trackingData, now),
    arrivedAt:
      (trackingData?.arrivedAt ?? booking.timing.arrivedAt ?? null) === null
        ? null
        : clock((trackingData?.arrivedAt ?? booking.timing.arrivedAt) as string),
    startOtp: otpDigits(trackingData?.serviceOtp?.start),
    endOtp: otpDigits(trackingData?.serviceOtp?.end),
    minutesLeft: minutesLeft(booking, now),
    endsAt: end === null ? null : clock(end),
    startedAt: booking.timing.actualStart === null ? null : clock(booking.timing.actualStart),
    extendChoices: extendChoicesFrom(options),
    extendedMinutes: extendedMinutes(booking),
    freeTill: freeTill(options),
    // The server's captured tip outlives the session; the local one covers the moment between
    // paying and the refetch.
    tipPaid: paidTipOf(booking) ?? tipPaid,
    canTip: booking.allowedActions.canTip,
  };

  const planSheet =
    planVisit.state.status === 'ready'
      ? visitDetailsFrom({
          visit: planVisit.state.data,
          booking: planBooking.state.status === 'ready' ? planBooking.state.data : null,
          cookProfile: null,
          cookCard: null,
          quote: null,
          todayId: todayInKolkata(),
        }).paymentSheet
      : null;
  const paymentSheet: PaymentDetailsSheetData =
    planSheet === null
      ? paymentSheetFrom(booking, cookName)
      : recurringPaymentSheetFrom(booking, cookName, planSheet);

  /*
   * Rate card (`1517:*`) until it is sent, then `Rate card / Submitted` (`2306:929`) in its place.
   * Sent here: the same card flips to read-only and keeps what was entered. Sent before (a reopened
   * visit): it is drawn submitted from the server's copy — the score, chips and words on the
   * booking, the voice note / photos / video on signed links — once that media has been read, so
   * the card mounts complete.
   */
  const ratedBefore = !rated && (booking.ratingStars ?? null) !== null;
  const savedMedia = useMyRatingMedia(phase === 'completed' && ratedBefore ? booking.id : null);
  const visitInfo = {
    title: cookNameOf(cookName) ?? 'Your cook',
    meta: start === null ? length : `${day(start)} · ${clock(start)} · ${length}`,
    cookName: cookNameOf(cookName) ?? 'your cook',
    photoUri: photoUrl,
  };
  const ratingSlot =
    phase !== 'completed' ? undefined : ratedBefore ? (
      savedMedia.state.status === 'loading' ? undefined : (
        <RateVisitCard
          live
          submitted
          variant="service"
          visit={visitInfo}
          initialRating={
            booking.ratingExceptional === true ? '5+' : (booking.ratingStars as VisitRatingValue)
          }
          initialChips={booking.ratingChips ?? []}
          initialFeedback={submittedFeedbackFrom({
            text: booking.ratingFeedback,
            media: savedMedia.state.status === 'ready' ? savedMedia.state.data.media : [],
          })}
          onRatingChange={setPicked}
          testID="service-visit-rate"
        />
      )
    ) : booking.allowedActions.canRate || rated ? (
      <RateVisitCard
        live
        submitted={rated}
        variant="service"
        visit={visitInfo}
        submitting={rating}
        onRatingChange={setPicked}
        onSubmit={(submission: RateVisitSubmission) => {
          void onRate(ratingRequestFor(submission))
            .then(() => setRated(true))
            .catch(() =>
              Alert.alert(
                'Couldn’t send your rating',
                'Check your connection and try again. Nothing you added is lost.',
              ),
            );
        }}
        testID="service-visit-rate"
      />
    ) : undefined;

  return (
    <>
      <ServiceVisitScreen
        model={model}
        onBack={onBack}
        onPaymentDetails={() => setPaymentOpen(true)}
        onExtendPaymentDetails={() => setTaxOpen(true)}
        onModifyBooking={onModifyBooking}
        onHelp={onHelp}
        onCall={booking.allowedActions.canCallCook ? onCall : undefined}
        onShareRecipe={onShareRecipe}
        onPrepChange={(checked: readonly VisitPrepKey[]) =>
          updatePrep.mutate({
            bookingId: booking.id,
            input: {
              entryApproved: checked.includes('entry'),
              groceriesReady: checked.includes('groceries'),
              utensilsReady: checked.includes('utensils'),
            },
          })
        }
        briefChecked={brief}
        onBriefToggle={(key) =>
          setBrief((current) => {
            const next = current.includes(key)
              ? current.filter((entry) => entry !== key)
              : [...current, key];
            briefByBooking.set(booking.id, next);
            return next;
          })
        }
        extending={extending}
        onExtend={(minutes) => {
          void onExtend(minutes)
            .then(() => extension.refetch())
            .catch(() => undefined);
        }}
        onBookAnother={onBookAnother}
        ratingSlot={ratingSlot}
        ratedHigh={ratedHigh}
        tipping={tipping}
        onTip={(amountPaise) => {
          void onTip(amountPaise)
            .then(() =>
              setTipPaid({
                amountPaise,
                when: `Paid · ${day(new Date().toISOString())}, ${clock(new Date().toISOString())}`,
              }),
            )
            .catch(() => undefined);
        }}
      />
      <PaymentDetailsSheet
        visible={paymentOpen}
        data={paymentSheet}
        onClose={() => setPaymentOpen(false)}
        {...(planActive
          ? {
              onManageAutopay: () => {
                setPaymentOpen(false);
                wholeBooking.askToCancel();
              },
            }
          : {})}
      />
      {wholeBooking.sheet}
      {/* The extension is taxed at the booking's rate. */}
      <TaxDetailsDialog
        visible={taxOpen}
        onClose={() => setTaxOpen(false)}
        gstPercent={booking.price.taxRateBps / 100}
      />
    </>
  );
}

/**
 * Ticks every 30s: the countdown and the ETA move in whole minutes (dev note `2165:12402`).
 *
 * Read on the server's clock, as Home and My bookings are: the end time is the server's, so a
 * phone running behind it would otherwise count a minute too many (device test, 31 Oct 2026).
 * It also reads again whenever `phase` changes, so the Start OTP's "Cooking" starts from now
 * rather than from a reading taken up to 30s earlier, while the screen still said "Arrived".
 */
function useMinuteClock(phase: ServicePhase): Date {
  const [now, setNow] = useState(serverNow);
  const [readFor, setReadFor] = useState(phase);
  if (readFor !== phase) {
    // React's "adjust state when a prop changes", done in render rather than an effect.
    setReadFor(phase);
    setNow(serverNow());
  }
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function serverNow(): Date {
  return new Date(Date.now() - currentSkewMs());
}

export { servicePhaseOf };
