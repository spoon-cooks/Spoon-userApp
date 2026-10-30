import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAndroidBackHandler } from '@core/navigation';

import { getUserMessage, isAppError } from '@core/errors';
import { CheckoutNoPaymentMethodsError, NO_UPI_APP_MESSAGE } from '@features/payment';
import type { CheckoutLauncher } from '@features/payment';
import { formatPaise, formatPaiseGrouped } from '@core/format';
import { Button, LoadingState, NoteCard, Screen, ScreenHeader, Text } from '@ui';
import { lightTheme } from '@ui/theme/ThemeProvider';

import { useRecurringEligibility, useRecurringQuote } from '../api';
import type { MandateVerifyDto, RecurringBookingDto, RecurringQuoteDto } from '../api';
import { draftFromPlans, unavailableVisitKeys, useBookRecurring } from '../booking';
import { editDateLabel } from '../data';
import { RecurringFooter } from '../components/RecurringFooter';
import { RecurringScrollBody } from '../components/RecurringScrollBody';
import type { RecurringPlanDraft } from '../types';

/**
 * Recurring setup — Step 8, UPI Autopay (DEC-086). NO FIGMA FRAME: the spec's Step 8 says "not in
 * Figma yet", so this screen is built from the spec's content with the flow's own components
 * (`ScreenHeader`, `RecurringScrollBody`, `NoteCard`, `RecurringFooter`) and named tokens only.
 * Replace its layout when a frame lands; the behaviour below stays.
 *
 * What it shows, all from the backend: the per-visit charge range (GST included) and the total if
 * every visit runs (the quote), that each visit is debited a few hours before it starts and the
 * bank notifies about a day before that, the per-debit ceiling (eligibility), and that cancelled
 * visits are never charged.
 *
 * What "Approve UPI Autopay" does (`useBookRecurring`): saves the booking — one pool Cook held per
 * visit — then opens Razorpay's UPI Autopay checkout and verifies it. Three ways it can come back:
 *
 * - approved (or the bank still confirming): `onBooked`.
 * - checkout closed: the booking is saved and waits for approval; the screen says so and the same
 *   button reopens checkout for the SAME booking (a retry never holds Cooks twice).
 * - a time taken since the Summary (409 `SLOT_UNAVAILABLE`, or a quote that is no longer bookable):
 *   "Change times" goes back to the Summary with the dates that need another time.
 */
export interface RecurringAutopayScreenProps {
  readonly addressId: string;
  readonly plans: readonly RecurringPlanDraft[];
  readonly onBack: () => void;
  /** Back to the Summary, with the `plan id#day id` keys of the visits that need another time. */
  readonly onChangeTimes: (unavailable: ReadonlySet<string>) => void;
  readonly onBooked: (booking: RecurringBookingDto, mandate: MandateVerifyDto) => void;
  /** Razorpay checkout; the real one unless a test injects a stub. */
  readonly launcher?: CheckoutLauncher;
  readonly testID?: string;
}

type Notice =
  | { readonly kind: 'none' }
  | { readonly kind: 'notApproved' }
  | { readonly kind: 'slotTaken' }
  | { readonly kind: 'error'; readonly message: string };

/** The `{date}` pair "Tue, 6 Oct – Fri, 16 Oct". */
function dateRange(quote: RecurringQuoteDto): string {
  return quote.firstDate === quote.lastDate
    ? editDateLabel(quote.firstDate)
    : `${editDateLabel(quote.firstDate)} – ${editDateLabel(quote.lastDate)}`;
}

function chargeRange(quote: RecurringQuoteDto): string {
  const { minPaise, maxPaise } = quote.chargeRange;
  return minPaise === maxPaise
    ? formatPaise(minPaise)
    : `${formatPaise(minPaise)} – ${formatPaise(maxPaise)}`;
}

export function RecurringAutopayScreen({
  addressId,
  plans,
  onBack,
  onChangeTimes,
  onBooked,
  launcher,
  testID = 'recurring-autopay-screen',
}: RecurringAutopayScreenProps) {
  // Android back does what the back arrow does, instead of leaving the whole flow.
  useAndroidBackHandler(() => {
    onBack();
    return true;
  });
  const draft = useMemo(() => draftFromPlans(addressId, plans), [addressId, plans]);
  const quote = useRecurringQuote(draft);
  const eligibility = useRecurringEligibility();
  const { book, isSaved, pending } = useBookRecurring(launcher);
  const [notice, setNotice] = useState<Notice>({ kind: 'none' });

  const quoted = quote.state.status === 'ready' ? quote.state.data : null;
  const charging = eligibility.state.status === 'ready' ? eligibility.state.data.charging : null;
  // Days whose visits add up past the per-debit cap (one debit pays a whole day, DEC-091): the
  // Summary has to change, but no time was taken, so it is said apart from `slotTaken`.
  const overLimitDays = quoted?.dayTotals?.filter((day) => day.overLimit) ?? [];
  // Once this draft is saved, its own reservations claim those dates and Cooks, so a quote
  // refetched on return from checkout reads `bookable: false` with nothing taken by anyone else.
  // Only the save's own refusal (`notice.kind === 'slotTaken'`) can mean a time was taken then.
  const quoteTaken = quoted !== null && !quoted.bookable && !isSaved(draft);
  const slotTaken = overLimitDays.length === 0 && (notice.kind === 'slotTaken' || quoteTaken);
  const mustChange = slotTaken || overLimitDays.length > 0;

  const approve = async () => {
    setNotice({ kind: 'none' });
    try {
      const outcome = await book(draft);
      if (outcome.kind === 'cancelled') {
        setNotice({ kind: 'notApproved' });
        return;
      }
      onBooked(outcome.booking, outcome.mandate);
    } catch (error) {
      if (
        isAppError(error) &&
        error.code === 'SLOT_UNAVAILABLE' &&
        error.details?.reason === 'DAY_TOTAL_OVER_AUTOPAY_LIMIT'
      ) {
        // The re-quote's `dayTotals` names the days.
        quote.refetch();
        return;
      }
      if (isAppError(error) && error.code === 'SLOT_UNAVAILABLE') {
        setNotice({ kind: 'slotTaken' });
        quote.refetch();
        return;
      }
      setNotice({
        kind: 'error',
        message:
          error instanceof CheckoutNoPaymentMethodsError
            ? NO_UPI_APP_MESSAGE
            : isAppError(error)
              ? getUserMessage(error)
              : 'Autopay could not be set up. Please try again.',
      });
    }
  };

  return (
    <Screen
      tone="plain"
      padded={false}
      testID={testID}
      header={
        <ScreenHeader
          density="nav"
          title="UPI Autopay"
          onBack={onBack}
          testID={`${testID}-header`}
        />
      }
      footer={
        mustChange ? (
          <RecurringFooter
            label="Change times"
            onPress={() =>
              onChangeTimes(quoted === null ? new Set() : unavailableVisitKeys(plans, quoted))
            }
            testID={`${testID}-change-times`}
          />
        ) : (
          <RecurringFooter
            label={pending ? 'Opening UPI…' : 'Approve UPI Autopay'}
            disabled={pending || quoted === null}
            onPress={() => void approve()}
            testID={`${testID}-approve`}
          />
        )
      }
    >
      <RecurringScrollBody contentStyle={styles.content} testID={`${testID}-body`}>
        {quote.state.status === 'loading' ? (
          <LoadingState testID={`${testID}-loading`} />
        ) : quote.state.status === 'error' ? (
          <View style={styles.section}>
            <Text variant="body" color="textPrimary">
              {getUserMessage(quote.state.error)}
            </Text>
            <Button label="Try again" variant="secondary" onPress={() => quote.refetch()} />
          </View>
        ) : quoted === null ? null : (
          <>
            <View style={styles.section}>
              <Text variant="headingSection" color="textPrimary">
                Pay per visit, nothing upfront
              </Text>
              <Text variant="body" color="textSecondary" testID={`${testID}-summary`}>
                {quoted.daysCount} days · {quoted.visitsCount} visits · {dateRange(quoted)}
              </Text>
            </View>

            <View style={styles.section}>
              <Row label="Each visit" value={chargeRange(quoted)} testID={`${testID}-range`} />
              <Row
                label="If every visit runs"
                value={formatPaise(quoted.totalPaise)}
                testID={`${testID}-total`}
              />
              <Text variant="body" color="textSecondary">
                Prices include GST.
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="headingSection" color="textPrimary">
                How Autopay works
              </Text>
              <Point testID={`${testID}-point-debit`}>
                {charging === null
                  ? 'Charged a few hours before your first visit of the day.'
                  : `Charged ${String(charging.debitLeadHours)} hrs before your first visit of the day.`}
              </Point>
              <Point testID={`${testID}-point-notice`}>
                {charging === null
                  ? 'Your bank notifies you about a day before each charge.'
                  : `Your bank notifies you about ${String(charging.notifyLeadHours)} hours before each charge.`}
              </Point>
              <Point testID={`${testID}-point-ceiling`}>
                {`No single charge can be more than ${formatPaise(
                  charging?.mandateMaxChargePaise ?? quoted.mandateMaxChargePaise,
                )}.`}
              </Point>
              <Point testID={`${testID}-point-cancel`}>Cancelled visits are never charged.</Point>
              <Point testID={`${testID}-point-auth`}>
                Approving may show a ₹1 charge in your UPI app. It is refunded.
              </Point>
            </View>
          </>
        )}

        {overLimitDays.length > 0 ? (
          <NoteCard
            tone="accent"
            title="Over the Autopay limit on some days"
            body={`UPI Autopay can charge up to ${formatPaiseGrouped(quoted?.mandateMaxChargePaise ?? 0)} a day, and your visits on ${overLimitDays
              .map((day) => `${editDateLabel(day.date)} (${formatPaiseGrouped(day.totalPaise)})`)
              .join(
                ', ',
              )} add up to more. Remove a visit or pick a shorter duration on those days.`}
            testID={`${testID}-over-limit`}
          />
        ) : slotTaken ? (
          <NoteCard
            tone="accent"
            title="Some times were just taken"
            body="A cook is no longer free for some of your visits. Pick another time for those dates."
            testID={`${testID}-slot-taken`}
          />
        ) : notice.kind === 'notApproved' ? (
          <NoteCard
            tone="accent"
            title="Autopay isn't approved yet"
            body="Your cooks are held for a short while. Approve Autopay to confirm your booking."
            testID={`${testID}-not-approved`}
          />
        ) : notice.kind === 'error' ? (
          <NoteCard tone="muted" body={notice.message} testID={`${testID}-error`} />
        ) : null}
      </RecurringScrollBody>
    </Screen>
  );
}

function Row({
  label,
  value,
  testID,
}: {
  readonly label: string;
  readonly value: string;
  readonly testID: string;
}) {
  return (
    <View style={styles.row} testID={testID}>
      <Text variant="body" color="textSecondary">
        {label}
      </Text>
      <Text variant="bodyStrong" color="textPrimary">
        {value}
      </Text>
    </View>
  );
}

function Point({ children, testID }: { readonly children: string; readonly testID: string }) {
  return (
    <View style={styles.point} testID={testID}>
      <Text variant="body" color="textSecondary">
        •
      </Text>
      <Text variant="body" color="textPrimary" style={styles.pointText}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: lightTheme.space.lg, gap: lightTheme.space.xl },
  section: { gap: lightTheme.space.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  point: { flexDirection: 'row', gap: lightTheme.space.sm },
  pointText: { flex: 1 },
});
