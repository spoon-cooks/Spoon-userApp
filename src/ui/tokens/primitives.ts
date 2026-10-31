import { Platform } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

/**
 * Layer 1 — primitives. Raw scale values extracted from the CURRENT source of truth:
 * Figma `QMgajesW22fQcUbs7TKspS` ("V0_-user-app"), primarily Page 3a `1:455`.
 *
 * Components must NOT consume this layer directly. Use `semantic.ts`, so a primitive change
 * propagates without touching components. (FRONTEND_FOUNDATION_PLAN.md §14)
 *
 * Provenance: every value below is read off a real node via `get_design_context`, not sampled
 * from a screenshot. The previous placeholder brand ramp (yellow500 `#FFD400`,
 * lime400 `#C6F432`) was WRONG and is replaced — see docs/FIGMA_PIXEL_PERFECT_AUDIT.md.
 */

export const palette = {
  white: '#FFFFFF',
  black: '#000000',
  /** `color/black/-70%` — secondary copy on the Instant / Schedule tiles. */
  black70: 'rgba(0,0,0,0.7)',
  /** Photo scrim over the "what's not included" thumbnails (`156:38`). */
  black40: 'rgba(0,0,0,0.4)',
  /** `44:5632` — the Instant unavailable veil. Plain white at 45 %, NOT a blur. */
  white45: 'rgba(255,255,255,0.45)',
  /**
   * `3:2002` — the ground behind a bottom sheet. Read off the node: plain black at 80%, which is
   * also `color/black/-80%`. The previous `rgba(15,23,43,0.55)` was authored, not measured.
   */
  scrim: 'rgba(0,0,0,0.8)',

  // Slate ramp — color/azure/*
  slate950: '#0F172B',
  /** `color/azure/27` — the secondary-button label on Scheduled (`37:3920`). */
  azure27: '#314158',
  /** `color/azure/35` — form-field labels: "Day", "Time", "Duration" (`37:3716`). */
  azure35: '#45556C',
  /** `color/azure/18` — Meal Brief field labels and input text (`3:691`). */
  azure18: '#1D293D',
  /** `color/azure/47` — the Meal Brief "Skip" action (`3:816`). */
  azure47: '#62748E',
  slate900: '#101828',
  slate800: '#1E2939',
  slate600: '#364153',
  /** `color/azure/65` — `201:88` "Takes 5-7 business days" under the refund line. */
  azure65: '#90A1B9',
  slate400: '#8A94A6',
  slate200: '#CAD5E2',

  // Recurring live booking (`cCQlzTeiObQkpVBzwI8mZi` page `1005:131`)
  /** Black / white alphas the recurring live booking file draws. */
  black3: 'rgba(0,0,0,0.03)',
  black6: 'rgba(0,0,0,0.06)',
  black12: 'rgba(0,0,0,0.12)',
  black15: 'rgba(0,0,0,0.15)',
  black20: 'rgba(0,0,0,0.2)',
  black45: 'rgba(0,0,0,0.45)',
  black55: 'rgba(0,0,0,0.55)',
  black75: 'rgba(0,0,0,0.75)',
  white90: 'rgba(255,255,255,0.9)',
  /** `#FFF7CC` at 0 % / 90 % — the Visit details scroll cue's wash (`1463:7967`). */
  yellow200Clear: 'rgba(255,247,204,0)',
  yellow200Veil: 'rgba(255,247,204,0.9)',
  /** `1005:183` — the flat legend / meta grey. */
  grey42: '#6B6B6B',
  /** `848:7802` — a dish card's name. */
  grey20: '#333333',
  /** `1461:6324` — the Up-next "Late evening" sky, top → bottom. */
  nightIndigo: '#2E2766',
  nightInk: '#0D0A22',
  /** `1461:6149` — the morning visit-banner sky, top → bottom. */
  dawnCream: '#FFF9DB',
  dawnPeach: '#FFD9A8',
  /** `1444:8837` — the afternoon sky's lead stop. */
  yellowNoon: '#FFF3A6',
  /** `1461:6230` — the cancelled banner's mute veil. */
  ashVeil: 'rgba(244,243,239,0.8)',
  /** `1517:9299` — the low-score rate card's wash. */
  linen: '#F3F0E8',
  /** `1006:323` — the date pop-up's warm shadow, `#998000` at 18 %. */
  ochreShadow: 'rgba(153,128,0,0.18)',

  // Neutrals — color/grey/*
  grey100: '#F3F4F6',
  /** `color/grey/96-2` — the Scheduled header hairline and secondary-button surface. */
  grey96: '#F1F5F9',
  /** `color/grey/98-3` — the Meal Brief screen background (`3:686`). */
  grey98: '#F8FAFC',
  /** `color/grey/91` — the Meal Brief card and input borders (`3:695`). */
  grey91: '#E2E8F0',
  /** `color/grey/91-80%` — the same border on the white preference card (`3:688`). */
  grey91Soft: 'rgba(226,232,240,0.8)',
  grey50: '#FAFAF7',
  /** `color/grey/98` — the app's dominant warm off-white. */
  cream: '#FFFDF5',

  // ---------------------------------------------------------------------------
  // Brand ramp — READ FROM Figma Page 3a. These are the real fills.
  // ---------------------------------------------------------------------------
  /** `1:576` Instant tile fill. */
  lime300: '#ECFF9B',
  /** `59:587` active-booking border and its timer chip — the brightest lime in the file. */
  lime500: '#CFFF04',
  /**
   * `1:458` top banner — `lime300` at 50% over the white `1:457` ground, PRE-COMPOSITED.
   *
   * It must not stay translucent. The banner carries `0 1 4 rgba(0,0,0,0.15)`, and on Android an
   * elevation shadow is visible THROUGH a translucent background, which drew a dark lime frame
   * around all four edges of the banner on device (measured: the fill dropped from (245,255,205)
   * to (226,236,186) within ~3dp of every edge). The frame does not exist in the frame. Flattening
   * the fill to the composite keeps the designed colour and removes the artifact.
   *
   * 0.5 × #ECFF9B + 0.5 × #FFFFFF = (245.5, 255, 205).
   */
  limeBanner: '#F6FFCD',

  /** `129:29` Schedule tile fill; `135:95` duration-matrix header row. */
  yellow400: '#FFE666',
  /** `1:522` promo centre panel; trust tiles `153:501`; matrix odd rows. */
  yellow300: '#FFEF99',
  /** `130:43` promo side panels; matrix even rows. */
  yellow200: '#FFF7CC',
  /** `1219:4397` — the middle stop of an unfocused duration card's liquid: `#FFE666` → this → `#FFEF99`. */
  yellow250: '#FFF3B3',
  /**
   * `1:798` / `1:821` — the "Popular" badge and the primary CTA bar. This is a DIFFERENT yellow
   * to the Schedule tile's `#FFE666`; the file genuinely uses two.
   */
  yellow500: '#FFD600',

  /** `1:754` — "Canary", the Instant ETA pill. Brighter than `lime300`, distinct from `lime500`. */
  canary: '#E2FF68',

  /** `201:93` — the outline on the auto-cancel "No" button. A fourth, softer yellow. */
  yellow33: '#FFDE33',

  /** `143:241` — the "Please rate this service!" pill: `lime500` at 30% over white, flattened. */
  limeRate: '#F1FFB4',
  /** `color/spring-green/30` — `143:299` "100% goes directly to cook". The file's only green. */
  springGreen: '#009966',

  /**
   * `94:1012` — the cook-card trust row: `lime300` at 70% over the white card, PRE-COMPOSITED for
   * the same reason as `limeBanner`. The row carries `elevation: 1`, and on device its outer ~7dp
   * measured (226,239,169) against a correct (242,255,185) in the middle — the shadow showing
   * through the translucent fill. 0.7 × #ECFF9B + 0.3 × #FFFFFF = (241.7, 255, 185).
   */
  limeTrust: '#F2FFB9',
  /**
   * `21:1105` — the Start-OTP panel on Arrived: `lime300` at 30% over white, PRE-COMPOSITED.
   * The panel carries `0 0 4 rgba(0,0,0,0.15)`; measured on device, its outer ~10dp read
   * (211,217,187) against a correct (249,255,225) inside — a dark olive frame the frame does not
   * draw. 0.3 × #ECFF9B + 0.7 × #FFFFFF = (249.3, 255, 225).
   */
  limeSoft: '#F9FFE1',
  /** `101:1905` — the End-OTP panel on In service: `yellow300` at 30%, flattened for the same reason. */
  yellowSoft: '#FFFAE0',
  /** `94:1020` — the separator dots inside it. */
  black80: 'rgba(0,0,0,0.8)',

  /** `73:1040` — the splash ground: `canary` at 70%. */
  canaryWash: 'rgba(226,255,104,0.7)',
  /** `71:887` — the loading-interstitial ground. A flat olive-lime, not a `canary` alpha. */
  limeWash: '#EAF086',
  /** `53:176` — the top of the Login wash: `yellow200` at 40%, fading to white by 50%. */
  yellowWash: 'rgba(255,247,204,0.4)',
  /** `53:33` — the map canvas behind the pin: `yellow200` at 20%. */
  yellowCanvas: 'rgba(255,247,204,0.2)',
  /** `3:769` — the Meal Brief recipe card: buttery white at 70% over white, flattened. */
  butterySoft: '#FFFCF1',
  /** `color/yellow/76` — the recipe card border and the CTA's yellow glow (`3:796`). */
  yellow76: '#FEE685',
  /** `color/yellow/59` — the recipe input border (`3:780`). */
  yellow59: '#FFD230',

  /** `6:784` — the Profile logout surface: `color/grey/97-2`, a rose-tinted white. */
  roseLogout: '#FFF1F2',
  /** `color/rose/39` — `6:789` the Log Out label. Distinct from `rose600` `#EC003F`. */
  rose39: '#C70036',

  /** `3:776` — the "Optional" badge on the recipe card. */
  roseSurface: '#FFE4E6',
  /** `color/rose/32` — its ink. */
  rose: '#A50036',

  /**
   * Instant duration tiles (`1:758` / `1:788` / `1:812`). The frame draws these as translucent
   * fills, NOT as the solid surfaces used elsewhere — they read differently over white.
   */
  /**
   * `1:758` / `6:765` — `yellow200` at 70% over white, PRE-COMPOSITED. The Instant tiles carry no
   * shadow so they were unaffected, but the Profile legal panel uses the same value WITH an upward
   * lift, and the shadow bled through its translucent fill exactly as the banner's did.
   * 0.7 × #FFF7CC + 0.3 × #FFFFFF = (255, 249.6, 219.3).
   */
  tileIdle: '#FFFADB',
  /**
   * `1:788` is TWO layers: an `rgba(226,255,104,0.7)` box with an opaque `#ECFF9B` rect (`1:789`)
   * drawn over it. The 70% canary is therefore never visible — the composite the designer sees is
   * the solid `#ECFF9B`. Rendering only the translucent layer was ~1 unit off per channel, which
   * is invisible on its own but made the token disagree with the node it cites.
   */
  tileSelected: '#ECFF9B',
  tileDisabled: 'rgba(0,0,0,0.07)',
  /**
   * `275:4690` — the drained CTA bar's fill, `tileDisabled` over white, PRE-COMPOSITED for the
   * same reason as `limeBanner` and `tileIdle`.
   *
   * The disabled bar KEEPS its variant's lift (`250:2421` elevation 2 on Login, `1:821` elevation
   * 3 on the Instant/Scheduled bar), and on Android an elevation shadow renders THROUGH a
   * translucent background. Measured on the emulator: Login's disabled Continue and Scheduled's
   * disabled "Book Now" both read (187…193) at their edges against a correct (237,237,237) in the
   * middle — a dark grey bar with a lighter core, which is not a state the file draws. The two
   * CTAs that pass `flat` (`60:655` Confirm, `338:4558` Confirm) measured (237,237,237) exactly,
   * which is what isolated the lift as the cause rather than the token.
   *
   * 0.07 × #000000 + 0.93 × #FFFFFF = (237.15, 237.15, 237.15).
   *
   * The translucent `tileDisabled` is kept for the disabled TILES (`1:815`), which carry no lift
   * and sit on surfaces that are not always white.
   */
  ctaDisabled: '#EDEDED',
  /** `1:815` / `1:820` — disabled tile ink. */
  black50: 'rgba(0,0,0,0.5)',
  /**
   * `47:6615` + `29:1858` flattened. The frame dims the sheet by stacking a 50% wash under a 50%
   * layer opacity over the `25:1745` scrim, which lands a white sheet area on ~#595959. Expressed
   * as ONE opaque wash because the layer-opacity form would let the screen behind show THROUGH
   * the sheet — harmless on a blank artboard, unreadable over the real Home.
   */
  black65: 'rgba(0,0,0,0.65)',
  /** `1:818` — a disabled struck-through price. */
  black30: 'rgba(0,0,0,0.3)',

  /** `3:1147` — the "Reschedule Booking" action on Confirmation. */
  amber700: '#BB4D00',
  /** `3:1151` — "Cancel Booking & Refund"; also the destructive ink across the file. */
  rose600: '#EC003F',
  /** Spoon — User `color/status/negative-subtle`: the Autopay "Didn't go through" well. */
  coral50: '#FFE8E3',
  /** The delete-account confirmation prompt's rose block — `rose600` at 30%, Figma inspector. */
  rose600Surface: 'rgba(236,0,63,0.3)',
  /** `6:22` — the "Free" fee value on the cancellation policy, NEW in the current Figma file. */
  emerald: '#01CF8F',

  /**
   * `239:2312` — "Incorrect OTP. Please try again" on the OTP error frame. The FIRST genuine error
   * state the design has ever contained.
   *
   * The previous `#D92D20` / `#FEE4E2` pair was authored, not measured — the only two colour
   * tokens in this file that cited no node. Both are now read off `239:2261`.
   */
  danger: '#FF0404',
  /** `239:2294` — the digit boxes on the error frame swap `#FFEF99` for this red tint. */
  dangerSurface: 'rgba(255,4,4,0.07)',
  /** The Account screen's Delete Account row — `#FF0404` at 30%, read off the Figma inspector. */
  dangerSurfaceStrong: 'rgba(255,4,4,0.3)',

  // ---------------------------------------------------------------------------
  // Spoon — User (`cCQlzTeiObQkpVBzwI8mZi`), the redesigned recurring setup. Values are the
  // file's own variables, not measurements.
  // ---------------------------------------------------------------------------
  /** `color/surface/disabled` — the disabled pill CTA. `#00000006`, i.e. black at ~2 %. */
  black02: '#00000006',
  /** `color/text/disabled` — the disabled pill CTA's label. `#00000040`, i.e. black at 25 %. */
  black25: '#00000040',
  /** `color/text/secondary` — struck prices and unselected tab labels. Black at 60 %. */
  black60: 'rgba(0,0,0,0.6)',
  /** `155:1585` / `158:1586` — the inline "Max 14 days reached" error and its dot. */
  red600: '#E53935',
  /** `1073:3181` — "Deleted dates can't be restored": the file's literal `red`, `#FF0000`. */
  red: '#FF0000',

  // ---------------------------------------------------------------------------
  // Recurring setup — Figma `ZIJf639gTWHXshaa2YOeCT` ("Version 1"), frames `4:282` … `4:2005`.
  // A warm stone ramp plus a near-black ink, used across all six steps.
  // ---------------------------------------------------------------------------
  /** Selected cells and tabs, the valid counter, primary copy. */
  ink: '#1A1A1A',
  /** Idle cells, pills and toggles. */
  stone100: '#EEEDE8',
  /** Hint and summary boxes. */
  stone50: '#F2F1EC',
  /** Card and footer edges. */
  stone200: '#E4E2DA',
  /** Unavailable ink ("full" slots, the no-cooks day). */
  stone400: '#B5B3AA',
  /** Days outside the window. */
  stone350: '#C9C7BF',
  /** `4:2014` — Step 6's confirmation disc. */
  stone230: '#E0DED6',
  /** `4:2024` — Step 6's first-visit tile. */
  stone150: '#E6E5DF',
  /** `4:1924` — the "Keep my plan going" card's edge. */
  stone250: '#CFCDC4',
  /** `4:666` — the dashed edge of a start time free on only some days. */
  stone300: '#BDBBB2',
  /** `4:574` — the dashed "+ Add visit" tab edge; `4:1045` a clashing start time's ink. */
  stone500: '#9A988F',
  /** `4:671` — "9/11 days", a start time free on only some days. */
  amber31: '#A06A00',
  /** `4:1156` — a date whose usual time is booked out: its fill, edge and ink. */
  cream50: '#FFF8DB',
  amber44: '#E0A800',
  amber27: '#8A5A00',
  /** `4:1950` — Step 5's intro ("Approve once. …"). */
  grey444: '#444444',
  /** Secondary copy — the range, "Pick 5 to 14 days". */
  grey555: '#555555',
  /** Captions — "Pick 2 more days to continue". */
  grey666: '#666666',
  /** `1351:4412` — the day-picker legend's caption ("Selected", "Start/ End date"). */
  grey6B: '#6B6B6B',
  /** Quiet labels — the weekday letters. */
  grey777: '#777777',

  // ---------------------------------------------------------------------------
  // Cook Pool — Spoon — User (`cCQlzTeiObQkpVBzwI8mZi`), `755:2333` … `848:7809`.
  // ---------------------------------------------------------------------------
  /** `848:7809` — a dish card's name. */
  grey333: '#333333',
  /** `848:7809` — a dish card's idle heart. */
  grey217: '#D9D9D9',
  /** `848:6318` — black at 6 %: the skip tab and a card dragged toward it. */
  black06: 'rgba(0,0,0,0.06)',
  /** `848:6318` — black at 14 %: the skip tab, widened. */
  black14: 'rgba(0,0,0,0.14)',
  /** `848:6318` — black at 35 %: the edge of a card dragged toward skip. */
  black35: 'rgba(0,0,0,0.35)',
  /** `848:6611` — `#FFD600` at 12 %: a card dragged toward add. */
  yellow500Wash: 'rgba(255,214,0,0.12)',

  // ---------------------------------------------------------------------------
  // Recurring landing — Spoon — User (`cCQlzTeiObQkpVBzwI8mZi`), `970:5392` … `970:5546`.
  // ---------------------------------------------------------------------------
  /** `970:5451` — "See the whole flow in under 2 minutes." (Figma has 4; owner, 31 Oct 2026). */
  stone600: '#6B6A60',
  /** `970:5610` — the player's elapsed and total time. */
  stone380: '#B9B8AE',
  /** `970:5608` — the video's scene surface. */
  yellow100: '#FFF9DC',
  /** `970:5600` — the scrim over the page while the video plays: `#0A0A08` at 50 %. */
  scrimPlayer: 'rgba(10,10,8,0.5)',
} as const;

/**
 * Spacing rhythm DERIVED from Page 3a, not authored.
 *
 * The recurring auto-layout gaps / paddings in the frame are 4, 6, 8, 10, 12, 15, 16, 18, 22, 24
 * and 40. The previously authored 4pt scale already carried 4 / 8 / 12 / 16 / 24 — all real
 * values — but it had NO 6, 10, 15, 18, 22 or 40, so every one of those was rounded at the call
 * site (6→4|8, 10→8|12, 18→16, 22→24). That rounding is the direct cause of the designer's
 * "padding is different" / "spacing is wrong" report.
 *
 * The fix is therefore ADDITIVE: the existing steps keep their values (re-valuing them would
 * silently shift ~230 call sites that were never checked against the new file), and the six
 * missing real values join the scale under explicit names.
 */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,

  // --- Values the 4pt scale was missing, each read off a Page 3a node. ---
  /** Body section gap (`1:478`), tile inner gap (`1:578`), section title gap (`1:595`). */
  s6: 6,
  /** Tile horizontal padding (`1:576`), trust-grid gutter (`135:71`). */
  s10: 10,
  /** Exclusion-grid gutter (`139:181`). */
  s15: 15,
  /** Gap between the Instant and Schedule tiles (`1:575`). */
  s18: 18,
  /** Tile vertical padding (`1:576`). */
  s22: 22,
  /** Duration-matrix inter-column gap (`135:95`). */
  s40: 40,
  /** The Autopay "Last used" tag's vertical padding (`2316:3597`). */
  s3: 3,
  /** The Autopay app rows' leading inset and the info card's padding (`2316:3593`, `2316:3630`). */
  s14: 14,
} as const;

/**
 * Radii. Page 3a uses 5 / 10 / 15 / 20 / 24; the corrupt Figma entries (`29826200`, `26843500`)
 * are a pill and are represented as such.
 *
 * Additive for the same reason as `space`: the legacy steps keep their values so untouched
 * screens do not shift, and the real Page 3a radii are named by value.
 */
export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 26,
  xxl: 44,
  pill: 999,

  // --- Real Page 3a radii. ---
  /** Duration-matrix rows (`135:95`). */
  r5: 5,
  /** Trust tiles (`153:501`) and exclusion thumbnails (`156:28`). */
  r10: 10,
  /** Top banner bottom corners (`1:458`). */
  r15: 15,
  /** Promo panels (`1:522`) and cuisine cards (`144:474`). */
  r20: 20,
  /** Instant / Schedule tiles (`1:576`) and section containers. */
  r24: 24,
  /** `1:798` — badge pills on the Instant duration tiles. */
  r6: 6,
  /** `1:788` — the Instant duration tiles themselves. */
  r12: 12,
  /** `53:110` / `275:4485` — the address CTAs, which the finalized file rounds to 30. */
  r30: 30,
} as const;

/**
 * Builds an `rgba()` from one of the founder hexes and an alpha.
 *
 * Used where a fill is a brand colour at a stated opacity — gradient stops, washes — so the value
 * stays PROVABLY derived from the approved palette instead of being written out as a fresh
 * literal that nobody can trace back.
 */
export function withAlpha(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Figma stroke weights. */
export const stroke = {
  hairline: 0.8,
  thin: 1,
  /**
   * `250:2416` — the rule closing the `+91` cell on Login. The current file gives this as
   * `stroke-weight/1_78` = **1.778**; the superseded `53:227` gave 1.67. Sole consumer is
   * `LoginScreen`, so the token is re-valued rather than forked.
   */
  base: 1.778,
  thick: 2,
} as const;

/**
 * Livvic — the founder-approved family. The five required weights ship as project assets in
 * `assets/fonts/` and are registered under these exact names by `expo-font` in
 * `src/app/_layout.tsx`. Nothing resolves a face out of `node_modules` at runtime.
 *
 *   Livvic-Regular.ttf  → `Livvic_400Regular`  (400)
 *   Livvic-Medium.ttf   → `Livvic_500Medium`   (500)
 *   Livvic-SemiBold.ttf → `Livvic_600SemiBold` (600)
 *   Livvic-Bold.ttf     → `Livvic_700Bold`     (700)
 *   Livvic-Black.ttf    → `Livvic_900Black`    (900)
 *
 * React Native does NOT synthesise weights: on Android `fontFamily` + `fontWeight` do not
 * combine, so each weight MUST be addressed as its own family. Typography tokens therefore emit
 * `fontFamily`, never `fontWeight`. Registering by explicit key rather than letting the platform
 * infer a PostScript name is what keeps the mapping identical on Android and iOS.
 */
export const fontFamily = {
  regular: 'Livvic_400Regular',
  medium: 'Livvic_500Medium',
  semibold: 'Livvic_600SemiBold',
  bold: 'Livvic_700Bold',
  black: 'Livvic_900Black',
} as const;

/** Figma `font size/*` on Page 3a. */
export const fontSize = {
  xxs: 9,
  xs: 10,
  sm: 11,
  md: 12,
  lg: 14,
  xl: 16,
  xxl: 18,
  /** `1:744` sheet titles, `1:755` the Instant ETA pill. */
  xxl20: 20,
  xxxl: 22,
} as const;

/** Figma `line height/*`. Values are exact, including the non-round ones. */
export const lineHeight = {
  xxs: 13.33,
  caption: 13.5,
  xs: 15,
  tile: 15.11,
  sm: 16,
  md: 16.5,
  lg: 20,
  xl: 24,
  xxl: 28,
  xxxl: 30,
} as const;

/** Figma `letter spacing/*`. */
export const letterSpacing = {
  tight: -0.4,
  none: 0,
  wide: 0.5,
  /** `letter spacing/1_6` — the Login phone field's dial code and value (`250:2417` / `250:2420`). */
  wider: 1.6,
} as const;

/**
 * Elevation — the designer's "too flat / incorrectly layered" report.
 *
 * Page 3a uses five distinct depths; none of them existed in the token layer before, which is
 * why every surface rendered flush. iOS reads shadow*, Android reads elevation; both are given
 * so a surface has the same weight on either platform. Values are the Figma drop shadows.
 */
export interface Elevation {
  readonly shadowColor: string;
  readonly shadowOffset: { readonly width: number; readonly height: number };
  readonly shadowOpacity: number;
  readonly shadowRadius: number;
  readonly elevation: number;
}

function elevation(
  width: number,
  height: number,
  blur: number,
  opacity: number,
  androidElevation: number,
): Elevation {
  return {
    shadowColor: palette.black,
    shadowOffset: { width, height },
    shadowOpacity: opacity,
    // Figma blur is a diameter; RN shadowRadius is closer to a std-dev, hence the halving.
    shadowRadius: blur / 2,
    elevation: androidElevation,
  };
}

export const elevations = {
  none: elevation(0, 0, 0, 0, 0),
  /** `135:93` duration matrix — the faintest lift in the design. */
  hairline: elevation(0, 0, 1, 0.15, 1),
  /** `130:45` / `130:47` promo side panels (a horizontal drop shadow). */
  side: elevation(1, 0, 2, 0.1, 2),
  /** `1:576` / `129:29` Instant + Schedule tiles. */
  tile: elevation(0, 0, 4, 0.15, 3),
  /** `1:458` sticky top banner. */
  banner: elevation(0, 1, 4, 0.15, 4),
  /** `1:522` promo centre panel — the strongest surface on Home. */
  raised: elevation(0, 0, 4, 0.25, 6),
  /** `1:798` Instant badge — the lightest lift in the file. */
  badge: elevation(0, 1, 1, 0.05, 1),
  /** `63:779` — the map helper pill: a 4pt blur at 10%, softer than `tile`'s 15%. */
  pill: elevation(0, 0, 4, 0.1, 3),
  /** `222:1558` — the out-of-service disc: `0 0 2 rgba(0,0,0,0.07)`. */
  disc: elevation(0, 0, 2, 0.07, 2),
  /** `69:514` — the "Add a new address" bar: the same 1pt blur as `hairline` but at 10%. */
  hairlineSoft: elevation(0, 0, 1, 0.1, 1),
  /**
   * `53:111` / `60:729` — the address CTA's YELLOW glow: `0 4 6 -1 #FEE685`. Figma layers two
   * shadows; React Native supports one per view, so the larger is kept.
   */
  glow: {
    shadowColor: palette.yellow76,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 3,
    elevation: 4,
  } as Elevation,
  /** `99:1610` / `3:1708` / `101:1858` — the ubiquitous `0 0 2 rgba(0,0,0,0.15)` card lift. */
  soft: elevation(0, 0, 2, 0.15, 2),
  /** `99:1622` / `99:1727` — the same shape at 8% for the cook card and its trust row. */
  softer: elevation(0, 0, 2, 0.08, 2),
  /** `1:728` Instant duration tiles and rows. */
  subtle: elevation(0, 1, 1, 0.15, 2),
  /** `1:821` the primary CTA bar — a 3pt blur, tighter than the 4pt used by surfaces. */
  cta: elevation(0, 0, 3, 0.15, 3),
  /** `983:6074` — Spoon — User `Elevation/2`: the Recurring landing's "Book Recurring" tag. */
  tag: elevation(0, 0, 12, 0.1, 4),
} as const;

export type ElevationToken = keyof typeof elevations;

/**
 * INNER shadows. Figma draws exactly one, and `shadow*` cannot express it: `shadowOffset` and
 * friends only ever cast outward.
 *
 * React Native models this through `boxShadow`'s `inset` flag, which is a typed field on
 * `BoxShadowValue` (`StyleSheetTypes.d.ts`) and is implemented on BOTH platforms under the New
 * Architecture — which this app runs (`android/gradle.properties: newArchEnabled=true`,
 * React Native 0.86.2). The ARRAY form is used rather than the CSS string so the value is
 * type-checked instead of parsed at runtime.
 */
export const innerShadows = {
  /** `69:406` — the Profile tiles: `0 0 2 rgba(0,0,0,0.1)`, inset. */
  profileTile: [
    {
      offsetX: 0,
      offsetY: 0,
      blurRadius: 2,
      color: 'rgba(0,0,0,0.1)',
      inset: true,
    },
  ],
  /** `97:1231` — the en-route ETA panel: `0 0 4 rgba(0,0,0,0.15)`, inset. */
  etaPanel: [
    {
      offsetX: 0,
      offsetY: 0,
      blurRadius: 4,
      color: 'rgba(0,0,0,0.15)',
      inset: true,
    },
  ],
  /** Spoon — User `444:10422` — the selected Plan tile: `0 -2 4 rgba(255,214,0,0.9)`, inset. */
  planTileActive: [
    {
      offsetX: 0,
      offsetY: -2,
      blurRadius: 4,
      color: 'rgba(255,214,0,0.9)',
      inset: true,
    },
  ],
  /** `444:10421` — an unselected Plan tile: `0 -1.5 3 #FFEF99`, inset. */
  planTileIdle: [
    {
      offsetX: 0,
      offsetY: -1.5,
      blurRadius: 3,
      color: '#FFEF99',
      inset: true,
    },
  ],
  /** `364:520` — the Plan banner's lift: `0 8 20 -6 rgba(140,102,0,0.18)`. */
  planBanner: [
    {
      offsetX: 0,
      offsetY: 8,
      blurRadius: 20,
      spreadDistance: -6,
      color: 'rgba(140,102,0,0.18)',
    },
  ],
  /** `Elevation/1` — `0 0 3 #00000014`, the selected time-of-day pill (`288:523`). */
  elevation1: [
    {
      offsetX: 0,
      offsetY: 0,
      blurRadius: 3,
      color: 'rgba(0,0,0,0.08)',
    },
  ],
  /** `Elevation/2` — `0 0 12 #0000001A`, the focused duration card (`1219:4271`). */
  elevation2: [
    {
      offsetX: 0,
      offsetY: 0,
      blurRadius: 12,
      color: 'rgba(0,0,0,0.1)',
    },
  ],
  /** `Elevation/3` — `0 0 24 #00000024`, the recurring dialogs (`586:4373`). */
  elevation3: [
    {
      offsetX: 0,
      offsetY: 0,
      blurRadius: 24,
      color: 'rgba(0,0,0,0.14)',
    },
  ],
  /** `444:10250` — the visit flow's Plan card: `0 -2 4 rgba(255,230,102,0.8)`, inset. */
  planCard: [
    {
      offsetX: 0,
      offsetY: -2,
      blurRadius: 4,
      color: 'rgba(255,230,102,0.8)',
      inset: true,
    },
  ],
  /** `444:10424` — the "+" button: `0 -2 4 rgba(255,222,51,0.8)`, inset. */
  planAdd: [
    {
      offsetX: 0,
      offsetY: -2,
      blurRadius: 4,
      color: 'rgba(255,222,51,0.8)',
      inset: true,
    },
  ],
} as const;

/**
 * Every frame in the file is 390pt wide. Layout that is expressed in Figma as a fixed pt value
 * inside a 390pt frame is scaled by this ratio so proportions hold on a 360pt or 412pt device,
 * rather than being clipped or leaving a gutter.
 */
export const BASE_DESIGN_WIDTH = 390;

/** iOS HIG / Material minimum. Enforced by `Button`, `IconButton` and `Chip`. */
export const MIN_TOUCH_TARGET = 44;

/** Android ignores `shadow*` unless a background colour is set; guards against invisible cards. */
export const shadowRequiresBackground = Platform.OS === 'android';

export type Palette = typeof palette;
export type SpaceToken = keyof typeof space;
export type RadiusToken = keyof typeof radius;
export type FontSizeToken = keyof typeof fontSize;
export type FontFamilyToken = keyof typeof fontFamily;
export type TextTokenStyle = Pick<
  TextStyle,
  'fontSize' | 'lineHeight' | 'fontFamily' | 'letterSpacing' | 'textTransform'
>;
export type ViewTokenStyle = ViewStyle;
