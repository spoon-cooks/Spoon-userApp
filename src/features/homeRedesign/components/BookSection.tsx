import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMinutes, formatPaise } from '@core/format';
import { DurationCarousel } from '@ui/v2/DurationCarousel';

import { ART } from '../assets';
import type { BookingMode, CtaKind } from '../state/bookingDraft';
import type { DurationOption } from '../types';
import { C, F, SHADOW_PILL } from '../theme';
import { BookingToggle } from './BookingToggle';

export interface BookSectionProps {
  /** The lowest instant ETA, or `null` when instant is unavailable — regardless of the tab. */
  readonly etaMins: number | null;
  readonly mode: BookingMode;
  readonly onChangeMode: (mode: BookingMode) => void;
  readonly cta: CtaKind;
  readonly durations: readonly DurationOption[];
  readonly focusedDurationId: string;
  readonly selectedDurationId: string | null;
  readonly onFocusDuration: (id: string) => void;
  readonly onSelectDuration: (id: string) => void;
  readonly isAvailable: (duration: DurationOption) => boolean;
  readonly pricingStatus: 'ready' | 'loading' | 'error';
  readonly onPressUnavailable: (duration: DurationOption) => void;
  readonly onRetryPricing: () => void;
  readonly canBook: boolean;
  readonly onPressBook: () => void;
  readonly onPressHelpMePick: () => void;
  readonly onPressPaymentDetails: () => void;
}

/**
 * The heading the frame draws on one line. Android measures this face a hair narrower than it
 * draws it, so the last word wrapped onto a line the heading's height hides ("Select duration
 * to") — `simple` breaking measures the line as it is drawn, as on the Account screen's labels.
 */
const ONE_LINE = { numberOfLines: 1, textBreakStrategy: 'simple' } as const;

/**
 * `1047:6923` "Book section" and its states — `1222:23630` selected (Now), `1222:24656` schedule
 * (Later), `1303:1333` instantNA.
 *
 * The header caption is a function of instant availability only: "Arriving in x mins" while it
 * is available, "Instant · Unavailable" with a grey bolt while it is not, whichever tab is on.
 *
 * CTA (the front tile is always the selection):
 *   book      lime "Book Now  ·  1 hr · ₹total" (the server's price incl. GST) + "Check payment
 *             details"; with nothing selectable (prices loading) a grey "Book Now" (`1255:3181`).
 *   schedule  yellow "Book for later" — Later, and Now while Instant is unavailable — no payment
 *             link; it opens the slot picker with the duration carried over.
 */
export function BookSection({
  etaMins,
  mode,
  onChangeMode,
  cta,
  durations,
  focusedDurationId,
  selectedDurationId,
  onFocusDuration,
  onSelectDuration,
  isAvailable,
  pricingStatus,
  onPressUnavailable,
  onRetryPricing,
  canBook,
  onPressBook,
  onPressHelpMePick,
  onPressPaymentDetails,
}: BookSectionProps) {
  const selected = durations.find((d) => d.id === selectedDurationId);
  const live = canBook && selected !== undefined && pricingStatus === 'ready';

  // `1222:23640` "Book Now  ·  1 hr · ₹75" (the selected SKU and its GST-inclusive total);
  // `1222:24666` / `1303:1343` "Book for later". Nothing selected yet: a grey "Book Now"
  // (`1255:3181`) or "Book for later".
  const label =
    cta === 'schedule'
      ? 'Book for later'
      : live
        ? `Book Now  ·  ${selected.label} · ${formatPaise(selected.payablePaise)}`
        : 'Book Now';
  // The book CTA carries "Check payment details" under it; the schedule CTA pads below instead.
  const withLink = cta === 'book' && live;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.titles}>
          <Text style={styles.title} {...ONE_LINE}>
            Select duration to book
          </Text>
          <View style={styles.eta}>
            <Image source={etaMins === null ? ART.flashOff : ART.flash} style={styles.flash} />
            {etaMins === null ? (
              <Text style={styles.etaLabel}>Instant · Unavailable</Text>
            ) : (
              <View style={styles.etaRow}>
                <Text style={styles.etaLabel}>Arriving in</Text>
                <View style={styles.etaChip}>
                  <Text style={styles.etaValue}>{formatMinutes(etaMins)}</Text>
                </View>
              </View>
            )}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onPressHelpMePick}
          style={[styles.help, SHADOW_PILL]}
        >
          <Text style={styles.helpLabel}>Help me pick</Text>
          <Image source={ART.time} style={styles.helpIcon} />
        </Pressable>
      </View>

      <BookingToggle
        value={mode}
        onChange={onChangeMode}
        muted={mode === 'now' && etaMins === null}
      />

      {cta === 'none' ? null : (
        <>
          <DurationCarousel
            durations={durations}
            focusedId={focusedDurationId}
            selectedId={selectedDurationId}
            isAvailable={isAvailable}
            status={pricingStatus}
            onFocus={onFocusDuration}
            onSelect={onSelectDuration}
            onPressUnavailable={onPressUnavailable}
            onRetry={onRetryPricing}
          />
          <View style={[styles.cta, withLink ? null : styles.ctaNoLink]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !live }}
              disabled={!live}
              onPress={onPressBook}
              style={[
                styles.button,
                !live
                  ? styles.buttonDisabled
                  : cta === 'book'
                    ? styles.buttonBook
                    : styles.buttonSchedule,
                // Elevation/2 on the live button (`drop-shadow 6px` in the export); none disabled.
                live ? SHADOW_PILL : null,
              ]}
            >
              <Text style={[styles.buttonLabel, live ? null : styles.buttonLabelDisabled]}>
                {label}
              </Text>
            </Pressable>
            {/* `1255:3181` draws no link under the disabled button; it comes with the price. */}
            {withLink ? (
              <Pressable accessibilityRole="link" onPress={onPressPaymentDetails}>
                <Text style={styles.link}>Check payment details</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, paddingBottom: 8, width: '100%' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  titles: { gap: 4 },
  title: { fontFamily: F.semibold, fontSize: 18, lineHeight: 26, color: C.text },
  eta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  etaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  flash: { width: 32, height: 32 },
  etaLabel: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
  etaChip: {
    height: 24,
    paddingHorizontal: 4,
    backgroundColor: C.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  etaValue: { fontFamily: F.semibold, fontSize: 16, lineHeight: 24, color: C.text },
  help: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 12,
    paddingRight: 10,
    paddingVertical: 8,
    borderRadius: 9999,
    backgroundColor: C.base,
  },
  helpLabel: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
  helpIcon: { width: 16, height: 16 },
  cta: { alignItems: 'center', gap: 4, paddingTop: 4, paddingHorizontal: 16 },
  /** `1222:24665` / `1303:1342` — the schedule CTA is padded 4 below as well as above. */
  ctaNoLink: { paddingBottom: 4 },
  button: {
    minHeight: 48,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 9999,
  },
  buttonDisabled: { backgroundColor: C.surfaceDisabled },
  /** `1222:23640` — lime "Book Now  ·  SKU · ₹total". */
  buttonBook: { backgroundColor: C.lime },
  /** `1222:24666` / `1303:1343` — yellow "Book for later". */
  buttonSchedule: { backgroundColor: C.brand },
  buttonLabel: { fontFamily: F.bold, fontSize: 16, lineHeight: 24, color: C.text },
  buttonLabelDisabled: { color: C.textDisabled },
  link: {
    fontFamily: F.regular,
    fontSize: 12,
    lineHeight: 16,
    color: C.text,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
});
