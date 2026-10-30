import { useRef } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
// Gesture-handler's ScrollView, not React Native's: this card scrolls inside the page and holds
// sideways dish rows. With RN's, a sideways drag on a row left Android handing the next vertical
// drag on the card to the page, which scrolled instead (S21, 2026-10-30), as DeckCard avoids.
import { ScrollView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';

import { Text } from '@ui';
import { lightTheme } from '@ui/theme/ThemeProvider';

import { visitDemoModel } from '../../data/visit';
import type { VisitCookData, VisitMenuSection } from '../../data/visit';
import {
  VISIT_BAND_CURVE,
  VISIT_BELL_ASSIGNED,
  VISIT_CALL_GLYPH,
  VISIT_CHEVRON_16,
  VISIT_DISH_FAVORITE,
  VISIT_STAR,
} from './assets';

/**
 * `Cook details` · Cook assigned — Figma `1462:5794` (component `1463:8074`).
 *
 * A 450pt window with a 1pt `#FFD600` edge, 16pt corners and a `0 0 1.5 rgba(0,0,0,0.08)` lift.
 * Inside it the cook's full profile SCROLLS: the "Cook from your Pool" note with its Call button
 * (`1463:7958`), then `Cook profile card` (`1380:3210`) — eyebrow, name, origin, visits and rating
 * beside the 120pt photo, over a yellow band (`1380:3070`: the fixed 35pt curve, then `#FFF7CC →
 * #FFE666`) that carries five dish carousels. Pinned over the bottom is the 88pt "Scroll for full
 * menu" cue (`1463:7967`), a `#FFF7CC` wash that clears to 0 % at its top.
 */
export interface CookAssignedCardProps {
  /** The cook; a line the backend has no value for is left out. Defaults to the frame's. */
  readonly cook?: VisitCookData;
  /** The cook's dishes by category; empty hides the carousels and the scroll cue. */
  readonly menu?: readonly VisitMenuSection[];
  /** Absent: no Call button (there is no way to reach the cook yet). */
  readonly onCall?: (() => void) | undefined;
  /** The window's height: 450 (`1462:5794`), or 372 on Cook arrived (Service flow `2165:11952`). */
  readonly windowHeight?: number | undefined;
  readonly testID?: string | undefined;
}

const DEMO = visitDemoModel('assigned');

export function CookAssignedCard({
  cook = DEMO.cook,
  menu = DEMO.menu,
  onCall,
  windowHeight = 450,
  testID = 'visit-cook-assigned',
}: CookAssignedCardProps) {
  const scroll = useRef<ScrollView>(null);
  return (
    <View style={styles.shadow} testID={testID}>
      <View
        style={[
          styles.window,
          { height: windowHeight },
          menu.length === 0 ? styles.windowFit : null,
        ]}
      >
        <ScrollView
          ref={scroll}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          testID={`${testID}-scroll`}
        >
          {/* `1463:7958` — the note and the Call button. */}
          {/* A one-time visit has no Pool note (Service flow `2165:11848`): the row then holds
              only the Call button, or nothing at all before the cook sets off. */}
          {cook.note === '' && onCall === undefined ? null : (
            <View style={styles.info}>
              {cook.note === '' ? null : (
                <View style={styles.note}>
                  <Image source={VISIT_BELL_ASSIGNED} style={styles.glyph20} />
                  <Text variant="spoonCaption" color="textSecondarySoft" style={styles.noteText}>
                    {cook.note}
                  </Text>
                </View>
              )}
              {onCall === undefined ? null : (
                <Pressable
                  onPress={onCall}
                  accessibilityRole="button"
                  accessibilityLabel="Call the cook"
                  style={styles.call}
                  testID={`${testID}-call`}
                >
                  <Image source={VISIT_CALL_GLYPH} style={styles.glyph20} />
                  <Text variant="spoonBodyStrong" color="textPrimary">
                    Call
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* `1380:3210` — Cook profile card. */}
          <View style={styles.profile}>
            <View style={styles.band} pointerEvents="none">
              <Image source={VISIT_BAND_CURVE} style={styles.bandCurve} resizeMode="stretch" />
              <LinearGradient
                colors={[lightTheme.colors.surfaceAccent, lightTheme.colors.surfaceAccentBold]}
                style={styles.bandBody}
              />
            </View>

            <View style={styles.header}>
              <View style={styles.description}>
                {/* Dev note `2226:4211`: the badge shows only for verified cooks. */}
                {cook.eyebrow === '' ? null : (
                  <Text variant="spoonMicroStrong" color="textSecondarySoft">
                    {cook.eyebrow}
                  </Text>
                )}
                <View style={styles.gap4}>
                  <Text variant="spoonHeading" color="textPrimary">
                    {cook.name}
                  </Text>
                  {cook.origin === undefined ? null : (
                    <Text variant="spoonCaption" color="textSecondarySoft">
                      {cook.origin}
                    </Text>
                  )}
                </View>
                <View style={styles.gap4}>
                  {cook.visits === undefined ? null : (
                    <Text variant="spoonBodyStrong" color="textPrimary">
                      {cook.visits}
                    </Text>
                  )}
                  {cook.rating === undefined ? null : (
                    <View style={styles.rating}>
                      <Text variant="spoonBodyStrong" color="textPrimary">
                        {cook.rating}
                      </Text>
                      <Image source={VISIT_STAR} style={styles.star} />
                    </View>
                  )}
                </View>
              </View>
              {/* `1380:3206` — the 120pt photo on `#FFF7CC`, drawn `contain`. */}
              <View style={styles.photo}>
                {cook.photo === undefined ? null : (
                  <Image source={cook.photo} style={styles.photoImage} resizeMode="contain" />
                )}
              </View>
            </View>

            {/* `1380:3076` — the carousels. */}
            <View style={styles.carousels}>
              {menu.map((section) => (
                <View key={section.id} style={styles.carousel}>
                  <Text variant="spoonBodyStrong" color="textPrimary" style={styles.sectionTitle}>
                    {section.title}
                  </Text>
                  <ScrollView
                    horizontal
                    nestedScrollEnabled
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.dishRow}
                  >
                    {section.dishes.map((dish) => (
                      <View key={dish.id} style={styles.dish}>
                        <View style={styles.dishPhoto}>
                          {dish.image === undefined ? null : (
                            <Image
                              source={dish.image}
                              style={styles.dishImage}
                              resizeMode="contain"
                            />
                          )}
                          <Image source={VISIT_DISH_FAVORITE} style={styles.favorite} />
                        </View>
                        <Text variant="spoonCaption" color="textVisitDish" numberOfLines={1}>
                          {dish.name}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* `1463:7967` — the pinned scroll cue; only when there is a menu to scroll to. */}
        {menu.length === 0 ? null : (
          <LinearGradient
            pointerEvents="box-none"
            colors={[
              lightTheme.colors.surfaceVisitCueClear,
              lightTheme.colors.surfaceVisitCueMid,
              lightTheme.colors.surfaceAccent,
            ]}
            locations={[0, 0.55, 1]}
            style={styles.cue}
          >
            {/* Dev note `2226:4211`: "Scroll for full menu" opens the full list. */}
            <Pressable
              onPress={() => scroll.current?.scrollToEnd({ animated: true })}
              accessibilityRole="button"
              accessibilityLabel="Scroll for full menu"
              hitSlop={8}
              style={({ pressed }) => [styles.cuePill, pressed && { opacity: 0.85 }]}
              testID={`${testID}-full-menu`}
            >
              <Text variant="spoonCaptionStrong" color="textSecondarySoft">
                Scroll for full menu
              </Text>
              <Image source={VISIT_CHEVRON_16} style={styles.chevronDown} />
            </Pressable>
          </LinearGradient>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** The drop shadow lives outside the clip so the window doesn't cut it off. */
  shadow: {
    borderRadius: lightTheme.radius.md,
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 1.5, color: 'rgba(0,0,0,0.08)' }],
  },
  /** Without a menu there is nothing to scroll: the window fits the profile instead. */
  windowFit: { height: 'auto' },
  /** `1462:5794` — the 450pt window. */
  window: {
    height: 450,
    borderWidth: 1,
    borderColor: lightTheme.colors.borderNotice,
    borderRadius: lightTheme.radius.md,
    overflow: 'hidden',
    backgroundColor: lightTheme.colors.surface,
  },
  scroll: { gap: lightTheme.space.sm },
  /** `1463:7958` — pt 16, px 16, no bottom padding. */
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: lightTheme.space.lg,
    paddingHorizontal: lightTheme.space.lg,
  },
  note: { flexDirection: 'row', alignItems: 'center', gap: lightTheme.space.xs },
  /** `1463:7962` — the note wraps at 159pt. */
  noteText: { width: 159 },
  glyph20: { width: 20, height: 20 },
  /** `1463:7963` — px 16 / py 8, 24pt corners, `Elevation/1`. */
  call: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.space.sm,
    paddingHorizontal: lightTheme.space.lg,
    paddingVertical: lightTheme.space.sm,
    borderRadius: lightTheme.radius.lg,
    backgroundColor: lightTheme.colors.surfaceAccentBold,
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 3, color: 'rgba(0,0,0,0.08)' }],
  },
  profile: { position: 'relative' },
  /** `1380:3070` — inset 152 / 0 / 78 / 0 of the profile card. */
  band: { position: 'absolute', top: 152, bottom: 78, left: 0, right: 0 },
  bandCurve: { position: 'absolute', top: 0, left: 0, right: 0, width: '100%', height: 35 },
  /** `1380:3072` — the body starts 34 down so it tucks 1pt under the curve. */
  bandBody: { position: 'absolute', top: 34, bottom: 0, left: 0, right: 0 },
  /** `1380:3196` — pl 16, pr 116 (room for the photo), py 16. */
  header: {
    paddingLeft: lightTheme.space.lg,
    paddingRight: 116,
    paddingVertical: lightTheme.space.lg,
  },
  /** `1380:3197` — 8 between blocks, 8 trailing padding. */
  description: { gap: lightTheme.space.sm, paddingRight: lightTheme.space.sm },
  gap4: { gap: lightTheme.space.xs },
  rating: { flexDirection: 'row', alignItems: 'center', gap: lightTheme.space.xs },
  star: { width: 12, height: 12 },
  photo: {
    position: 'absolute',
    top: lightTheme.space.lg,
    right: lightTheme.space.lg,
    width: 120,
    height: 120,
    borderRadius: lightTheme.radius.md,
    overflow: 'hidden',
    backgroundColor: lightTheme.colors.surfaceAccent,
  },
  photoImage: { width: 120, height: 120 },
  /** `1380:3076` — py 16, 24 between carousels. */
  carousels: { paddingVertical: lightTheme.space.lg, gap: lightTheme.space.xl },
  carousel: { gap: lightTheme.space.md },
  sectionTitle: { paddingHorizontal: lightTheme.space.lg },
  /** `1380:3080` — px 16, 10 between cards. */
  dishRow: { paddingHorizontal: lightTheme.space.lg, gap: lightTheme.space.s10 },
  /** `848:7809` — white, 13pt corners, p 8, 4 gap. */
  dish: {
    alignItems: 'center',
    gap: lightTheme.space.xs,
    padding: lightTheme.space.sm,
    borderRadius: 13,
    backgroundColor: lightTheme.colors.surface,
    overflow: 'hidden',
  },
  dishPhoto: { width: 120, height: 120 },
  dishImage: { width: 120, height: 120 },
  /** `848:7803` — the heart, 13×12 at x 107, y 0. */
  favorite: { position: 'absolute', left: 107, top: 0, width: 13, height: 12 },
  /** `1463:7967` — 88 tall, content pinned to the bottom with 12 under it. */
  cue: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 88,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: lightTheme.space.md,
  },
  /** `1463:7968` — pl 12 / pr 8 / py 6, 4 gap, pill. */
  cuePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.space.xs,
    paddingLeft: lightTheme.space.md,
    paddingRight: lightTheme.space.sm,
    paddingVertical: lightTheme.space.s6,
    borderRadius: lightTheme.radius.pill,
    backgroundColor: lightTheme.colors.surfaceCta,
  },
  /** `1463:7971` — the right chevron turned 90° to point down. */
  chevronDown: { width: 16, height: 16, transform: [{ rotate: '90deg' }] },
});
