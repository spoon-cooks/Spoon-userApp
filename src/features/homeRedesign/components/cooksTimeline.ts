import type { Keyframe, Track } from '@ui/motion/keyframes';

/**
 * `1290:1280` — the "Cooks you can trust" stack, as Figma animates it on the hero's 8s loop
 * (`get_motion_context`, cards `1290:1905` / `1929` / `1949` / `1963`).
 *
 * The four cards rise in one after another, 17.5% of the loop apart. Each lands 70pt up from below
 * as it fades in; every card that lands after it pushes it 17.625pt further up and 5% smaller, so
 * the earlier cooks peek out above the newest one. Near the end the whole stack lifts 16pt and fades,
 * then snaps back below, hidden, for the next loop.
 *
 * Figma exports the four tracks separately; they differ only by when the card enters and how many
 * land after it, so they are built here from that one rule (pinned to the export in the test).
 */
export const COOKS_LOOP_MS = 8000;
export const COOKS_CARD_COUNT = 4;

/** Percent of the loop at which the first card starts to rise, and the gap to the next. */
const FIRST_ENTRY = 3.75;
const ENTRY_GAP = 17.5;
/** Rising in: 70pt below, landed 8.75% later (`cubic-bezier(0.22, 1.2, 0.36, 1)`). */
const RISE_FROM = 70;
const RISE = 8.75;
/** The fade in, 5.625% from the entry. */
const FADE_IN = 5.625;
/** Each later card: 17.625pt up and 5% smaller, over its own 8.75% rise. */
const PUSH_UP = 17.625;
const SHRINK = 0.05;
/** The exit: lift 16pt and fade from 86.25% to 93.75%, then back below by 94.375%. */
const EXIT_START = 86.25;
const EXIT_END = 93.75;
const EXIT_LIFT = 16;
const RESET = 94.375;

/**
 * `index` is the order the card enters in (0 first); the last to enter sits on top. `count` is how
 * many cards the stack holds — the backend's list, at most four — so fewer cooks still stack.
 */
export function cookCardTracks(
  index: number,
  count: number = COOKS_CARD_COUNT,
): {
  opacity: Track;
  translateY: Track;
  scale: Track;
} {
  const entry = FIRST_ENTRY + ENTRY_GAP * index;
  const later = Array.from({ length: count - 1 - index }, (_, i) => entry + ENTRY_GAP * (i + 1));
  const restY = -PUSH_UP * later.length;
  const restScale = 1 - SHRINK * later.length;

  const opacity: Track = [
    [0, 0],
    [entry, 0, 'out'],
    [entry + FADE_IN, 1],
    [EXIT_START, 1, 'in'],
    [EXIT_END, 0],
    [100, 0],
  ];

  const translateY: Keyframe[] = [
    [0, RISE_FROM],
    [entry, RISE_FROM, 'land'],
    [entry + RISE, 0],
  ];
  later.forEach((start, i) => {
    translateY.push([start, -PUSH_UP * i, 'inOut'], [start + RISE, -PUSH_UP * (i + 1)]);
  });
  translateY.push(
    [EXIT_START, restY, 'in'],
    [EXIT_END, restY - EXIT_LIFT, 'step'],
    [RESET, RISE_FROM],
    [100, RISE_FROM],
  );

  // The last card in never shrinks.
  const scale: Keyframe[] = [[0, 1]];
  if (later.length > 0) {
    later.forEach((start, i) => {
      scale.push([start, 1 - SHRINK * i, 'inOut'], [start + RISE, 1 - SHRINK * (i + 1)]);
    });
    scale.push([EXIT_END, restScale, 'step'], [RESET, 1]);
  }
  scale.push([100, 1]);

  return { opacity, translateY, scale };
}

/** Reduce Motion: all four landed and stacked, before the exit. */
export const COOKS_REST_PROGRESS = 0.75;
