import { Image, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, SecondaryButton } from '@ui/v2/Buttons';
import { C, SHADOW_1, T } from '@ui/v2/theme';

import { SERVICE_ART } from './art';

/** The `--disabled` fill the reassigned note's icon well uses (`2353:17569`). */
const WELL_DISABLED = 'rgba(0,0,0,0.25)';
/** `--color/status/positive-subtle` (`2878:7737`). */
const ARRIVING_EARLY_WELL = '#ECFF9B';

/* ------------------------------------------------------------------- Cook reassigned (one-time) */

/**
 * `Cook reassigned` — Figma `2353:17567` in "Visit details / upcoming · Cook reassigned"
 * (`2353:17562`, dev note `2353:17578`). No card: on the page ground, 12 between the top and the
 * reason. The top stacks a 40pt `--disabled` well holding `Icon/Cook changed` over the Emphasis
 * apology, 8 apart; the reason is Caption in secondary ink.
 *
 * The previous cook is never named and nothing specific to her is said. The API carries no ops
 * reason for a reassignment, so the line uses the dev note's default, "operational reasons".
 */
export function CookReassignedNote({ testID }: { testID: string }) {
  return (
    <View style={styles.reassigned} testID={testID}>
      <View style={styles.reassignedTop}>
        <View style={styles.reassignedWell}>
          <Image source={SERVICE_ART.cookChanged} style={styles.icon24} />
        </View>
        {/* One line, `simple` breaking: Android measured it a hair narrow and hid "cook". */}
        <Text
          style={styles.emphasis}
          accessibilityRole="header"
          numberOfLines={1}
          textBreakStrategy="simple"
        >
          Sorry, we have assigned you another cook
        </Text>
      </View>
      <Text style={styles.captionSecondary}>
        We had to reassign your booking to another cook due to operational reasons with the
        previously assigned cook
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------ Cook due early or late (assigned) */

/**
 * `Cook reassigned` frames `2878:7735` and `2878:7964` in "Visit details / upcoming · Cook in
 * -15 mins" (`2878:7730`) and "· Cook in +10 mins" (`2878:7959`). The customer keeps the time they
 * booked; the cook may be held to a time up to 15 minutes before it or 10 after (Business Rules
 * Spec §8), and the booking says which (`cookArrival`).
 *
 * Same object as the reassigned note: on the page ground, a 40pt well with a 24pt glyph over the
 * Emphasis line, 8 apart, then the Caption in secondary ink. The two frames differ in two places:
 *
 *   early  well `--color/status/positive-subtle` `#ECFF9B`; the caption sits OUTSIDE the top
 *          group, 12 below it (`2878:7735` gap 12);
 *   late   well `--color/brand/primary-tint` `#FFE666`; the caption is INSIDE the top group, 8
 *          below the title (`2878:7965` gap 8, the outer frame has none).
 *
 * The copy is the frames' own, word for word.
 */
export function CookArrivalNote({
  arrival,
  testID,
}: {
  arrival: 'early' | 'late';
  testID: string;
}) {
  const early = arrival === 'early';
  const caption = (
    <Text style={styles.captionSecondary}>
      {early
        ? 'Thanks for accommodating, your assigned cook would really benefit from starting just a little early :)'
        : 'Thanks for accommodating, your assigned cook would just wrapping up a nearby job :)'}
    </Text>
  );
  return (
    <View style={early ? styles.reassigned : null} testID={testID}>
      <View style={styles.reassignedTop}>
        <View style={[styles.arrivalWell, early ? styles.wellEarly : styles.wellLate]}>
          <Image
            source={early ? SERVICE_ART.arrivingEarly : SERVICE_ART.arrivingLate}
            style={styles.icon24}
          />
        </View>
        <Text style={styles.emphasis} accessibilityRole="header">
          {early
            ? 'Your cook might arrive up to 15 minutes early'
            : 'Your cook might arrive up to 10 minutes late'}
        </Text>
        {early ? null : caption}
      </View>
      {early ? caption : null}
    </View>
  );
}

/* --------------------------------------------------------------- Cancelled by Spoon (one-time) */

export interface SpoonCancelledCardProps {
  /** "Thu, 1 Oct, 6:40 PM" — when Spoon cancelled. */
  readonly when: string | null;
  /** The customer-facing reason (`SPOON_CANCEL_REASON`); never names the cook. */
  readonly reason: string;
  /** "Full ₹299 refund started, no deductions". */
  readonly refundLine: string;
  readonly onRebook: () => void;
  readonly onTalkToUs: () => void;
  readonly testID: string;
}

/** `2342:4353` — said after every reason. */
const ON_US = 'This one’s on us, & we know you were counting on us.';

/**
 * `Apology card` — Figma `2342:4343` in "Visit details / upcoming · Cancelled by Spoon (auto)"
 * (`2342:4195`, dev note `2342:4405`). Takes the place of the plain "Visit cancelled" card.
 *
 * White, 1pt `#FFEF99` edge, 24pt corners, Elevation/1, pt 18 / pb 16 / px 16, 14 between rows,
 * clipping a 260pt warm glow at (199, −121). Top: a 48pt brand well with the heart
 * (`Favorite_fill`), then "CANCELLED" (Micro Strong, 0.6 tracking) over the moment it happened.
 * Heading apology, the reason in Body secondary, the `#FFF7CC` "What we’re doing" panel (p 12,
 * 10 apart, 16pt corners) with its two lime 22pt checks, and the two 48pt pill buttons 10 apart.
 */
export function SpoonCancelledCard({
  when,
  reason,
  refundLine,
  onRebook,
  onTalkToUs,
  testID,
}: SpoonCancelledCardProps) {
  return (
    <View style={styles.apology} testID={testID}>
      <Image
        source={SERVICE_ART.apologyGlow}
        style={styles.glow}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View style={styles.apologyTop}>
        <View style={styles.heartWell}>
          <Image source={SERVICE_ART.favoriteFill} style={styles.icon24} />
        </View>
        <View style={styles.apologyCopy}>
          <Text style={styles.eyebrow}>CANCELLED</Text>
          {when === null ? null : <Text style={styles.captionSecondary}>{when}</Text>}
        </View>
      </View>
      <Text style={styles.heading} accessibilityRole="header">
        We’re so sorry, we had to cancel your visit
      </Text>
      <Text style={styles.bodySecondary} testID={`${testID}-reason`}>
        {`${reason} ${ON_US}`}
      </Text>
      <View style={styles.doing}>
        <CheckRow label={refundLine} testID={`${testID}-refund`} />
        <CheckRow label="We’ve flagged this so it doesn’t happen again" />
      </View>
      <View style={styles.actions}>
        <PrimaryButton
          label="Rebook a visit"
          onPress={onRebook}
          style={styles.action}
          testID={`${testID}-rebook`}
        />
        <SecondaryButton
          label="Talk to us"
          onPress={onTalkToUs}
          style={styles.action}
          testID={`${testID}-talk`}
        />
      </View>
    </View>
  );
}

/** `2342:4355` — a 22pt `#CFFF04` disc holding the 14pt check, 10 from Caption Strong. */
function CheckRow({ label, testID }: { label: string; testID?: string }) {
  return (
    <View style={styles.checkRow} testID={testID}>
      <View style={styles.checkDisc}>
        <Image source={SERVICE_ART.check} style={styles.icon14} />
      </View>
      <Text style={styles.captionStrong}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  icon24: { width: 24, height: 24 },
  icon14: { width: 14, height: 14 },
  emphasis: { ...T.emphasis, color: C.text },
  heading: { ...T.heading, color: C.text },
  bodySecondary: { ...T.body, color: C.textSecondary },
  captionSecondary: { ...T.caption, color: C.textSecondary },
  captionStrong: { ...T.captionStrong, color: C.text, flex: 1 },
  eyebrow: { ...T.microStrong, letterSpacing: 0.6, color: C.textSecondary },

  /** `2353:17567` — 12 between the top and the reason. */
  reassigned: { gap: 12 },
  /** `2353:17568` — the well over the title, 8 apart. */
  reassignedTop: { gap: 8, alignItems: 'flex-start' },
  reassignedWell: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WELL_DISABLED,
  },

  arrivalWell: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** `2878:7737` — `--color/status/positive-subtle`. */
  wellEarly: { backgroundColor: ARRIVING_EARLY_WELL },
  /** `2878:7966` — `--color/brand/primary-tint`. */
  wellLate: { backgroundColor: C.tint },

  apology: {
    gap: 14,
    paddingTop: 18,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 24,
    backgroundColor: C.base,
    overflow: 'hidden',
    ...SHADOW_1,
  },
  /** `2342:4344` — 260pt, at (200, −120) on the card's outer edge: (199, −121) inside the border. */
  glow: { position: 'absolute', left: 199, top: -121, width: 260, height: 260 },
  /** `2342:4345` — well and copy, 12 apart. */
  apologyTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heartWell: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.brand,
  },
  /** `2342:4349` — 2 between the eyebrow and the moment. */
  apologyCopy: { flex: 1, gap: 2 },
  /** `2342:4354` — "What we’re doing". */
  doing: { gap: 10, padding: 12, borderRadius: 16, backgroundColor: C.subtle },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkDisc: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.positive,
  },
  /** `2342:4365` — two equal buttons, 10 apart. */
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
});
