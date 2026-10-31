import { useState } from 'react';
import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { C, SHADOW_1, SHADOW_2, T, gradientAngle } from '@ui/v2/theme';

import { SERVICE_ART } from './art';
import {
  MOST_TIPPED_PAISE,
  TIP_AMOUNTS_PAISE,
  defaultExtendMinutes,
  rupees,
  timerDigits,
} from './model';
import type { ExtendChoice } from './model';

/** `color/status/positive-subtle`, `color/status/positive-pressed`. */
const POSITIVE_SUBTLE = '#ECFF9B';
const POSITIVE_PRESSED = '#E2FF68';

/* --------------------------------------------------------------------------- Status banner */

export type ServiceBannerState =
  'assigned' | 'arriving' | 'arrived' | 'inProgress' | 'timesUp' | 'completed';

const BANNER: Record<ServiceBannerState, { icon: ImageSourcePropType; label: string }> = {
  assigned: { icon: SERVICE_ART.stateAssigned, label: 'ASSIGNED' },
  arriving: { icon: SERVICE_ART.stateArriving, label: 'ARRIVING' },
  arrived: { icon: SERVICE_ART.stateArrived, label: 'ARRIVED' },
  inProgress: { icon: SERVICE_ART.stateInProgress, label: 'IN PROGRESS' },
  timesUp: { icon: SERVICE_ART.stateTimesUp, label: 'TIME’S UP' },
  completed: { icon: SERVICE_ART.check, label: 'COMPLETED' },
};

/**
 * `Status banner/ recurring/ past` (`1461:6083`) in its visit states: the morning sky with a white
 * status disc. Before and after the visit it carries the date over the slot (`2165:11847`); while
 * the visit is live it is one line, "9:00 AM · 1 hr" (`2165:11919`).
 */
export function ServiceBanner({
  state,
  title,
  slot,
  testID,
}: {
  state: ServiceBannerState;
  title: string;
  slot?: string | null;
  testID: string;
}) {
  const badge = BANNER[state];
  return (
    <View style={[styles.banner, SHADOW_1]} testID={testID}>
      <LinearGradient colors={['#FFF9DB', '#FFD9A8']} style={StyleSheet.absoluteFill} />
      <Image source={SERVICE_ART.skyHalo3} style={styles.halo3} />
      <Image source={SERVICE_ART.skyHalo2} style={styles.halo2} />
      <Image source={SERVICE_ART.skySun} style={styles.sun} />
      <Image source={SERVICE_ART.skyCloudA} style={styles.cloudA} />
      <Image source={SERVICE_ART.skyCloudB} style={styles.cloudB} />
      <View style={styles.bannerRow}>
        <View style={styles.flexText4}>
          <Text style={styles.displayLarge}>{title}</Text>
          {slot === undefined || slot === null ? null : (
            <Text style={styles.bodyStrong}>{slot}</Text>
          )}
        </View>
        <View
          style={[
            styles.badgeBox,
            slot === undefined || slot === null ? null : styles.badgeBoxTall,
          ]}
        >
          <View style={styles.badgeDisc}>
            <Image source={badge.icon} style={styles.icon20} />
          </View>
          <Text style={styles.badgeLabel} numberOfLines={1}>
            {badge.label}
          </Text>
        </View>
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------------------- Arrival tile */

/** `C · Timer tile` (`1872:13133`, late `1887:13293`): "Cook arriving by", the pill, minutes. */
export function ArrivalTile({
  by,
  minutes,
  onTime,
  testID,
}: {
  by: string | null;
  minutes: number | null;
  onTime: boolean;
  testID: string;
}) {
  return (
    <View style={styles.arrival} testID={testID}>
      <LinearGradient
        colors={['#FFF7CC', '#FFE666']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.arrivalBand}
      >
        <Image source={SERVICE_ART.tileHaloA} style={styles.tileHaloA} />
        <Image source={SERVICE_ART.tileHaloB} style={styles.tileHaloB} />
        <View style={styles.flexText4}>
          <Text style={styles.captionSecondary}>Cook arriving by</Text>
          <Text style={styles.display}>{by ?? '—'}</Text>
          <View style={[styles.pill, onTime ? styles.pillOnTime : styles.pillLate]}>
            <Text style={styles.captionStrong}>{onTime ? 'On time' : 'Running late'}</Text>
          </View>
        </View>
      </LinearGradient>
      <View style={[styles.minutesFrame, SHADOW_1]}>
        <Text style={styles.minutes} testID={`${testID}-minutes`}>
          {minutes === null ? '—' : String(minutes)}
        </Text>
        <Text style={styles.microStrongSecondary}>MIN</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------------------------- OTPs */

function OtpBand({
  eyebrow,
  title,
  digits,
}: {
  eyebrow: string;
  title: string;
  digits: readonly string[];
}) {
  return (
    <LinearGradient
      colors={['#FFF7CC', '#FFE666']}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.otpBand}
    >
      <Image source={SERVICE_ART.tileHaloA} style={styles.otpHaloA} />
      <Image source={SERVICE_ART.tileHaloB} style={styles.otpHaloB} />
      <View style={styles.flexText}>
        <Text style={styles.microStrongSecondary}>{eyebrow}</Text>
        <Text style={styles.bodyStrong}>{title}</Text>
      </View>
      <View style={styles.otpDigits}>
        {digits.map((digit, index) => (
          <View key={String(index)} style={[styles.otpDigit, SHADOW_1]}>
            <Text style={styles.otpText}>{digit}</Text>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
}

/** `2165:11931` — "Arrived at 8:56 AM" over the Start OTP band. */
export function StartOtpCard({
  arrivedAt,
  digits,
  testID,
}: {
  arrivedAt: string | null;
  digits: readonly string[];
  testID: string;
}) {
  return (
    <View style={styles.otpCard} testID={testID}>
      <View style={styles.arrivedRow}>
        <Text style={styles.emphasis}>
          {arrivedAt === null ? 'Your cook has arrived' : `Arrived at ${arrivedAt}`}
        </Text>
        <Text style={styles.captionSecondary}>Cook will reach your doorstep shortly</Text>
      </View>
      <OtpBand eyebrow="START OTP" title="Share to begin" digits={digits} />
    </View>
  );
}

/**
 * `2165:12053` — the End OTP band; `2165:12147` once time is up: a 2pt `#FFD600` border, the
 * exclamation, "Wrap up the visit now" and why.
 */
export function EndOtpCard({
  digits,
  wrapUp,
  testID,
}: {
  digits: readonly string[];
  wrapUp: boolean;
  testID: string;
}) {
  if (!wrapUp) {
    return (
      <View style={[styles.otpCard, styles.endOtpCard]} testID={testID}>
        <OtpBand eyebrow="END OTP" title="Share to end" digits={digits} />
      </View>
    );
  }
  return (
    <View style={[styles.wrapUp, SHADOW_2]} testID={testID}>
      <View style={styles.wrapUpHeader}>
        <Image source={SERVICE_ART.exclamation} style={styles.icon24} />
        {/* One line, as `2165:12150` draws it: Android measured it a hair narrow and wrapped "now". */}
        <Text style={styles.title} numberOfLines={1} textBreakStrategy="simple">
          Wrap up the visit now
        </Text>
      </View>
      <Text style={styles.captionPrimary}>
        Stretching the booking beyond paid time delays the cook’s schedule and affects her
        performance & earnings
      </Text>
      <OtpBand eyebrow="END OTP" title="Share to end" digits={digits} />
    </View>
  );
}

/* ------------------------------------------------------------------------ Brief your cook */

const BRIEF_ITEMS = [
  { key: 'menu', label: 'All at once', hint: 'Dishes & portions', icon: SERVICE_ART.briefDish },
  { key: 'time', label: 'Fits duration', hint: 'Realistic menu', icon: SERVICE_ART.briefClock },
  {
    key: 'needs',
    label: 'Special needs',
    hint: 'Utensils, ingredients',
    icon: SERVICE_ART.briefPot,
  },
] as const;

export type BriefKey = (typeof BRIEF_ITEMS)[number]['key'];

/**
 * `2165:11951` Prep checklist · After arrival — optional ticks that never block the flow
 * (dev note `2165:12396`). Checked uses `status/positive`, as the before-arrival checks do.
 */
export function BriefCookCard({
  checked,
  onToggle,
  testID,
}: {
  checked: readonly BriefKey[];
  onToggle: (key: BriefKey) => void;
  testID: string;
}) {
  return (
    <View style={styles.brief} testID={testID}>
      <View style={styles.briefHeader}>
        <Text style={styles.heading}>Brief your cook</Text>
        <View style={styles.counter}>
          <Text style={styles.captionStrong}>{`${String(checked.length)}/3 done`}</Text>
        </View>
      </View>
      <View style={styles.progress}>
        {BRIEF_ITEMS.map((item, index) => (
          <View
            key={item.key}
            style={[styles.segment, index < checked.length ? styles.segmentOn : styles.segmentOff]}
          />
        ))}
      </View>
      <View style={styles.checks}>
        {BRIEF_ITEMS.map((item) => {
          const on = checked.includes(item.key);
          return (
            <Pressable
              key={item.key}
              onPress={() => onToggle(item.key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={[styles.check, on && styles.checkOn]}
              testID={`${testID}-${item.key}`}
            >
              <View style={styles.checkTop}>
                <View style={[styles.checkWell, on && styles.checkWellOn]}>
                  <Image source={item.icon} style={styles.icon24} />
                </View>
                {on ? (
                  <View style={styles.checkTick}>
                    <Image source={SERVICE_ART.doneRound} style={styles.icon16} />
                  </View>
                ) : (
                  <Image source={SERVICE_ART.checkOff} style={styles.icon24} />
                )}
              </View>
              <View style={styles.flexText}>
                <Text style={styles.captionStrong}>{item.label}</Text>
                <Text style={styles.microSecondary}>{item.hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.captionSecondary}>
        Share it all in the first few minutes: the full menu with portions, sized to your booked
        time, plus any must-use utensils or ingredients.
      </Text>
    </View>
  );
}

/* --------------------------------------------------------------------------- Cooking hero */

/**
 * `2165:11960` — the yellow wave and halos behind the banner and timer: a background layer of the
 * header area, not a layout block. The section bleeds to the screen edges (cancelling the screen's
 * 16pt gutter) so the wave runs edge to edge, and pads its own content back in.
 */
export function HeroSection({ children }: { children: ReactNode }) {
  return (
    <View style={styles.heroSection}>
      <View style={styles.hero} pointerEvents="none">
        <Image source={SERVICE_ART.heroWave} style={styles.wave} />
        <Image source={SERVICE_ART.heroHaloA} style={styles.heroHaloA} />
        <Image source={SERVICE_ART.heroHaloB} style={styles.heroHaloB} />
        <Image source={SERVICE_ART.heroHaloC} style={styles.heroHaloC} />
      </View>
      {children}
    </View>
  );
}

/** `2165:11967` / `2165:12127` — H : MM tiles; "Ends at … · Started at …" or "Time is up!". */
export function CookingTimer({
  minutesLeft,
  endsAt,
  startedAt,
  testID,
}: {
  minutesLeft: number;
  endsAt: string | null;
  startedAt: string | null;
  testID: string;
}) {
  const up = minutesLeft <= 0;
  const digits = timerDigits(Math.max(0, minutesLeft));
  return (
    <View style={styles.timer} testID={testID}>
      {/* One line, `simple` breaking: Android measures Livvic a hair narrower than it draws it,
          and the last word wrapped onto a hidden line ("… · time"), as on the Account labels. */}
      <Text style={styles.captionStrongSecondary} numberOfLines={1} textBreakStrategy="simple">
        {up ? 'Time’s up · cooking slot has ended' : 'Service in progress · time left'}
      </Text>
      <View style={styles.clock}>
        <View style={styles.clockUnit}>
          <Tile digit={digits.hours} />
          <Text style={styles.microStrongSecondary}>HR</Text>
        </View>
        <View style={styles.colon}>
          <Text style={styles.colonText}>:</Text>
        </View>
        <View style={styles.clockUnit}>
          <View style={styles.tilePair}>
            <Tile digit={digits.tens} />
            <Tile digit={digits.units} />
          </View>
          <Text style={styles.microStrongSecondary}>MIN</Text>
        </View>
      </View>
      {up ? (
        <View style={[styles.ends, styles.endsUp]}>
          <Text style={styles.bodyStrong}>Time is up!</Text>
        </View>
      ) : (
        <View style={styles.ends}>
          <Text style={styles.bodyStrong}>
            {endsAt === null ? 'Ends soon' : `Ends at ${endsAt}`}
          </Text>
          {startedAt === null ? null : (
            <Text style={styles.captionSecondary}>{`·  Started at ${startedAt}`}</Text>
          )}
        </View>
      )}
    </View>
  );
}

function Tile({ digit }: { digit: string }) {
  return (
    <View style={[styles.tile, SHADOW_2]}>
      <Text style={styles.tileText}>{digit}</Text>
    </View>
  );
}

/* ----------------------------------------------------------------------------- Extend card */

/**
 * `Extend card` — Default `2165:11988` / Limited / Unavailable `2165:12234` / Extended
 * `2165:12235` / Extended · max `2165:12236`. Options come from the cook's next booking; the
 * server's list decides which steps are offered (others read "Not free").
 */
export function ExtendCard({
  choices,
  extendedMinutes,
  endsAt,
  freeTill,
  cookName,
  extending,
  onExtend,
  onPaymentDetails,
  onBookAnother,
  testID,
}: {
  choices: readonly ExtendChoice[];
  extendedMinutes: number;
  endsAt: string | null;
  freeTill: string | null;
  cookName: string | null;
  extending: boolean;
  onExtend: (minutes: number) => void;
  onPaymentDetails?: (() => void) | undefined;
  onBookAnother: () => void;
  testID: string;
}) {
  const fallback = defaultExtendMinutes(choices);
  const [picked, setPicked] = useState<number | null>(null);
  const selected =
    picked !== null && choices.some((choice) => choice.minutes === picked && choice.available)
      ? picked
      : fallback;
  const offered = choices.some((choice) => choice.available);
  const chosen = choices.find((choice) => choice.minutes === selected) ?? null;
  const title = offered
    ? 'Need more time?'
    : extendedMinutes > 0
      ? 'That’s all her time today'
      : 'Can’t extend this visit';

  return (
    <View style={[styles.extend, SHADOW_2]} testID={testID}>
      {extendedMinutes > 0 ? (
        <View style={styles.extended} testID={`${testID}-extended`}>
          <Image source={SERVICE_ART.extendedBadge} style={styles.icon44} />
          <View style={styles.flexText}>
            <Text style={styles.emphasis}>{`Extended by ${String(extendedMinutes)} mins`}</Text>
            {endsAt === null ? null : (
              <Text style={styles.captionSecondary}>{`Now ends at ${endsAt}`}</Text>
            )}
          </View>
        </View>
      ) : null}
      <View style={styles.extendHeader}>
        <View style={styles.positiveWell}>
          <Image source={SERVICE_ART.timeAdd} style={styles.icon24} />
        </View>
        <View style={styles.flexText}>
          <Text style={styles.heading}>{title}</Text>
          {offered && extendedMinutes === 0 && freeTill !== null ? (
            <Text style={styles.captionSecondary}>
              {`${cookName ?? 'Your cook'} is free till ${freeTill}`}
            </Text>
          ) : null}
        </View>
      </View>
      <View>
        <View style={styles.choices}>
          {choices.map((choice) => {
            const on = choice.available && choice.minutes === selected;
            return (
              <Pressable
                key={choice.minutes}
                onPress={() => (choice.available ? setPicked(choice.minutes) : undefined)}
                disabled={!choice.available || extending}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: !choice.available }}
                style={[
                  styles.choice,
                  !choice.available
                    ? styles.choiceOff
                    : on
                      ? [styles.choiceOn, SHADOW_1]
                      : styles.choiceIdle,
                ]}
                testID={`${testID}-${String(choice.minutes)}`}
              >
                <Text style={[styles.button, !choice.available && styles.textDisabled]}>
                  {`+${String(choice.minutes)} mins`}
                </Text>
                <Text style={[styles.captionSecondary, !choice.available && styles.textDisabled]}>
                  {choice.available ? rupees(choice.totalPaise) : 'Not free'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {offered && choices.some((choice) => choice.minutes === 20 && choice.available) ? (
          <View style={styles.popular} pointerEvents="none">
            <Text style={styles.microStrong}>Popular</Text>
          </View>
        ) : null}
      </View>
      {offered && chosen !== null ? (
        <View style={styles.extendFoot}>
          <Pressable
            onPress={() => onExtend(chosen.minutes)}
            disabled={extending}
            accessibilityRole="button"
            accessibilityState={{ busy: extending }}
            style={({ pressed }) => [styles.extendButton, pressed && styles.pressed]}
            testID={`${testID}-cta`}
          >
            <Image source={SERVICE_ART.timeAdd} style={styles.icon24} />
            <Text style={styles.button}>
              {extending ? 'Extending…' : `Extend · ${rupees(chosen.totalPaise)}`}
            </Text>
          </Pressable>
          {onPaymentDetails === undefined ? null : (
            <Pressable onPress={onPaymentDetails} accessibilityRole="link" hitSlop={6}>
              <Text style={styles.linkSecondary}>Check payment details</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <Pressable
          onPress={onBookAnother}
          accessibilityRole="button"
          style={({ pressed }) => [styles.bookAnother, pressed && styles.pressed]}
          testID={`${testID}-book-another`}
        >
          <Image source={SERVICE_ART.calendarAdd} style={styles.icon24} />
          <Text style={styles.button}>Book another visit</Text>
        </Pressable>
      )}
    </View>
  );
}

/* ----------------------------------------------------------------------- Clean-up scope */

const INCLUDED = [
  {
    title: 'Washes the prep tools',
    body: 'Knives, chopping boards, belan-chakla, graters/okhlis, strainers',
  },
  { title: 'Wipes the counter and stove', body: 'Kitchen slab, back wall and stove' },
];
const NOT_INCLUDED = [
  { title: 'Cooking vessels', body: 'Metal, clay or ceramic pots and pans' },
  { title: 'Floors, cabinets or drawers', body: 'No mopping or cupboard cleaning' },
  {
    title: 'Tasks other than cooking',
    body: 'Filling water bottles, arranging kitchen items etc.',
  },
];

/** `2165:12012` — "What she'll clean up": what is included and what is not. */
export function CleanupCard({ testID }: { testID: string }) {
  return (
    <View style={styles.cleanup} testID={testID}>
      <View style={styles.flexText}>
        <Text style={styles.title}>What she’ll clean up</Text>
        <Text style={styles.captionSecondary}>Keeps your visit time for cooking</Text>
      </View>
      <View style={styles.scope}>
        <View style={styles.scopeGroup}>
          <Text style={styles.microStrongSecondary}>INCLUDED</Text>
          {INCLUDED.map((row) => (
            <ScopeRow key={row.title} {...row} included />
          ))}
        </View>
        <View style={styles.divider} />
        <View style={styles.scopeGroup}>
          <Text style={styles.microStrongSecondary}>NOT INCLUDED</Text>
          {NOT_INCLUDED.map((row) => (
            <ScopeRow key={row.title} {...row} included={false} />
          ))}
        </View>
      </View>
    </View>
  );
}

function ScopeRow({ title, body, included }: { title: string; body: string; included: boolean }) {
  return (
    <View style={styles.scopeRow}>
      <View style={[styles.scopeWell, included ? styles.scopeWellOn : styles.scopeWellOff]}>
        <Image
          source={included ? SERVICE_ART.doneRound : SERVICE_ART.close}
          style={styles.icon20}
        />
      </View>
      <View style={styles.flexText}>
        <Text style={styles.bodyStrong}>{title}</Text>
        <Text style={styles.captionSecondary}>{body}</Text>
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------------------------- Tip card */

/**
 * `Tip card` (`2216:4327`): Default — nothing picked, the CTA disabled; Selected — "Pay tip"
 * (`2165:14105`; the amount is the lit chip, not repeated on the button);
 * "Other" turns into a ₹ input; Paid (`2216:4368`) — the confirmation and thank-you strip.
 *
 * Rated 4+ (`2165:14105`, dev note `2165:14445`): once the customer gives 4 or more, the card
 * opens on the Most tipped amount (`suggestedPaise`) until they pick one themselves.
 */
/** `2216:4327` — `linear-gradient(157.14deg, …)`. */
const TIP_GRADIENT = gradientAngle(157.14);

export function TipCard({
  cookName,
  cookPhoto,
  paid,
  paying,
  onPay,
  suggestedPaise = null,
  testID,
}: {
  cookName: string | null;
  cookPhoto: ImageSourcePropType | null;
  paid: { readonly amountPaise: number; readonly when: string } | null;
  paying: boolean;
  onPay: (amountPaise: number) => void;
  /** Preselected until the customer picks — the Most tipped amount after a 4+ rating. */
  suggestedPaise?: number | null;
  testID: string;
}) {
  const [chosen, setPicked] = useState<number | 'other' | null>(null);
  const picked = chosen ?? suggestedPaise;
  const [other, setOther] = useState('');
  const name = cookName ?? 'your cook';
  const otherPaise = /^\d+$/.test(other) ? Number(other) * 100 : 0;
  const amount = picked === 'other' ? otherPaise : picked;

  return (
    // The shadow lives on an outer view: on iOS a shadow on the clipping view itself stops the
    // clip, and the gradient then paints square past the 24pt corners (`2216:4327`).
    <View style={[styles.tipShadow, SHADOW_1]} testID={testID}>
      <LinearGradient
        colors={['#FFF4C2', '#FFFBEA', '#FFFFFF']}
        locations={[0.14, 0.54, 0.86]}
        start={TIP_GRADIENT.start}
        end={TIP_GRADIENT.end}
        style={styles.tip}
      >
        <Image source={SERVICE_ART.tipDeco} style={styles.tipDeco} />
        <View style={styles.tipHeader}>
          <TipPhoto photo={cookPhoto} />
          <View style={styles.flexText}>
            <Text style={styles.emphasis}>
              {paid === null
                ? `Make ${name}’s day with a tip`
                : `${rupees(paid.amountPaise)} tip sent to ${name}`}
            </Text>
            <Text style={styles.captionSecondary}>
              {paid === null ? 'Every rupee goes straight to her' : paid.when}
            </Text>
          </View>
          {paid === null ? null : (
            <View style={styles.paidCheck}>
              <Image source={SERVICE_ART.doneRound} style={styles.icon18} />
            </View>
          )}
        </View>
        {paid === null ? (
          <>
            <View style={styles.tipAmounts}>
              {TIP_AMOUNTS_PAISE.map((value) => (
                <TipPill
                  key={value}
                  label={rupees(value)}
                  on={picked === value}
                  popular={value === MOST_TIPPED_PAISE}
                  onPress={() => setPicked(value)}
                  testID={`${testID}-${String(value / 100)}`}
                />
              ))}
              {picked === 'other' ? (
                <View style={[styles.tipPill, styles.tipPillOn]}>
                  {/* The "₹" is part of the field so "₹" and the amount centre together in the
                      pill, like the amounts beside it (device test, 31 Oct 2026). */}
                  <TextInput
                    value={`₹${other}`}
                    onChangeText={(text) => setOther(text.replace(/\D/g, '').slice(0, 5))}
                    keyboardType="number-pad"
                    autoFocus
                    style={styles.tipInput}
                    testID={`${testID}-other-input`}
                  />
                </View>
              ) : (
                <TipPill
                  label="Other"
                  on={false}
                  popular={false}
                  onPress={() => setPicked('other')}
                  testID={`${testID}-other`}
                />
              )}
            </View>
            <Pressable
              onPress={() => (amount === null || amount === 0 ? undefined : onPay(amount))}
              disabled={amount === null || amount === 0 || paying}
              accessibilityRole="button"
              accessibilityState={{ disabled: amount === null || amount === 0, busy: paying }}
              style={({ pressed }) => [
                styles.tipCta,
                amount === null || amount === 0 ? styles.tipCtaOff : styles.tipCtaOn,
                pressed && styles.pressed,
              ]}
              testID={`${testID}-pay`}
            >
              <Text
                style={[styles.button, (amount === null || amount === 0) && styles.textDisabled]}
              >
                {amount === null || amount === 0
                  ? 'Pick an amount to say thanks'
                  : paying
                    ? 'Opening payment…'
                    : 'Pay tip'}
              </Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.thanks}>
            <Image source={SERVICE_ART.favoriteFill} style={styles.icon20} />
            <Text style={[styles.captionPrimary, styles.flex]}>
              {`Thank you, you just made ${name}’s day!`}
            </Text>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

function TipPhoto({ photo }: { photo: ImageSourcePropType | null }): ReactNode {
  if (photo === null) return <View style={[styles.tipPhoto, styles.tipPhotoBlank]} />;
  return <Image source={photo} style={styles.tipPhoto} />;
}

function TipPill({
  label,
  on,
  popular,
  onPress,
  testID,
}: {
  label: string;
  on: boolean;
  popular: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={[styles.tipPill, on && styles.tipPillOn]}
      testID={testID}
    >
      {popular ? (
        <View style={styles.mostTipped} pointerEvents="none">
          <Text style={styles.microStrong}>Most tipped</Text>
        </View>
      ) : null}
      <Text style={styles.button} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexText: { flex: 1, minWidth: 0, gap: 2 },
  flexText4: { flex: 1, minWidth: 0, gap: 4 },
  pressed: { opacity: 0.85 },
  banner: { padding: 16, borderRadius: 24, overflow: 'hidden' },
  halo3: { position: 'absolute', left: 214, top: 14, width: 208, height: 208 },
  halo2: { position: 'absolute', left: 238, top: 38, width: 160, height: 160 },
  sun: { position: 'absolute', left: 260, top: 60, width: 116, height: 116 },
  cloudA: { position: 'absolute', left: 192, top: 12, width: 54, height: 26 },
  cloudB: { position: 'absolute', left: 244, top: 42.8, width: 32.4, height: 15.6 },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badgeBox: { minWidth: 72, alignItems: 'center', justifyContent: 'center', gap: 6 },
  /** `2165:11847` — with a slot line under the date the badge column is 72 tall (banner 104). */
  badgeBoxTall: { height: 72 },
  badgeDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    fontFamily: T.button.fontFamily,
    fontSize: 10,
    letterSpacing: 0.6,
    color: C.text,
  },
  arrival: { flexDirection: 'row', gap: 12 },
  arrivalBand: { flex: 1, padding: 16, borderRadius: 16, overflow: 'hidden' },
  tileHaloA: { position: 'absolute', left: 212, top: -120, width: 220, height: 220 },
  tileHaloB: { position: 'absolute', left: 252, top: -80, width: 140, height: 140 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9999 },
  pillOnTime: { backgroundColor: C.positive },
  pillLate: { backgroundColor: C.textDisabled },
  minutesFrame: {
    width: 112,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: C.border,
    backgroundColor: C.base,
  },
  minutes: {
    fontFamily: T.button.fontFamily,
    fontSize: 56,
    lineHeight: 59,
    letterSpacing: -1.68,
    color: C.text,
  },
  otpCard: { padding: 8, borderRadius: 24, backgroundColor: C.base },
  /** `2165:11957` — the End OTP band sits 24pt under the card above: the screen's gap alone. */
  endOtpCard: { paddingTop: 0 },
  arrivedRow: { padding: 12, gap: 4 },
  otpBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  otpHaloA: { position: 'absolute', right: -64, top: -120, width: 220, height: 220 },
  otpHaloB: { position: 'absolute', right: -64, top: -80, width: 140, height: 140 },
  otpDigits: { flexDirection: 'row', gap: 6 },
  otpDigit: {
    width: 40,
    height: 52,
    borderRadius: 10,
    backgroundColor: C.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpText: { ...T.displayLarge, color: C.text },
  wrapUp: {
    padding: 16,
    gap: 8,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: C.brand,
    backgroundColor: C.base,
  },
  wrapUpHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brief: { gap: 12 },
  briefHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counter: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: C.border,
  },
  progress: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 6, borderRadius: 3 },
  segmentOn: { backgroundColor: C.positive },
  segmentOff: { backgroundColor: C.subtle },
  checks: { flexDirection: 'row', gap: 8 },
  check: {
    flex: 1,
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.border,
    backgroundColor: C.base,
  },
  checkOn: { borderStyle: 'solid', borderColor: C.positive, backgroundColor: POSITIVE_SUBTLE },
  checkTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  checkWell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkWellOn: { backgroundColor: C.base },
  checkTick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.positive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSection: {
    marginHorizontal: -16,
    marginTop: -8,
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 24,
  },
  hero: { position: 'absolute', top: 0, left: 0, right: 0, height: 395, overflow: 'hidden' },
  wave: { position: 'absolute', left: 0, right: 0, top: 0, width: '100%', height: 365 },
  heroHaloA: { position: 'absolute', left: 242, top: 29, width: 260, height: 260 },
  heroHaloB: { position: 'absolute', left: 287, top: 74, width: 170, height: 170 },
  heroHaloC: { position: 'absolute', left: -21, top: 270, width: 90, height: 90 },
  /** `2165:11967` — 8pt above; below, the screen's 24pt gap is the whole space to the next card. */
  timer: { alignItems: 'center', gap: 8, paddingTop: 8 },
  clock: { flexDirection: 'row', gap: 8 },
  clockUnit: { alignItems: 'center', gap: 6 },
  tilePair: { flexDirection: 'row', gap: 6 },
  tile: {
    width: 60,
    height: 80,
    borderRadius: 14,
    backgroundColor: C.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: {
    fontFamily: T.button.fontFamily,
    fontSize: 52,
    lineHeight: 55,
    letterSpacing: -1.56,
    color: C.text,
  },
  colon: { width: 14, height: 80, alignItems: 'center', justifyContent: 'center' },
  colonText: {
    fontFamily: T.button.fontFamily,
    fontSize: 44,
    lineHeight: 46,
    letterSpacing: -1.32,
    color: C.text,
  },
  ends: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: C.base,
  },
  endsUp: { borderWidth: 1.5, borderColor: C.borderStrong },
  extend: { padding: 16, gap: 24, borderRadius: 24, backgroundColor: C.base },
  extended: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: POSITIVE_SUBTLE,
  },
  extendHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  positiveWell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.positive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choices: { flexDirection: 'row', gap: 12 },
  choice: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  choiceIdle: { backgroundColor: C.subtle },
  choiceOn: { backgroundColor: C.tint },
  choiceOff: {
    backgroundColor: C.base,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.border,
  },
  popular: {
    position: 'absolute',
    alignSelf: 'center',
    top: -10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    borderWidth: 0.5,
    borderColor: C.brand,
    backgroundColor: C.base,
  },
  extendFoot: { gap: 4 },
  extendButton: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 9999,
    backgroundColor: POSITIVE_PRESSED,
  },
  bookAnother: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 9999,
    backgroundColor: C.brand,
  },
  linkSecondary: {
    ...T.caption,
    color: C.textSecondary,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  /** `2165:11957` — 24pt from the card above to the heading: the screen's gap alone. */
  cleanup: { gap: 12 },
  scope: {
    padding: 16,
    gap: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.base,
  },
  scopeGroup: { gap: 12 },
  divider: { height: 1, backgroundColor: C.border },
  scopeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scopeWell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeWellOn: { backgroundColor: POSITIVE_SUBTLE },
  scopeWellOff: { backgroundColor: C.subtle },
  tipShadow: { borderRadius: 24 },
  tip: {
    padding: 16,
    gap: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,226,122,0.7)',
    overflow: 'hidden',
  },
  tipDeco: { position: 'absolute', left: 237, top: -35, width: 164, height: 130 },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tipPhoto: { width: 40, height: 40, borderRadius: 20 },
  tipPhotoBlank: { backgroundColor: C.tint },
  paidCheck: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipAmounts: { flexDirection: 'row', gap: 12, paddingTop: 10, alignItems: 'flex-end' },
  tipPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Figma's px12 leaves "Other" a few points short on a 384dp phone, and Android then wraps it;
    // the label is centred, so the narrower inset changes nothing else.
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: C.base,
  },
  tipPillOn: { backgroundColor: POSITIVE_SUBTLE },
  mostTipped: {
    position: 'absolute',
    top: -11,
    alignSelf: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    backgroundColor: C.positive,
  },
  tipInput: {
    flex: 1,
    minWidth: 24,
    padding: 0,
    textAlign: 'center',
    fontFamily: T.button.fontFamily,
    fontSize: T.button.fontSize,
    color: C.text,
    includeFontPadding: false,
  },
  tipCta: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 9999,
  },
  tipCtaOn: { backgroundColor: POSITIVE_PRESSED },
  tipCtaOff: { backgroundColor: 'rgba(0,0,0,0.03)' },
  thanks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: POSITIVE_SUBTLE,
  },
  displayLarge: { ...T.displayLarge, color: C.text },
  display: { fontFamily: T.button.fontFamily, fontSize: 24, lineHeight: 32, color: C.text },
  title: { ...T.title, color: C.text },
  heading: { ...T.heading, color: C.text },
  emphasis: { ...T.emphasis, color: C.text },
  button: { ...T.button, color: C.text },
  bodyStrong: { ...T.bodyStrong, color: C.text },
  captionPrimary: { ...T.caption, color: C.text },
  captionSecondary: { ...T.caption, color: C.textSecondary },
  captionStrong: { ...T.captionStrong, color: C.text },
  captionStrongSecondary: { ...T.captionStrong, color: C.textSecondary },
  microStrong: { ...T.microStrong, color: C.text },
  microStrongSecondary: { ...T.microStrong, color: C.textSecondary },
  microSecondary: { ...T.micro, color: C.textSecondary },
  textDisabled: { color: C.textDisabled },
  icon16: { width: 16, height: 16 },
  icon18: { width: 18, height: 18 },
  icon20: { width: 20, height: 20 },
  icon24: { width: 24, height: 24 },
  icon44: { width: 44, height: 44 },
});
