import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'react-native';

import { CancelVisitSheet } from '@features/cancellation';
import type { CancelQuote, CancelStep, CancelVisit } from '@features/cancellation';
import { AccountDataScreen, DeleteAccountSheetV2, ManageAccountScreen } from '@features/account';
import { NotServiceableScreen } from '@features/address';
import { MyBookingsScreen, bookingRowFrom, upcomingFrom } from '@features/history';
import type { BookingDetailDto, BookingSummaryDto, RefundDto } from '@features/booking';
import { AccountHubScreen } from '@features/profile';
import { RefundProgressCard } from '@features/refunds';
import type { AccountHubModel } from '@features/profile';
import {
  PaymentDetailsSheet,
  RateVisitCard,
  VisitDetailsScreen,
  visitDemoModel,
} from '@features/recurringLive';
import type { VisitRatingValue } from '@features/recurringLive';
import {
  ServiceVisitScreen,
  SpoonCancelledCard,
  cancelledVisitModelFrom,
  paymentSheetFrom,
  spoonCancelledFrom,
} from '@features/serviceVisit';
import type { ServicePhase, ServiceVisitModel } from '@features/serviceVisit';
import { RouteScaffold } from '@ui';

/**
 * Booking-flow redesign preview — DEVELOPMENT ONLY. Reachable at `spoon://booking-flow?view=…`.
 *
 * Cooking, time's up or a cook already on the way cannot be produced on staging on demand, so this
 * draws every frame of the Figma "Service flow", "Cancellation flow" and the Not serviceable screen
 * from sample data, for comparing against the frames on a device. It invents no product entry
 * point and refuses to render outside `__DEV__`.
 *
 *   view = assigned | onTheWay | arrived | cooking | timesUp | completed      (Service flow)
 *          c1 | c2 | c2-25 | c2-50 | c2-cook | c3 | c4 | c4b | c5 | c5b        (Cancellation)
 *          not-serviceable
 *          account | account-complete | pool-empty | pool-new | manage | data | delete
 *          bookings | bookings-past | bookings-empty                              (Accounts)
 *          cancelled-visit | payment-sheet                    (Visit details, cancelled / payment)
 *          reassigned                       (`2353:17562` cook reassigned, a first visit with her)
 *          arrival-early | arrival-late     (`2878:7730` / `2878:7959` cook due -15 / +10 min)
 *          cancelled-by-spoon               (`2342:4195` cancelled by Spoon, refund just started)
 */
/** The demo cook's photo as a file URI, for the rate card's ring. */
const PREVIEW_COOK_PHOTO = visitDemoModel('assigned').cook.photo;
const PREVIEW_COOK_PHOTO_URI =
  PREVIEW_COOK_PHOTO === undefined
    ? null
    : (Image.resolveAssetSource(PREVIEW_COOK_PHOTO as number)?.uri ?? null);

const SERVICE: Record<ServicePhase, Partial<ServiceVisitModel>> = {
  assigned: {},
  onTheWay: { bannerTitle: '9:00 AM · 1 hr', bannerSlot: null },
  arrived: { bannerTitle: '9:00 AM · 1 hr', bannerSlot: null },
  cooking: { bannerTitle: '9:00 AM · 1 hr', bannerSlot: null },
  timesUp: { bannerTitle: '9:00 AM · 1 hr', bannerSlot: null, minutesLeft: 0 },
  completed: {},
};

const option = (minutes: number, totalAmountPaise: number) => ({
  minutes,
  totalPaise: totalAmountPaise,
  available: true,
});

const MODEL: ServiceVisitModel = {
  phase: 'assigned',
  title: 'On-time visit',
  bannerTitle: 'Wed, 14 Oct',
  bannerSlot: '9:00 AM – 10:00 AM · 1 hr',
  cook: {
    eyebrow: 'SPOON TRAINED · VERIFIED',
    name: 'Cook Meera',
    origin: 'West Bengal · Speaks Hindi, Bengali',
    visits: 'Visits with you: 45',
    rating: 'Your rating: 4.5',
    note: '',
    ...(visitDemoModel('assigned').cook.photo === undefined
      ? {}
      : { photo: visitDemoModel('assigned').cook.photo }),
  },
  // The frames' own sample menu and cook photo, so the preview compares like for like.
  menu: visitDemoModel('assigned').menu,
  cookFirstName: 'Meera',
  cookPhoto: visitDemoModel('assigned').cook.photo ?? null,
  prepChecked: [],
  arrival: { by: '8:57 AM', minutes: 24, onTime: true },
  arrivedAt: '8:56 AM',
  startOtp: ['4', '8', '2', '7'],
  endOtp: ['6', '1', '9', '3'],
  minutesLeft: 102,
  endsAt: '9:58 AM',
  startedAt: '8:58 AM',
  extendChoices: [option(10, 1500), option(20, 3500), option(30, 6900)],
  extendedMinutes: 0,
  freeTill: '10:30 AM',
  tipPaid: null,
  canTip: true,
};

const VISIT: CancelVisit = {
  startsAt: new Date(Date.now() + (14 * 60 + 20) * 60_000).toISOString(),
  durationMinutes: 90,
  cookName: 'Meera',
  cookOnTheWay: false,
  etaMinutes: null,
  wasRescheduled: true,
  paidWith: 'UPI · ••••@okhdfcbank',
};

const quote = (feePercent: number): CancelQuote => {
  const fee = Math.ceil((29900 * feePercent) / 100);
  return {
    cancellable: true,
    feePercent,
    feePaise: fee,
    refundPaise: 29900 - fee,
    paidPaise: 29900,
    servicePaise: 25339,
    taxPaise: 4561,
    wasPaidPaise: 39900,
  };
};

const CANCEL: Record<string, { step: CancelStep; fee: number; onTheWay?: boolean }> = {
  c1: { step: 'modify', fee: 0 },
  c2: { step: 'policy', fee: 0 },
  'c2-25': { step: 'policy', fee: 25 },
  'c2-50': { step: 'policy', fee: 50 },
  'c2-cook': { step: 'policy', fee: 100, onTheWay: true },
  c3: { step: 'reason', fee: 0 },
  c4: { step: 'review', fee: 0 },
  c4b: { step: 'review', fee: 100, onTheWay: true },
  c5: { step: 'done', fee: 0 },
  c5b: { step: 'done', fee: 100, onTheWay: true },
};

const REASONS = [
  { code: 'URGENT_CHANGE', label: 'Something urgent came up', requiresDetail: false },
  { code: 'ORDERED_DELIVERY', label: 'Ordered food', requiresDetail: false },
  { code: 'FAMILY_COOKED', label: 'Family cooked at home', requiresDetail: false },
  { code: 'ARRANGED_OTHER_COOK', label: 'Found a cook elsewhere', requiresDetail: false },
  { code: 'BOOKED_BY_MISTAKE', label: 'Booked by mistake', requiresDetail: false },
  { code: 'COOK_NOT_PREFERRED', label: 'Didn’t like the assigned cook', requiresDetail: false },
  { code: 'OTHER', label: 'Something else', requiresDetail: true },
];

const HUB: AccountHubModel = {
  firstName: 'Aarav',
  phone: '+91 98765 00000',
  profileComplete: false,
  foodSummary: ['Vegetarian · North Indian', 'Punjabi · Bengali'],
  pool: 'pool',
  poolFaces: [
    { id: 'a', photo: null, initials: 'SA' },
    { id: 'b', photo: null, initials: 'RE' },
    { id: 'c', photo: null, initials: 'JY' },
  ],
  version: '1.0.0',
};

const DAY = 86_400_000;
const summaryDto = (
  id: string,
  inDays: number,
  extra: Partial<BookingSummaryDto> = {},
): BookingSummaryDto => ({
  id,
  status: 'assigned',
  slotType: 'scheduled',
  scheduledStart: new Date(Date.now() + inDays * DAY).toISOString(),
  durationMinutes: 60,
  price: { totalAmountPaise: 18800 } as BookingSummaryDto['price'],
  ...extra,
});

const UPCOMING = [
  summaryDto('u1', 1),
  summaryDto('u2', 3, { durationMinutes: 90, recurringBookingId: 'r1' }),
  summaryDto('u3', 5, { status: 'cancelled', durationMinutes: 150 }),
];
const PAST = [
  summaryDto('p1', -2, { status: 'completed', recurringBookingId: 'r1' }),
  summaryDto('p2', -40, { status: 'cancelled', policyBand: 'SERVICE_FAILURE_FULL_REFUND' }),
  summaryDto('p3', -70, { status: 'cancelled', durationMinutes: 90 }),
  summaryDto('p4', -72, { status: 'completed' }),
];

const PAGING = {
  hasMore: false,
  loadingMore: false,
  loadMoreError: false,
  loadMore: () => undefined,
  retryLoadMore: () => undefined,
  refetch: () => undefined,
};

function AccountsPreview({ view }: { view: string }) {
  const router = useRouter();
  const back = () => router.back();
  const [tab, setTab] = useState<'upcoming' | 'past'>(view.includes('past') ? 'past' : 'upcoming');
  if (view.startsWith('bookings')) {
    const empty = view.endsWith('empty');
    const now = new Date();
    return (
      <MyBookingsScreen
        tab={tab}
        onTab={setTab}
        upcoming={{
          ...PAGING,
          state: { status: 'ready', data: upcomingFrom(empty ? [] : UPCOMING, now) },
          count: empty ? 0 : UPCOMING.length,
        }}
        past={{
          ...PAGING,
          state: {
            status: 'ready',
            data: empty ? [] : PAST.map((dto) => bookingRowFrom(dto, now)),
          },
          count: empty ? 0 : PAST.length,
        }}
        onBack={back}
        onOpen={() => undefined}
        onBook={back}
      />
    );
  }
  if (view === 'manage') {
    return (
      <ManageAccountScreen
        onBack={back}
        onAccountData={() => undefined}
        onPrivacy={() => undefined}
        onTerms={() => undefined}
        onLogout={() => undefined}
      />
    );
  }
  if (view === 'data' || view === 'delete') {
    return (
      <AccountDataScreen
        phone="+91 98765 00000"
        addressesSummary="2 addresses"
        visitsSummary="12 visits · ratings & feedback"
        onBack={back}
        onTasteProfile={() => undefined}
        onAddresses={() => undefined}
        onBookingHistory={() => undefined}
        onDelete={() => undefined}
        sheet={
          <DeleteAccountSheetV2
            visible={view === 'delete'}
            losses={{ cookPool: true, foodProfile: true, visitHistory: true, addresses: true }}
            onKeep={back}
            onDelete={() => undefined}
            onLogout={() => undefined}
          />
        }
      />
    );
  }
  const model: AccountHubModel = {
    ...HUB,
    profileComplete: view === 'account-complete',
    pool: view === 'pool-empty' ? 'empty' : view === 'pool-new' ? 'new' : 'pool',
  };
  const noop = () => undefined;
  return (
    <AccountHubScreen
      model={model}
      onBack={back}
      onFoodProfile={noop}
      onViewPool={noop}
      onAddCook={noop}
      onBook={noop}
      onBookings={noop}
      onAddresses={noop}
      onHelp={noop}
      onManageAccount={noop}
    />
  );
}

const DETAIL: BookingDetailDto = {
  id: 'bk-dev',
  status: 'cancelled',
  slotType: 'scheduled',
  scheduledStart: new Date(Date.now() + 3 * DAY).toISOString(),
  durationMinutes: 60,
  totalDurationMinutes: 90,
  price: {
    amountPaise: 29900,
    durationMinutes: 60,
    serviceAmountPaise: 25339,
    taxRateBps: 1800,
    taxAmountPaise: 4561,
    totalAmountPaise: 29900,
    currency: 'INR',
    pricingVersion: 'dev',
    // V0's published 1-hour list price (₹300 before tax) — GST on it is exact, so it reads ₹354.
    strikeAmountPaise: 30000,
  },
  timing: { arrivedAt: null, actualStart: null, expectedEnd: null, actualEnd: null },
  cancellation: {
    cancelledBy: 'customer',
    cancelledAt: new Date(Date.now() - 2 * DAY).toISOString(),
    refundAmountPaise: 29900,
    chargeAmountPaise: 0,
  },
  charges: {
    extensions: [
      { minutes: 20, baseAmountPaise: 5932, chargedAmountPaise: 7000 },
      { minutes: 10, baseAmountPaise: 2966, chargedAmountPaise: 3500 },
    ],
    tipAmountPaise: 5000,
  },
  paymentMethod: { type: 'upi', label: 'UPI', detail: '••••@okhdfcbank' },
} as BookingDetailDto;

/** `2342:4195` — the system gave up finding a cook; the full refund has only been raised. */
const SPOON_DETAIL = {
  ...DETAIL,
  cancellation: {
    ...DETAIL.cancellation,
    cancelledBy: 'system',
    reasonCode: 'RECOVERY_NOT_POSSIBLE',
  },
} as BookingDetailDto;

const REFUND = {
  refundId: 'rfnd_8Hq2kLm',
  bookingId: 'bk-dev',
  reason: 'customer_cancel',
  amountPaise: 29900,
  currency: 'INR',
  state: 'succeeded',
  requestedAt: new Date(Date.now() - 2 * DAY).toISOString(),
  completedAt: null,
} as RefundDto;

function VisitPreview({ view }: { view: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(view.startsWith('payment-sheet'));
  const bySpoon = view === 'cancelled-by-spoon';
  const detail = bySpoon ? SPOON_DETAIL : DETAIL;
  const refund = bySpoon
    ? ({ ...REFUND, reason: 'spoon_cancel', state: 'requested' } as RefundDto)
    : REFUND;
  const model = cancelledVisitModelFrom(detail, refund, 'Cook Meera');
  const spoon = spoonCancelledFrom(detail, refund);
  return (
    <>
      <VisitDetailsScreen
        model={model}
        title="On-time visit"
        onBack={() => router.back()}
        onPaymentDetails={() => setOpen(true)}
        onHelp={() => undefined}
        cancelledSlot={
          spoon === null ? undefined : (
            <SpoonCancelledCard
              when={spoon.when}
              reason={spoon.reason}
              refundLine={spoon.refundLine}
              onRebook={() => undefined}
              onTalkToUs={() => undefined}
              testID="preview-spoon-cancelled"
            />
          )
        }
        // The shared Refund tracker (`2303:4231`) the host draws once the refund's tracker loads.
        refundProgress={
          <RefundProgressCard
            view={{
              amount: '₹299',
              destination: 'Original source',
              status: bySpoon ? 'in_progress' : 'completed',
              steps: [
                {
                  key: 'initiated',
                  title: 'Refund initiated',
                  when: '11 Oct, 1:09 PM',
                  done: true,
                },
                {
                  key: 'processed',
                  title: 'Refund processed',
                  when: bySpoon ? undefined : '11 Oct, 1:30 PM',
                  done: !bySpoon,
                },
                {
                  key: 'completed',
                  title: 'Refund completed',
                  when: bySpoon ? undefined : '12 Oct, 10:02 AM',
                  done: !bySpoon,
                },
              ],
              ...(bySpoon ? {} : { reference: 'RRN: 664320396937' }),
            }}
            testID="preview-refund-tracker"
          />
        }
      />
      <PaymentDetailsSheet
        visible={open}
        data={paymentSheetFrom(
          view === 'payment-sheet-basic' ? { ...DETAIL, charges: null } : DETAIL,
          'Cook Meera',
        )}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const ACCOUNT_VIEWS = new Set([
  'account',
  'account-complete',
  'pool-empty',
  'pool-new',
  'manage',
  'data',
  'delete',
  'bookings',
  'bookings-past',
  'bookings-empty',
  'bookings-past-empty',
]);

export default function DevBookingFlowRoute() {
  const { view = 'assigned', recurring } = useLocalSearchParams<{
    view?: string;
    recurring?: string;
  }>();
  // Keyed by view: a deep link to another view must start that view's sheet afresh.
  return (
    <BookingFlowPreview
      key={`${view}:${recurring ?? ''}`}
      view={view}
      recurring={recurring === '1'}
    />
  );
}

function BookingFlowPreview({ view, recurring }: { view: string; recurring: boolean }) {
  const router = useRouter();
  const cancel = CANCEL[view];
  const [step, setStep] = useState<CancelStep>(cancel?.step ?? 'modify');
  const [brief, setBrief] = useState<readonly ('menu' | 'time' | 'needs')[]>([]);
  const [rated, setRated] = useState<VisitRatingValue | null>(null);

  if (!__DEV__) {
    return <RouteScaffold title="Booking flow" status="foundation" notes={['Development only']} />;
  }

  if (ACCOUNT_VIEWS.has(view)) return <AccountsPreview view={view} />;
  if (
    view === 'cancelled-visit' ||
    view === 'cancelled-by-spoon' ||
    view.startsWith('payment-sheet')
  )
    return <VisitPreview view={view} />;

  if (view === 'not-serviceable') {
    return (
      <NotServiceableScreen
        place={{
          title: '100 Feet Road',
          line: 'Indiranagar, Bengaluru',
          locality: 'Indiranagar',
          liveAreas: ['HSR Layout', 'Haralur'],
          neighbours: 128,
        }}
        onBack={() => router.back()}
        onGoHome={() => router.back()}
        onTimeout={() => undefined}
      />
    );
  }

  const phase = (view in SERVICE ? view : 'assigned') as ServicePhase;
  // `2353:17562` — the new cook, on her first visit here: the overall rating, not "Your rating".
  const reassigned = view === 'reassigned';
  const cookArrival = view === 'arrival-early' ? 'early' : view === 'arrival-late' ? 'late' : null;
  return (
    <>
      <ServiceVisitScreen
        // `recurring=1`: a Recurring visit's booking (Figma `2165:13928` → `2216:6600`).
        model={{
          ...MODEL,
          ...SERVICE[phase],
          phase,
          ...(recurring ? { title: 'Recurring visit' } : {}),
          // `2878:7730` / `2878:7959` draw Cook Sanchita on her first visit, like the reassigned one.
          ...(cookArrival === null
            ? {}
            : {
                cookArrival,
                cook: {
                  ...MODEL.cook,
                  name: 'Cook Sanchita',
                  visits: 'First visit with you',
                },
              }),
          ...(reassigned
            ? {
                reassigned: true,
                cook: {
                  ...MODEL.cook,
                  visits: 'First visit with you',
                  rating: 'Rated 4.7 by Spoon users',
                },
              }
            : {}),
        }}
        onBack={() => router.back()}
        onPaymentDetails={() => undefined}
        onCall={() => undefined}
        onHelp={() => undefined}
        ratingSlot={
          phase === 'completed' ? (
            <RateVisitCard
              live
              variant="service"
              visit={{
                title: 'Cook Meera',
                meta: 'Sun, 12 Apr · 1:15 PM · 1 hr',
                cookName: 'Meera',
                // The frames' cook photo (`1517:9293`), so the first look compares like for like.
                photoUri: PREVIEW_COOK_PHOTO_URI,
              }}
              submitting={false}
              onRatingChange={setRated}
              onSubmit={() => undefined}
              testID="preview-rate"
            />
          ) : undefined
        }
        ratedHigh={rated !== null && (rated === '5+' || rated >= 4)}
        onShareRecipe={() => undefined}
        onModifyBooking={() => setStep('modify')}
        briefChecked={brief}
        onBriefToggle={(key) =>
          setBrief((current) =>
            current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
          )
        }
        extending={false}
        onExtend={() => undefined}
        onBookAnother={() => undefined}
        tipping={false}
        onTip={() => undefined}
      />
      {cancel === undefined ? null : (
        <CancelVisitSheet
          visible
          step={step}
          onStepChange={setStep}
          visit={{ ...VISIT, cookOnTheWay: cancel.onTheWay === true, etaMinutes: 12 }}
          quote={quote(cancel.fee)}
          reasons={REASONS}
          // As the server answers for a booking not yet rescheduled (V0 allows it up to the cook
          // arriving): C2 hides it from 50% itself, C3/C4 offer it whenever it is allowed.
          canReschedule
          onReschedule={() => undefined}
          onClose={() => router.back()}
          onConfirm={async () => true}
          refund={
            cancel.fee >= 100
              ? null
              : {
                  amountPaise: 29900,
                  method: 'upi',
                  refunded: false,
                  initiatedAt: new Date().toISOString(),
                  creditedAt: null,
                }
          }
          onBoundary={() => undefined}
          onDone={() => router.back()}
          onBookVisit={() => router.back()}
        />
      )}
    </>
  );
}
