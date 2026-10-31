import { useRef } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import {
  ActionDock,
  BeforeArrivalCard,
  CookAssignedCard,
  RecipeShareRow,
  VisitHeader,
  VisitToast,
  visitDemoModel,
} from '@features/recurringLive';
import type {
  VisitCookData,
  VisitMenuSection,
  VisitPrepKey,
  VisitToastHandle,
} from '@features/recurringLive';
import { Screen } from '@ui';

import {
  ArrivalTile,
  BriefCookCard,
  CleanupCard,
  CookingTimer,
  EndOtpCard,
  ExtendCard,
  HeroSection,
  ServiceBanner,
  StartOtpCard,
  TipCard,
} from './components';
import type { BriefKey } from './components';
import { CookArrivalNote, CookReassignedNote } from './notices';
import { MOST_TIPPED_PAISE } from './model';
import type { ExtendChoice, ServicePhase } from './model';

/**
 * Visit details through the service — Figma "Service flow" (`2165:11841`). One screen whose
 * blocks change with the phase (see `model.ts`); everything shown comes from `model`.
 *
 *   assigned   banner (date, slot) · [cook reassigned note | cook early/late note] · cook card ·
 *              recipe share · before-arrival checklist
 *   onTheWay   banner (time, length) · arrival tile · cook card with Call · checklist · recipe
 *   arrived    banner · Start OTP · "Brief your cook" · cook card with Call · recipe
 *   cooking    hero wave · banner · countdown · Extend · clean-up scope · End OTP
 *   timesUp    hero wave · banner · 0:00 · "Wrap up" End OTP · Extend · clean-up scope
 *   completed  banner (date, slot) · rate card · tip card
 *
 * The action dock carries Payment details and Help, and Modify booking while the visit is still
 * ahead (assigned, on the way).
 */
export interface ServiceVisitModel {
  readonly phase: ServicePhase;
  /**
   * A one-time visit whose cook was swapped before the trip (`2353:17562`): while `assigned`, the
   * "Sorry, we have assigned you another cook" note sits above the cook card.
   */
  readonly reassigned?: boolean | undefined;
  /**
   * While `assigned`: the cook is due up to 15 minutes early or 10 late against the booked start
   * (`2878:7730` / `2878:7959`). The note sits where the reassigned one does.
   */
  readonly cookArrival?: 'early' | 'late' | null | undefined;
  readonly title: string;
  /** Assigned/completed: "Wed, 14 Oct"; live: "9:00 AM · 1 hr". */
  readonly bannerTitle: string;
  readonly bannerSlot: string | null;
  readonly cook: VisitCookData;
  readonly menu: readonly VisitMenuSection[];
  readonly cookName: string | null;
  readonly cookPhoto: ImageSourcePropType | null;
  readonly prepChecked: readonly VisitPrepKey[];
  readonly arrival: {
    readonly by: string | null;
    readonly minutes: number | null;
    readonly onTime: boolean;
  };
  readonly arrivedAt: string | null;
  readonly startOtp: readonly string[] | null;
  readonly endOtp: readonly string[] | null;
  readonly minutesLeft: number;
  readonly endsAt: string | null;
  readonly startedAt: string | null;
  readonly extendChoices: readonly ExtendChoice[];
  readonly extendedMinutes: number;
  readonly freeTill: string | null;
  readonly tipPaid: { readonly amountPaise: number; readonly when: string } | null;
  readonly canTip: boolean;
}

export interface ServiceVisitScreenProps {
  readonly model: ServiceVisitModel;
  readonly onBack: () => void;
  readonly onPaymentDetails: () => void;
  readonly onModifyBooking?: (() => void) | undefined;
  readonly onHelp?: (() => void) | undefined;
  readonly onCall?: (() => void) | undefined;
  readonly onShareRecipe?: (() => void) | undefined;
  readonly onPrepChange?: ((checked: readonly VisitPrepKey[]) => void) | undefined;
  readonly briefChecked: readonly BriefKey[];
  readonly onBriefToggle: (key: BriefKey) => void;
  readonly extending: boolean;
  readonly onExtend: (minutes: number) => void;
  readonly onBookAnother: () => void;
  readonly ratingSlot?: ReactNode;
  /** A rating of 4 or more is picked: the tip card opens on the Most tipped amount (`2165:14105`). */
  readonly ratedHigh?: boolean;
  readonly tipping: boolean;
  readonly onTip: (amountPaise: number) => void;
  readonly testID?: string;
}

const COPY = visitDemoModel('assigned');

export function ServiceVisitScreen({
  model,
  onBack,
  onPaymentDetails,
  onModifyBooking,
  onHelp,
  onCall,
  onShareRecipe,
  onPrepChange,
  briefChecked,
  onBriefToggle,
  extending,
  onExtend,
  onBookAnother,
  ratingSlot,
  ratedHigh = false,
  tipping,
  onTip,
  testID = 'service-visit',
}: ServiceVisitScreenProps) {
  const { phase } = model;
  const toast = useRef<VisitToastHandle>(null);
  const viaWhatsApp = (open: (() => void) | undefined) =>
    open === undefined
      ? undefined
      : () => {
          toast.current?.show('Opening WhatsApp…');
          open();
        };
  const ahead = phase === 'assigned' || phase === 'onTheWay';
  const live = phase === 'cooking' || phase === 'timesUp';

  const banner = (
    <ServiceBanner
      state={
        phase === 'assigned'
          ? 'assigned'
          : phase === 'onTheWay'
            ? 'arriving'
            : phase === 'arrived'
              ? 'arrived'
              : phase === 'cooking'
                ? 'inProgress'
                : phase === 'timesUp'
                  ? 'timesUp'
                  : 'completed'
      }
      title={model.bannerTitle}
      slot={model.bannerSlot}
      testID={`${testID}-banner`}
    />
  );
  const cookCard = (withCall: boolean, windowHeight?: number) => (
    <CookAssignedCard
      cook={model.cook}
      menu={model.menu}
      onCall={withCall ? onCall : undefined}
      windowHeight={windowHeight}
      testID={`${testID}-cook`}
    />
  );
  const recipe =
    COPY.recipe === null ? null : (
      <RecipeShareRow
        recipe={COPY.recipe}
        onShare={viaWhatsApp(onShareRecipe)}
        testID={`${testID}-recipe`}
      />
    );
  const prep =
    COPY.prep === null ? null : (
      <BeforeArrivalCard
        prep={{
          ...COPY.prep,
          allSet:
            model.cookName === null
              ? 'Kitchen’s ready! Your cook can start cooking the moment they arrive.'
              : `Kitchen’s ready! ${model.cookName} can start cooking the moment she walks in.`,
        }}
        initialChecked={model.prepChecked}
        onChange={onPrepChange}
        testID={`${testID}-prep`}
      />
    );
  const extend = (
    <ExtendCard
      choices={model.extendChoices}
      extendedMinutes={model.extendedMinutes}
      endsAt={model.endsAt}
      // Time's up (`2165:12117`) draws "Need more time?" without the "free till" line.
      freeTill={phase === 'timesUp' ? null : model.freeTill}
      cookName={model.cookName}
      extending={extending}
      onExtend={onExtend}
      onPaymentDetails={onPaymentDetails}
      onBookAnother={onBookAnother}
      testID={`${testID}-extend`}
    />
  );
  const endOtp =
    model.endOtp === null ? null : (
      <EndOtpCard digits={model.endOtp} wrapUp={phase === 'timesUp'} testID={`${testID}-end-otp`} />
    );

  return (
    <View style={styles.root}>
      <Screen
        scroll
        tone="plain"
        testID={testID}
        contentStyle={styles.body}
        header={<VisitHeader title={model.title} onBack={onBack} testID={`${testID}-header`} />}
      >
        {live ? null : banner}

        {phase === 'assigned' ? (
          <>
            {model.reassigned === true ? (
              <CookReassignedNote testID={`${testID}-reassigned`} />
            ) : model.cookArrival === 'early' || model.cookArrival === 'late' ? (
              <CookArrivalNote arrival={model.cookArrival} testID={`${testID}-arrival-note`} />
            ) : null}
            {cookCard(false)}
            {recipe}
            {prep}
          </>
        ) : null}

        {phase === 'onTheWay' ? (
          <>
            <ArrivalTile {...model.arrival} testID={`${testID}-arrival`} />
            {cookCard(true)}
            {prep}
            {recipe}
          </>
        ) : null}

        {phase === 'arrived' ? (
          <>
            {model.startOtp === null ? null : (
              <StartOtpCard
                arrivedAt={model.arrivedAt}
                digits={model.startOtp}
                testID={`${testID}-start-otp`}
              />
            )}
            <BriefCookCard
              checked={briefChecked}
              onToggle={onBriefToggle}
              testID={`${testID}-brief`}
            />
            {cookCard(true, 372)}
            {recipe}
          </>
        ) : null}

        {phase === 'cooking' ? (
          <>
            <HeroSection>
              {banner}
              <CookingTimer
                minutesLeft={model.minutesLeft}
                endsAt={model.endsAt}
                startedAt={model.startedAt}
                testID={`${testID}-timer`}
              />
            </HeroSection>
            {extend}
            <CleanupCard testID={`${testID}-cleanup`} />
            {endOtp}
          </>
        ) : null}

        {phase === 'timesUp' ? (
          <>
            <HeroSection>
              {banner}
              <CookingTimer
                minutesLeft={0}
                endsAt={model.endsAt}
                startedAt={model.startedAt}
                testID={`${testID}-timer`}
              />
            </HeroSection>
            {endOtp}
            {extend}
            <CleanupCard testID={`${testID}-cleanup`} />
          </>
        ) : null}

        {phase === 'completed' ? (
          <>
            {ratingSlot ?? null}
            {model.canTip || model.tipPaid !== null ? (
              <TipCard
                cookName={model.cookName}
                cookPhoto={model.cookPhoto}
                paid={model.tipPaid}
                paying={tipping}
                onPay={onTip}
                suggestedPaise={ratedHigh ? MOST_TIPPED_PAISE : null}
                testID={`${testID}-tip`}
              />
            ) : null}
          </>
        ) : null}

        {/* The buttons scroll with the page on a one-time visit (owner, 2026-10-14). */}
        <ActionDock
          inline
          showModify={ahead && onModifyBooking !== undefined}
          onPaymentDetails={onPaymentDetails}
          onModifyBooking={onModifyBooking}
          onHelp={viaWhatsApp(onHelp)}
          testID={`${testID}-dock`}
        />
      </Screen>
      <VisitToast ref={toast} testID={`${testID}-toast`} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  /** Content runs px 16 (Screen's own), pt 8, pb 24, 24 between blocks — as the visit frames. */
  body: { paddingTop: 8, paddingBottom: 24, gap: 24 },
});
