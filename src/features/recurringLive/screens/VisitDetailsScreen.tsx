import { useRef } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@ui';
import { lightTheme } from '@ui/theme/ThemeProvider';

import { ActionDock } from '../components/visit/ActionDock';
import { BeforeArrivalCard } from '../components/visit/BeforeArrivalCard';
import { CookAssignedCard } from '../components/visit/CookAssignedCard';
import { CookPendingCard } from '../components/visit/CookPendingCard';
import { UpiAutopayCard } from '../components/visit/UpiAutopayCard';
import { RecipeShareRow } from '../components/visit/RecipeShareRow';
import { RefundSummaryCard } from '../components/visit/RefundSummaryCard';
import { VisitCancelledCard } from '../components/visit/VisitCancelledCard';
import { VisitChargeCard } from '../components/visit/VisitChargeCard';
import { VisitHeader } from '../components/visit/VisitHeader';
import { VisitCookActions } from '../components/visit/VisitCookActions';
import { VisitRebook } from '../components/visit/VisitRebook';
import { VisitStatusBanner } from '../components/visit/VisitStatusBanner';
import { VisitToast } from '../components/visit/VisitToast';
import type { VisitToastHandle } from '../components/visit/VisitToast';
import { visitDemoModel } from '../data/visit';
import type { VisitDetailsModel, VisitPrepKey, VisitPrepReady, VisitVariant } from '../data/visit';

/**
 * Recurring live booking — "Visit details".
 *
 * Source: Figma `cCQlzTeiObQkpVBzwI8mZi` page `1005:131`, one frame per `variant`:
 *   `assigned`  `2165:13847` "Visit details / upcoming · Cook assigned"
 *   `pending`   `2165:13857` "Visit details / upcoming · Cook pending"
 *   `completed` `1466:8639` "Visit details / upcoming · Completed"
 *   `cancelled` `2165:13866` "Visit details / upcoming · Cancelled"
 *
 * Under the `Nav header 2` bar the content runs px 16, pt 8, pb 24 with 24 between blocks:
 * the status banner, then the variant's cook section (`Cook details`, `1466:797` — "the only part
 * of the screen that changes"), and below it:
 *   assigned           — recipe share, the before-arrival checklist (`1444:718`)
 *   pending            — the UPI Autopay explainer (`2165:13863`)
 *   completed          — `ratingSlot` (the rate card, `1517:9295`, built elsewhere), visit charge
 *   cancelled          — the cancelled cook section and the payment & refund summary
 * The `Action dock` (`1444:730`) is the pinned footer; Completed and Cancelled have no "Modify
 * booking".
 *
 * Everything shown comes from `model`: the visit's own (`visitDetailsFrom`) on the real route, or
 * the frame's (`visitDemoModel(variant)`) in the dev preview. Sections the model leaves out (no
 * recipe row, no checklist, no "Modify booking") are not drawn. Call, Share, View Cook Pool and
 * the next-visit row are optional callbacks; the dock's sheets and the Help WhatsApp deep link
 * (`1434:2205`) belong to the caller.
 */
export interface VisitDetailsScreenProps {
  /** What the screen draws. Without it, the frame's content for `variant` and `prepState`. */
  readonly model?: VisitDetailsModel;
  /** The dev preview's frame; ignored when `model` is given. */
  readonly variant?: VisitVariant;
  readonly onBack: () => void;
  readonly onPaymentDetails?: (() => void) | undefined;
  readonly onModifyBooking?: (() => void) | undefined;
  /** Per `1434:2205`: one tap straight to WhatsApp, no in-app sheet. */
  readonly onHelp?: (() => void) | undefined;
  readonly onShareRecipe?: (() => void) | undefined;
  readonly onViewCookPool?: (() => void) | undefined;
  readonly onNextVisit?: (() => void) | undefined;
  /** Completed only — rendered where the rate card sits, 24 under the banner and above the charge. */
  readonly ratingSlot?: ReactNode | undefined;
  /**
   * Cancelled and charged only — the Refund tracker (`2303:4231`, DEC-090) inside Payment &
   * refund, under the breakdown, once the host has the visit's refund. The card's older timeline
   * stands until then.
   */
  readonly refundProgress?: ReactNode | undefined;
  /**
   * Cancelled only — drawn in place of the "Visit cancelled" card: a one-time visit cancelled by
   * Spoon shows its apology card there (`2342:4343`, `@features/serviceVisit`).
   */
  readonly cancelledSlot?: ReactNode | undefined;
  /** How many prep checks start ticked: 0 (`1441:1808`), 1 (`1441:1853`) or 3 (`1441:1898`). */
  readonly prepState?: VisitPrepReady | undefined;
  readonly onPrepChange?: ((checked: readonly VisitPrepKey[]) => void) | undefined;
  /** A past visit (completed or cancelled): start a new Recurring plan. */
  readonly onBookAgain?: (() => void) | undefined;
  /** Shown only when the visit's debit failed: a one-time visit for the same slot. */
  readonly onBookOneTime?: (() => void) | undefined;
  /** Completed only: add this visit's cook to the Pool (only while not in it). */
  readonly onAddCookToPool?: (() => void) | undefined;
  readonly addingCookToPool?: boolean;
  /** Completed only: tip the cook (only while the server allows it). */
  readonly onTipCook?: (() => void) | undefined;
  /** The header title; "Recurring visit" by default, "One-time visit" for a one-time booking. */
  readonly title?: string | undefined;
  /**
   * The action buttons scroll with the page instead of pinning to the bottom — a one-time visit
   * (owner, 2026-10-14). Recurring visits keep the pinned `Action dock` (`1444:730`).
   */
  readonly inlineDock?: boolean | undefined;
  readonly testID?: string | undefined;
}

export function VisitDetailsScreen({
  model: given,
  variant: demoVariant = 'assigned',
  onBack,
  onPaymentDetails,
  onModifyBooking,
  onHelp,
  onShareRecipe,
  onViewCookPool,
  onNextVisit,
  ratingSlot,
  refundProgress,
  cancelledSlot,
  prepState = 0,
  onPrepChange,
  onBookAgain,
  onBookOneTime,
  onAddCookToPool,
  addingCookToPool = false,
  onTipCook,
  title = 'Recurring visit',
  inlineDock = false,
  testID = 'visit-details-screen',
}: VisitDetailsScreenProps) {
  const model = given ?? visitDemoModel(demoVariant, prepState);
  const { variant } = model;
  const upcoming = variant === 'assigned' || variant === 'pending';

  // `Note · Help deep link` — a short toast while WhatsApp opens; the caller opens it.
  const toast = useRef<VisitToastHandle>(null);
  const viaWhatsApp = (open: (() => void) | undefined) =>
    open === undefined
      ? undefined
      : () => {
          toast.current?.show('Opening WhatsApp…');
          open();
        };

  const dock = (
    <ActionDock
      inline={inlineDock}
      showModify={upcoming && model.modifySheet !== null}
      onPaymentDetails={onPaymentDetails}
      onModifyBooking={onModifyBooking}
      onHelp={viaWhatsApp(onHelp)}
      testID={`${testID}-dock`}
    />
  );

  return (
    <View style={styles.root}>
      <Screen
        scroll
        tone="plain"
        testID={testID}
        contentStyle={styles.body}
        header={<VisitHeader title={title} onBack={onBack} testID={`${testID}-header`} />}
        footer={inlineDock ? undefined : dock}
      >
        <VisitStatusBanner
          state={
            variant === 'pending'
              ? 'upcoming'
              : variant === 'assigned'
                ? 'assigned'
                : variant === 'cancelled'
                  ? 'cancelled'
                  : 'completed'
          }
          date={model.banner.date}
          slot={model.banner.slot}
          daysToGo={model.banner.daysToGo}
          toGoLabel={model.banner.toGoLabel}
          testID={`${testID}-banner`}
        />

        {variant === 'assigned' ? (
          // `2165:13847` — no Pool note and no Call before the visit: the card opens on the cook.
          <CookAssignedCard
            cook={{ ...model.cook, note: '' }}
            menu={model.menu}
            testID={`${testID}-cook`}
          />
        ) : null}
        {variant === 'pending' ? (
          <CookPendingCard
            pending={model.pending}
            onViewPool={onViewCookPool}
            testID={`${testID}-cook`}
          />
        ) : null}
        {variant === 'pending' ? <UpiAutopayCard testID={`${testID}-autopay`} /> : null}
        {variant === 'cancelled' && cancelledSlot !== undefined && cancelledSlot !== null ? (
          cancelledSlot
        ) : variant === 'cancelled' ? (
          <VisitCancelledCard
            cancelled={model.cancelled}
            onNextVisit={onNextVisit}
            testID={`${testID}-cook`}
          />
        ) : null}
        {variant === 'completed' ? (ratingSlot ?? null) : null}
        {variant === 'completed' ? (
          <VisitCookActions
            cookName={model.cook.name}
            onAddToPool={onAddCookToPool}
            adding={addingCookToPool}
            onTip={onTipCook}
            testID={`${testID}-cook-actions`}
          />
        ) : null}

        {variant === 'assigned' ? (
          <>
            {model.recipe === null ? null : (
              <RecipeShareRow
                recipe={model.recipe}
                onShare={viaWhatsApp(onShareRecipe)}
                testID={`${testID}-recipe`}
              />
            )}
            {model.prep === null ? null : (
              <BeforeArrivalCard
                prep={model.prep}
                initialChecked={model.prepChecked}
                onChange={onPrepChange}
                testID={`${testID}-prep`}
              />
            )}
          </>
        ) : null}

        {/* Upcoming frames carry no charge card: the price is in Payment details. */}
        {upcoming ? null : model.refund !== null ? (
          <RefundSummaryCard
            refund={model.refund}
            progress={refundProgress}
            testID={`${testID}-refund`}
          />
        ) : (
          <VisitChargeCard charge={model.charge} testID={`${testID}-charge`} />
        )}

        {upcoming ? null : (
          <VisitRebook
            onBookOneTime={model.paymentFailed ? onBookOneTime : undefined}
            onBookAgain={onBookAgain}
            testID={`${testID}-rebook`}
          />
        )}

        {inlineDock ? dock : null}
      </Screen>
      <VisitToast ref={toast} testID={`${testID}-toast`} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  /** `1008:5414` — px 16 (Screen's own), pt 8, pb 24, 24 between blocks. */
  body: {
    paddingTop: lightTheme.space.sm,
    paddingBottom: lightTheme.space.xl,
    gap: lightTheme.space.xl,
  },
});
