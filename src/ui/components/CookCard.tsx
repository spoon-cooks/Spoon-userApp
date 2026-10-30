import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import { Text } from '@ui/primitives/Text';
import { lightTheme } from '@ui/theme/ThemeProvider';
import type { CookViewModel, DishViewModel } from '@ui/types/viewModels';

import { COOK_ATTRIBUTE_ART, COOK_CALL_GLYPH } from './cookAssets';
import { SpecialtyGrid } from './SpecialtyGrid';
import { TrustBadges } from './TrustBadges';

/**
 * The cook profile card — Figma section "Cook profiles" `289:8515`, read this pass off `289:7518`
 * (Asha) and cross-checked on all eight frames. The same card is embedded in the Service flow:
 * Confirmation (`3:1041`), En route (`3:1381` / `292:469`), Arrived (`3:1658`) and
 * In service (`101:1812`).
 *
 * Geometry, verbatim from `289:7518`:
 *   card    white, 1pt `#FFD600` border, radius 24, px 15.889 / py 20, gap 21,
 *           `0 0 2 rgba(0,0,0,0.08)`
 *   header  `289:7519` — a **105pt** row, gap 12, items CENTRED, with 2pt of tail padding
 *   photo   `289:7520` — an 85 × 90 `#FFF7CC` PANEL at a 16pt radius carrying the portrait at
 *           89 × 133.5 from (−0.89, −12): a deliberate crop onto the face, not a centred `cover`.
 *           NOT a circular avatar.
 *   name    `299:1797` — Livvic Black 16/24 at tracking **0**, centred over the column
 *   meta    `299:1798` — a WRAPPING grid of fixed **97pt** cells, 5 across and 3 down, each a
 *           16pt glyph 3pt clear of a Livvic Medium 11/16.5 `rgba(0,0,0,0.7)` label
 *   call    `299:1816` — a `#E2FF68` pill at an 8pt radius, 21pt tall, with a 14pt handset and a
 *           Livvic Bold 11/16.5 label, inside a 25pt row padded 2pt
 *   heading `289:7550` — "What {first} cooks best?" Livvic Bold 12/16, and NOTHING else: the
 *           16pt frying pan the superseded revision drew beside it no longer exists
 *
 * Confirmed C-6: the regular and pure-veg cards are identical in every respect EXCEPT the 3×3
 * specialty grid — same photo, name, attribute row, CTA and trust row. So `variant` selects which
 * dish list is shown and changes nothing else. It is a display filter, not a second roster.
 *
 * Calling: `onCallCook` is a CALLBACK. No phone number is a prop, so this component cannot
 * render, log or leak one, and it does not know how a call is placed.
 *
 * Heading: always interpolated as "What {firstName} cooks best?" — the Figma file hardcodes
 * "asha" on 6 of 8 cards (defect D-4).
 *
 * FIGMA CONTENT QUIRK, recorded not reproduced: six of the eight cards — Asha, Meera and
 * Lata in both variants (`299:1811`, `299:2277`, `299:2070`, `299:1892`, `299:2096`, `299:2122`)
 * — draw the language GLYPH with no label beside it, because those cards carry no language data.
 * Only Kavita labels it ("Hindi, Odiya"). An orphan icon is not a state, so the attribute is
 * omitted when the payload has no languages.
 */

export type CookCardVariant = 'standard' | 'pureVeg';

export interface CookCardProps {
  readonly cook: CookViewModel;
  readonly variant?: CookCardVariant;
  /** Omit to hide the CTA — e.g. after service completion. */
  readonly onCallCook?: () => void;
  readonly showSpecialties?: boolean;
  readonly testID?: string;
}

interface Attribute {
  readonly key: string;
  readonly art: ImageSourcePropType | undefined;
  readonly value: string;
}

function attributesOf(cook: CookViewModel): readonly Attribute[] {
  const languages = cook.languages ?? [];

  const candidates: readonly (Attribute | null)[] = [
    cook.gender === undefined
      ? null
      : { key: 'gender', art: COOK_ATTRIBUTE_ART['gender'], value: cook.gender },
    cook.cuisine === undefined
      ? null
      : { key: 'cuisine', art: COOK_ATTRIBUTE_ART['cuisine'], value: cook.cuisine },
    cook.homeState === undefined
      ? null
      : { key: 'homeState', art: COOK_ATTRIBUTE_ART['homeState'], value: cook.homeState },
    languages.length === 0
      ? null
      : { key: 'languages', art: COOK_ATTRIBUTE_ART['languages'], value: languages.join(', ') },
  ];

  return candidates.filter((attribute): attribute is Attribute => attribute !== null);
}

/** The photo panel's fallback when the payload carries no `photoUrl`. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? '';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  return `${first}${second}`.toUpperCase();
}

function dishesFor(cook: CookViewModel, variant: CookCardVariant): readonly DishViewModel[] {
  if (variant === 'pureVeg') {
    return cook.pureVegSpecialties ?? [];
  }
  return cook.specialties ?? [];
}

export function CookCard({
  cook,
  variant = 'standard',
  onCallCook,
  showSpecialties = true,
  testID = 'cook-card',
}: CookCardProps) {
  const attributes = attributesOf(cook);
  const dishes = dishesFor(cook, variant);

  /**
   * A hosted photo that does not load falls back to the bundled photograph.
   *
   * `<Image>` reports the failure and then draws nothing, so a 404 left the panel blank — and a
   * non-null `photoUrl` had already skipped the bundled tier, which made a BAD url worse than no
   * url at all. Only a load FAILURE swaps; an absent photo is resolved upstream and still lands
   * on the initials below. Keyed by the uri so a different cook starts fresh.
   */
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const photoUrl =
    cook.photoUrl !== undefined && cook.photoUrl === failedUri
      ? cook.photoFallbackUrl
      : cook.photoUrl;

  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.identity}>
        <View style={styles.photo} testID={`${testID}-avatar`}>
          {photoUrl === undefined ? (
            <Text variant="heading" color="textPrimary" align="center">
              {initialsOf(cook.displayName)}
            </Text>
          ) : (
            <Image
              source={{ uri: photoUrl }}
              style={styles.photoImage}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
              onError={() => setFailedUri(photoUrl)}
              testID={`${testID}-photo`}
            />
          )}
        </View>

        <View style={styles.identityText}>
          {/* `299:1797` — centred over the column, and at tracking 0 rather than −0.4. */}
          <Text
            variant="headingCta"
            color="textPrimary"
            align="center"
            accessibilityRole="header"
            numberOfLines={1}
            style={styles.name}
          >
            {cook.displayName}
          </Text>

          {attributes.length === 0 ? null : (
            <View style={styles.attributes} testID={`${testID}-attributes`}>
              {attributes.map((attribute) => (
                <View key={attribute.key} style={styles.attribute} accessible>
                  {attribute.art === undefined ? null : (
                    <Image
                      source={attribute.art}
                      style={styles.attributeGlyph}
                      resizeMode="contain"
                      accessibilityIgnoresInvertColors
                    />
                  )}
                  <Text
                    variant="labelMedium"
                    color="textSecondary"
                    numberOfLines={1}
                    style={styles.attributeLabel}
                  >
                    {attribute.value}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {onCallCook === undefined ? null : (
            /* `257:3108` — the CTA sits in its own 2pt-inset row and spans the column. */
            <View style={styles.callRow}>
              <Pressable
                onPress={onCallCook}
                accessibilityRole="button"
                accessibilityLabel={`Call ${cook.firstName}`}
                hitSlop={12}
                style={styles.call}
                testID={`${testID}-call`}
              >
                <Image
                  source={COOK_CALL_GLYPH}
                  style={styles.callGlyph}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
                {/* `299:1819` — a fixed 51 × 14 single line. Allowed to wrap, "Cook" dropped
                    below the pill's 21pt box and the control read "Call" on a narrow card. */}
                <Text variant="slotLabel" color="textSecondary" numberOfLines={1}>
                  Call Cook
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {showSpecialties && dishes.length > 0 ? (
        <View style={styles.specialties}>
          <Text variant="bodyBold" color="textPrimary" accessibilityRole="header">
            {`What ${cook.firstName} cooks best?`}
          </Text>
          <SpecialtyGrid dishes={dishes} testID={`${testID}-specialties`} />
        </View>
      ) : null}

      <TrustBadges
        {...(cook.badges === undefined ? {} : { badges: cook.badges })}
        testID={`${testID}-badges`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    gap: 21,
    paddingHorizontal: 15.889,
    paddingVertical: 20,
    borderRadius: lightTheme.layout.cardRadius,
    borderWidth: lightTheme.stroke.thin,
    borderColor: lightTheme.colors.borderNotice,
    backgroundColor: lightTheme.colors.surface,
    shadowColor: lightTheme.colors.textPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 1,
    elevation: 1,
  },
  /** `289:7519` — a 105pt row with a 2pt tail; the photo and the text block are CENTRED in it. */
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 105,
    paddingBottom: 2,
    gap: lightTheme.space.md,
  },
  /** `289:7520` — an 85 × 90 panel, not a circle. */
  photo: {
    width: 85,
    height: 90,
    borderRadius: lightTheme.radius.md,
    // The same golden outline as `BookingCard`'s avatar, the Home banner and the completion card,
    // so the transparent portrait keeps an edge against its `#FFF7CC` panel.
    borderWidth: lightTheme.stroke.thin,
    borderColor: lightTheme.colors.borderNoteStrong,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightTheme.colors.surfaceAccent,
    shadowColor: lightTheme.colors.textPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 1,
    elevation: 1,
  },
  /**
   * The portrait FILLS the 85 × 90 panel and is centre-cropped by `resizeMode="cover"`.
   *
   * `289:7521` draws it 89 × 133.5 from (−0.89, −12) — a 148 % vertical blow-up lifted so the
   * crop lands on the face — and that was transcribed literally. It only works for the ONE
   * portrait the frame was drawn around. Every cook photo the server sends is framed differently,
   * and applied to them the same window zooms ~1.5× into an already head-and-shoulders shot and
   * pushes it up: the observed result on device is a face cropped through the chin with the
   * shoulder filling the bottom corner.
   *
   * `cover` at 100 % is the honest generalisation of what the frame is doing — fill the panel,
   * preserve the aspect ratio, crop the overflow — without assuming a framing the payload never
   * promised. The panel is near-square (85 × 90), so a centred crop of a portrait keeps the face.
   */
  photoImage: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
  },
  /** `299:1794` — a 101pt column at an 8pt gap; the row above centres it. */
  identityText: { flex: 1, minWidth: 0, height: 101, gap: lightTheme.space.sm },
  /** `299:1796` — centred across the column. */
  name: { alignSelf: 'stretch' },
  /**
   * `299:1798` — a WRAPPING grid of fixed 97pt cells, 5 apart across and 3 down. Two of them plus
   * the gutter fill the 199pt column exactly and a third cannot fit, so the wrap produces the
   * 2 × 2 the frame draws without hard-coding pairs, and a narrow phone degrades to one per row
   * instead of truncating both.
   */
  attributes: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 5, rowGap: 3 },
  /** `299:1799` — a 97 × 16 cell whose label starts 3pt clear of the 16pt glyph. */
  attribute: { flexDirection: 'row', alignItems: 'center', gap: 3, width: 97, height: 16 },
  attributeLabel: { flex: 1, minWidth: 0 },
  attributeGlyph: { width: 16, height: 16 },
  /** `299:1815` — a 25pt row with a 2pt vertical inset around the CTA. */
  callRow: { alignSelf: 'stretch', height: 25, paddingVertical: lightTheme.space.xxs },
  /**
   * `299:1816` — a `#E2FF68` pill at an 8pt radius, 21pt tall, spanning the column. `hitSlop`
   * restores the 44pt target without redrawing it.
   */
  call: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    gap: lightTheme.space.s6,
    paddingHorizontal: lightTheme.space.sm,
    paddingVertical: 5.889,
    borderRadius: lightTheme.radius.xs,
    backgroundColor: lightTheme.colors.surfaceEta,
  },
  callGlyph: { width: 14, height: 14 },
  /** `289:7548` — the heading and the grid, 9 apart. */
  specialties: { gap: 9 },
});
