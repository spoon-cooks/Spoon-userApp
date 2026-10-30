/**
 * Fixture data for the recurring live booking rate card and its "Tell us more" sheet, read
 * verbatim off Figma `cCQlzTeiObQkpVBzwI8mZi` page `1005:131`: `1501:6628` (first look),
 * `1501:6696` (4.5), `1501:6846` (5+), `1501:7335` (3–3.5), `1501:7481` (2–2.5), `1501:7630`
 * (1–1.5) and `1501:7201` (Tell us more). STATIC ONLY — nothing here comes from a backend.
 */

/**
 * What the customer can pick: a half-step score on the five stars, or the `5+` burst.
 *
 * Named apart from `@ui`'s `RatingValue` (the one-off Completion widget's nine-chip scale) so the
 * two can be imported side by side.
 */
export type VisitRatingValue = 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 | 5 | '5+';

export const VISIT_RATING_PLUS = '5+';

/**
 * The card's five drawn moods. `idle` is `1501:6628`; the rest follow from the score:
 *   loved         4 – 5     `1501:6696`
 *   magic         5+        `1501:6846`
 *   belowPar      3 – 3.5   `1501:7335`
 *   disappointing 2 – 2.5   `1501:7481`
 *   veryPoor      1 – 1.5   `1501:7630`
 */
export type RatingTier = 'idle' | 'loved' | 'magic' | 'belowPar' | 'disappointing' | 'veryPoor';

export function ratingTier(value: VisitRatingValue | null): RatingTier {
  if (value === null) return 'idle';
  if (value === VISIT_RATING_PLUS) return 'magic';
  if (value >= 4) return 'loved';
  if (value >= 3) return 'belowPar';
  if (value >= 2) return 'disappointing';
  return 'veryPoor';
}

/** The sticker numeral: "4.5", "5+", "1" — integers drawn without a decimal (`1501:7664`). */
export function formatRating(value: VisitRatingValue): string {
  return String(value);
}

export interface RatingTierCopy {
  readonly headline: string;
  readonly body: string;
  /** The chip block's label. */
  readonly chipsLabel: string;
  /** `2093:6050` — the feedback block's heading and nudge. */
  readonly feedbackTitle: string;
  readonly feedbackBody: string;
  /**
   * `1501:7471` — "Prefer a different cook next time?", drawn only below 4 (dev note `2238:930`).
   * ON excludes this cook from future matching for the household.
   */
  readonly differentCook: boolean;
  readonly submit: string;
  /** Under the headline once the rating is submitted (`2513:1798`, one line per mood). */
  readonly submittedBody: string;
}

/** `1501:7475` / `1501:7476`. */
export const RATING_DIFFERENT_COOK = {
  title: 'Prefer a different cook next time?',
  body: 'We’ll match you with someone new',
} as const;

/**
 * The tier copy for a cook by first name (the frames' Asha in the preview). Bands per dev note
 * `2238:908`: below 4 is the Poor card, 4 – 5 the Rated card, 5+ its own.
 */
export function ratingTierCopy(
  cookName: string,
): Record<Exclude<RatingTier, 'idle'>, RatingTierCopy> {
  const good = {
    feedbackTitle: `Tell ${cookName} what made it special`,
    feedbackBody: 'A 10-sec voice note means more to her than stars',
    differentCook: false,
    submit: 'Submit',
    submittedBody: `${cookName} will see your rating and note after the visit.`,
  } as const;
  // `1517:9301` — every score below 4 draws the same Poor card.
  const poor: RatingTierCopy = {
    headline: 'We’re so sorry',
    body: 'It’s heartbreaking. Tell us what went wrong, we’ll act on it immediately.',
    chipsLabel: 'What went wrong?',
    feedbackTitle: 'Show us what went wrong',
    feedbackBody: 'A photo or quick note helps us fix it better and fast',
    differentCook: true,
    submit: 'Submit',
    // `2513:1798` Mood=Bad — the Spoon team, not the cook, follows a low rating up.
    submittedBody: 'Our team is looking into this and will get back to you.',
  };
  return {
    loved: {
      headline: 'Loved it!',
      body: `${cookName} will be thrilled. Anything that made it special?`,
      chipsLabel: 'What stood out?',
      ...good,
    },
    magic: {
      headline: 'Off the charts!',
      body: `We’ll make sure ${cookName} hears this. What made it amazing?`,
      chipsLabel: 'What made it amazing?',
      ...good,
      // `2513:1798` Mood=5+.
      submittedBody: `Your 5+ is on its way to ${cookName}. She’ll hear it after the visit.`,
    },
    belowPar: poor,
    disappointing: poor,
    veryPoor: poor,
  };
}

export const RATING_TIER_COPY = ratingTierCopy('Asha');

export interface RatingChip {
  readonly key: string;
  readonly label: string;
}

/** `1501:6809` — the positive chips, in drawn order. */
export const RATING_CHIPS_POSITIVE: readonly RatingChip[] = [
  { key: 'taste', label: 'Taste' },
  { key: 'onTime', label: 'On time' },
  { key: 'variety', label: 'Dish variety' },
  { key: 'polite', label: 'Polite' },
  { key: 'fast', label: 'Fast' },
  { key: 'portion', label: 'Portion' },
  { key: 'hygiene', label: 'Hygiene' },
];

/** `1501:7431` — the negative chips, in drawn order. */
export const RATING_CHIPS_NEGATIVE: readonly RatingChip[] = [
  { key: 'taste', label: 'Taste' },
  { key: 'slow', label: 'Slow' },
  { key: 'portion', label: 'Portion' },
  { key: 'hygiene', label: 'Hygiene' },
  { key: 'rude', label: 'Rude' },
  { key: 'burnt', label: 'Burnt' },
  { key: 'oil', label: 'Too much oil' },
];

/** The chips each frame draws ticked. */
export const RATING_CHIPS_POSITIVE_PICKED: readonly string[] = ['taste', 'onTime', 'hygiene'];
export const RATING_CHIPS_NEGATIVE_PICKED: readonly string[] = ['taste', 'slow'];

/** `1501:6631` — the card's header row. */
export const RATING_VISIT_FIXTURE = {
  title: 'Lunch with Cook Asha',
  meta: 'Sun, 12 Apr · 1:15 PM · 1 hr',
  cookName: 'Asha',
} as const;

// --- Feedback block (`2093:6050`) ---------------------------------------------------------------

/** `2093:5682` — the voice note's 38 bars as drawn, in points (2.45 wide, 2.52 apart, 30.8 tall). */
export const VOICE_NOTE_BARS: readonly number[] = [
  26.773, 26.102, 8.642, 22.433, 21.114, 10.484, 8.704, 17.977, 21.528, 8.237, 25.431, 28.648,
  15.252, 11.869, 9.36, 13.012, 7.814, 23.17, 29.932, 17.528, 16.138, 20.899, 12.242, 7.723, 16.186,
  24.631, 16.812, 18.102, 28.593, 20.5, 7.951, 8.939, 14.366, 13.517, 16.987, 30.116, 24.777, 8.519,
];

/** The frames' recorded note: "0:23". */
export const VOICE_NOTE_FIXTURE_MS = 23_000;
