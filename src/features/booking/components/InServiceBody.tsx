import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatMinutes } from '@core/format';
import { createServerClock, splitDuration, useCountdown } from '@core/time';
import { CookCard, StatusBanner } from '@ui';
import type { CookViewModel } from '@ui';

import { DETAILS_GLYPH } from './ConfirmationBody';
import { ExtendPromoCard } from './ExtendPromoCard';
import { ServiceHandoverBlock } from './ServiceHandoverBlock';
import { ServiceLinkRow } from './ServiceLinkRow';
import { SERVICE_SECTION_GAP, ServiceSection } from './ServiceSection';
import { cookCardVariantFor } from '../adapters';
import type { InServiceViewModel } from '../types';

/**
 * In service — Figma `101:1812`, and `292:1197` "Page 12b- Cooking extended".
 *
 * `101:1881` stacks its section boxes 16pt apart:
 *   status banner (`292:1035`) → [extended notice] → extension promo (`101:1857`) → End Service +
 *   End OTP (`292:1046`) → cook card (`292:1064`) → details row (`292:1188`).
 *
 * TWO corrections this pass: the frame draws **no "Note before starting" card** on In service —
 * the implementation rendered one — and it DOES draw the `250:2966` details row, which it did not.
 *
 * `292:1197` is this screen with ONE extra block: `292:1399`, a second, compact status banner
 * reading "Booking extended! / End time extended by 20 mins". Its presence is the SERVER
 * reporting the extension took effect; the new end time arrives with it and is never computed
 * from the chosen option.
 *
 * The banner is the SAME component as En route and Arrived — `101:1882` differs from `99:1610`
 * only in its 31pt glyph (a frying pan), its copy and the figure in the 117 × 103 panel. The
 * countdown occupies that panel.
 *
 * The countdown is PRESENTATION ONLY (FRONTEND_FOUNDATION_PLAN.md §19):
 *  - it derives from the server's absolute `endsAtMs`, corrected by the server-reported skew;
 *  - it recomputes on foreground rather than trusting a background timer;
 *  - reaching zero calls `onElapsed`, which REFETCHES authoritative state. It never ends the
 *    session, never advances the booking, and never decides anything.
 *
 * The End OTP is displayed for the user to read out. It is not verified here.
 */
export interface InServiceBodyProps {
  readonly inService: InServiceViewModel;
  readonly cook?: CookViewModel;
  readonly onCallCook?: () => void;
  readonly onExtend: () => void;
  /** Called when the countdown reaches zero. Must refetch, not transition. */
  readonly onElapsed: () => void;
  readonly onViewDetails?: () => void;
}

/**
 * The countdown figure, rounded UP to the whole minute.
 *
 * A 30-minute service opened at "29 mins". Nothing was missing from the booking: `expectedEnd` is
 * `actualStart + purchased duration`, written at the Start OTP, so the full 30:00 is there. The
 * customer's screen simply renders a few seconds after the cook verifies the OTP -- at 29:57 --
 * and truncating that read 29. "30 mins" was only ever displayable in the instant the service
 * began, which no render can catch.
 *
 * Ceiling is what a countdown means. The figure is time REMAINING, so it holds at 30 until a
 * whole minute is actually gone and then ticks to 29; flooring answers a different question
 * ("whole minutes behind us"), which is not what the caption above it promises.
 *
 * `formatOverrun` keeps flooring, deliberately: 29:57 PAST the end is 29 minutes over, and
 * rounding an overrun up would overstate how late a service is running.
 */
function formatRemaining(ms: number): string {
  return formatMinutes(Math.ceil(ms / 60_000));
}

/**
 * The overrun, in the same 122pt box the countdown uses.
 *
 * Hours are broken out where `formatRemaining` does not, and for opposite reasons. A countdown
 * runs to a known end, so "95 mins" is bounded and legible; an overrun has no ceiling -- a session
 * nobody has ended reaches "230 mins", which the box truncates at one line and nobody can read at
 * a glance anyway.
 */
function formatOverrun(ms: number): string {
  const { hours, minutes } = splitDuration(ms);
  return hours === 0 ? formatMinutes(minutes) : `${hours}h ${minutes}m`;
}

export function InServiceBody({
  inService,
  cook,
  onCallCook,
  onExtend,
  onElapsed,
  onViewDetails,
}: InServiceBodyProps) {
  const clock = useMemo(() => createServerClock(inService.clockSkewMs), [inService.clockSkewMs]);
  const { remainingMs, isElapsed, overdueMs } = useCountdown(inService.endsAtMs, clock, {
    onElapsed,
  });

  /**
   * Past the service end, the banner answers a different question.
   *
   * It used to answer the same one badly: `remainingMs` is clamped at zero, so "0 mins" was shown
   * identically one minute over and four hours over, under a title still promising "Time left to
   * service end". The cook cannot end a session until the End OTP is shared, which is displayed
   * directly below -- so this is a state a customer sits in, not an instant they pass through.
   *
   * `isElapsed` is already false when the server has published no end (`endsAtMs === null`), so
   * a booking with nothing to count never reaches the overrun copy.
   */
  const over = isElapsed;

  return (
    <View style={styles.container} testID="in-service-body">
      <ServiceSection>
        <StatusBanner
          title={over ? inService.overrunTitle : inService.statusTitle}
          message={over ? inService.overrunMessage : inService.statusMessage}
          // Warning, not positive: the same amber `292:1399` already uses for the extension notice.
          tone={over ? 'warning' : 'positive'}
          highlight={over ? formatOverrun(overdueMs) : formatRemaining(remainingMs)}
          testID="in-service-banner"
        />
      </ServiceSection>

      {/* `292:1399` — only `292:1197` draws this, and only because the server says so. */}
      {inService.extendedNotice === undefined ? null : (
        <ServiceSection>
          <StatusBanner
            title={inService.extendedNotice.title}
            message={inService.extendedNotice.body}
            tone="warning"
            layout="heroCompact"
            icon="checkCircle"
            testID="in-service-extended"
          />
        </ServiceSection>
      )}

      <ServiceSection>
        <ExtendPromoCard
          prompt={inService.extendPrompt}
          ctaLabel={inService.extendCtaLabel}
          onExtend={onExtend}
          testID="in-service-extend"
        />
      </ServiceSection>

      <ServiceSection>
        <ServiceHandoverBlock
          ctaLabel={inService.endCtaLabel}
          otpCode={inService.otpCode}
          otpTitle={inService.otpTitle}
          otpCaption={inService.otpCaption}
          tone="end"
          testID="in-service-handover"
        />
      </ServiceSection>

      {cook === undefined ? null : (
        <ServiceSection>
          <CookCard
            cook={cook}
            variant={cookCardVariantFor(cook.profileVariant)}
            {...(onCallCook === undefined ? {} : { onCallCook })}
            testID="in-service-cook"
          />
        </ServiceSection>
      )}

      {onViewDetails === undefined ? null : (
        <ServiceSection>
          <ServiceLinkRow
            label={inService.viewDetailsLabel}
            glyph={DETAILS_GLYPH}
            glyphOffset={-1.04}
            onPress={onViewDetails}
            testID="in-service-view-details"
          />
        </ServiceSection>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /** `101:1881` — the section BOXES sit 16pt apart, matching every other service frame. */
  container: { gap: SERVICE_SECTION_GAP },
});
