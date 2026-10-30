import type { ViewStyle } from 'react-native';

import { fontFamily } from '@ui/tokens/primitives';

/**
 * Colours, type and elevations for the redesigned flows (address, cancellation, service) — Figma `cCQlzTeiObQkpVBzwI8mZi`
 * (Spoon--User), page "V1: booking flow", section "Address flow- add, edit, delete". The same
 * design-system file as the redesigned Home and Login, so the values match theirs; the app-wide
 * `lightTheme` comes from an older file and does not.
 */
export const C = {
  base: '#FFFFFF',
  /** `color/brand/primary`. */
  brand: '#FFD600',
  /** `color/brand/primary-tint` — selected chip, receiver wells. */
  tint: '#FFE666',
  /** `color/border/default` — input and chip outlines, dashed dividers. */
  border: '#FFEF99',
  /** `color/surface/subtle`. */
  subtle: '#FFF7CC',
  /** `color/status/positive` — "Current selection" / "Last used" tag. */
  positive: '#CFFF04',
  text: '#000000',
  textSecondary: 'rgba(0,0,0,0.6)',
  textDisabled: 'rgba(0,0,0,0.25)',
  /** The Button component's Disabled fill, as the Login frames render it. */
  surfaceDisabled: 'rgba(0,0,0,0.1)',
  /** `color/border/strong` — the focused search field, the Delete outline. */
  borderStrong: '#000000',
} as const;

/** The yellow gradients the flow repeats, as start → end pairs. */
export const GRADIENT = {
  /** Screen headers: `#FFF7CC` → `#FFE666`, top to bottom. */
  header: ['#FFF7CC', '#FFE666'] as const,
  /** Search header: `#FFF7CC` → white. */
  searchHeader: ['#FFF7CC', '#FFFFFF'] as const,
  /** Call-to-action cards (Add a new address, Use my current location): left → right. */
  action: ['#FFF3A6', '#FFD600'] as const,
  /** Selected property-type tile: top → bottom. */
  tile: ['#FFF3A6', '#FFD600'] as const,
  /** The map sheet's pinned-place card: left → right. */
  pinned: ['#FFF3A6', 'rgba(255,247,204,0.4)'] as const,
};

export const F = fontFamily;

/** Elevation/1 — `0 0 3 #00000014`. */
export const SHADOW_1: ViewStyle = {
  boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 3, color: 'rgba(0,0,0,0.08)' }],
};

/** Elevation/2 — `0 0 12 #0000001A`. */
export const SHADOW_2: ViewStyle = {
  boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 12, color: 'rgba(0,0,0,0.1)' }],
};

/** Elevation/3 — `0 0 24 #00000024`: bottom sheets. */
export const SHADOW_3: ViewStyle = {
  boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 24, color: 'rgba(0,0,0,0.14)' }],
};

/** The Button's and saved cards' own `drop-shadow 0 0 1.5 #00000014`. */
export const SHADOW_HAIRLINE: ViewStyle = {
  boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 1.5, color: 'rgba(0,0,0,0.08)' }],
};

/** The map's search field: `drop-shadow 0 0 6 rgba(0,0,0,0.1)`. */
export const SHADOW_FIELD: ViewStyle = {
  boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 6, color: 'rgba(0,0,0,0.1)' }],
};

/** Figma type styles used by the flow (Livvic). */
export const T = {
  displayLarge: { fontFamily: F.bold, fontSize: 28, lineHeight: 32, letterSpacing: -0.56 },
  display: { fontFamily: F.bold, fontSize: 24, lineHeight: 32 },
  title: { fontFamily: F.bold, fontSize: 20, lineHeight: 28 },
  heading: { fontFamily: F.semibold, fontSize: 18, lineHeight: 26 },
  emphasis: { fontFamily: F.semibold, fontSize: 16, lineHeight: 24 },
  button: { fontFamily: F.bold, fontSize: 16, lineHeight: 24 },
  body: { fontFamily: F.regular, fontSize: 14, lineHeight: 20 },
  bodyStrong: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: F.regular, fontSize: 12, lineHeight: 16 },
  captionStrong: { fontFamily: F.semibold, fontSize: 12, lineHeight: 16 },
  micro: { fontFamily: F.regular, fontSize: 10, lineHeight: 14 },
  microStrong: { fontFamily: F.semibold, fontSize: 10, lineHeight: 14 },
} as const;

/**
 * A Figma linear gradient's `gradientTransform` (`[[a, b, c], [d, e, f]]`, node box → gradient
 * space) as `expo-linear-gradient` start/end points. Both are fractions of the box, so this is
 * exact on a card of any shape — unlike an angle, which only holds for a square: Figma's gradient
 * line runs from (0, 0.5) to (1, 0.5) in gradient space, mapped back into the box here.
 */
export function figmaGradient(transform: readonly [readonly number[], readonly number[]]): {
  start: { x: number; y: number };
  end: { x: number; y: number };
} {
  const [[a = 1, b = 0, c = 0], [d = 0, e = 1, f = 0]] = transform;
  const det = a * e - b * d;
  const point = (u: number, v: number) => ({
    x: (e * (u - c) - b * (v - f)) / det,
    y: (a * (v - f) - d * (u - c)) / det,
  });
  return { start: point(0, 0.5), end: point(1, 0.5) };
}

/**
 * A CSS `linear-gradient(<deg>)` as `expo-linear-gradient` start/end points (unit square): 0° runs
 * bottom → top, 90° left → right, clockwise from there.
 */
export function gradientAngle(degrees: number): {
  start: { x: number; y: number };
  end: { x: number; y: number };
} {
  const radians = (degrees * Math.PI) / 180;
  const dx = Math.sin(radians) / 2;
  const dy = -Math.cos(radians) / 2;
  return { start: { x: 0.5 - dx, y: 0.5 - dy }, end: { x: 0.5 + dx, y: 0.5 + dy } };
}
