/**
 * The explainer video's transport — what the player's buttons and scrubber do to the playhead,
 * and when the video counts as watched. Pure, so it can be tested without a player.
 *
 * Positions and durations are whole or fractional seconds; the screen turns them into the
 * `m:ss` the player draws (`970:5610` "1:52", `970:5624` "3:45").
 */

/**
 * The explainer's length, shown until the video itself reports one: 1:17, the video set in Remote
 * Config on 31 Oct 2026 (`recurring-explainer-v1.mp4`). Figma `970:5624` drew 3:45.
 */
export const VIDEO_DURATION_SECONDS = 77;
/** `970:5612` / `970:5620` — the skip buttons move the playhead 10 s. */
export const SKIP_SECONDS = 10;

/** `m:ss`, the minutes unpadded: 112 → "1:52", 225 → "3:45". A fraction of a second is dropped. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const rest = whole % 60;
  return `${Math.floor(whole / 60)}:${rest < 10 ? '0' : ''}${rest}`;
}

/** A position held inside the video, `0` … `duration`. */
export function clampPosition(position: number, duration: number): number {
  if (!Number.isFinite(position)) return 0;
  return Math.min(Math.max(position, 0), Math.max(duration, 0));
}

/** The playhead after a skip of `delta` seconds (negative goes back), stopped at either end. */
export function skipBy(position: number, delta: number, duration: number): number {
  return clampPosition(position + delta, duration);
}

/** The playhead after `elapsed` seconds of playing. */
export function advance(position: number, elapsed: number, duration: number): number {
  return clampPosition(position + Math.max(elapsed, 0), duration);
}

/** How far through the video the playhead is, `0` … `1`. */
export function progressOf(position: number, duration: number): number {
  return duration > 0 ? clampPosition(position, duration) / duration : 0;
}

/**
 * The position a touch at `x` (from the track's left edge) on a track `trackWidth` wide stands
 * for — a touch beyond either end is that end.
 */
export function positionAt(x: number, trackWidth: number, duration: number): number {
  if (trackWidth <= 0) return 0;
  return clampPosition((x / trackWidth) * duration, duration);
}

/**
 * The playhead is at the end. This is what makes the video watched (`970:5472`): the moment it
 * gets there, whether it played there or was scrubbed there. Watched stays watched — the page
 * keeps it, so replaying the video does not undo it.
 */
export function hasEnded(position: number, duration: number): boolean {
  return duration > 0 && position >= duration;
}
