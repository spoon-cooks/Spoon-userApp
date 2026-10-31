import type { ImageSourcePropType } from 'react-native';

/**
 * Recurring landing art, exported from Figma `cCQlzTeiObQkpVBzwI8mZi` at @3x. The Figma export
 * is SVG, which the app has no renderer for, so each is rasterised from its own SVG.
 */

/**
 * `983:6025` — the hero's yellow thread, 434×334 (a 410×330 frame the 8pt stroke overhangs),
 * drawn from the page's left edge less 8.
 */
export const HERO_THREAD =
  require('../../../assets/figma/recurringLanding/hero-thread.png') as ImageSourcePropType;
/**
 * `970:5463` — the thread's tail where the page ends, 390×167 (a 382×159 frame the stroke
 * overhangs by 4 on every side). It picks up from the rail's bottom end.
 */
export const THREAD_TAIL =
  require('../../../assets/figma/recurringLanding/thread-tail.png') as ImageSourcePropType;

/** `789:169` — a ticket's 12pt white notch. */
export const TICKET_NOTCH =
  require('../../../assets/figma/recurringLanding/notch.png') as ImageSourcePropType;

/** `827:117` — 24pt, on the rail beside "Unlock by creating your Cook Pool". */
export const LOCK_OPEN_ICON =
  require('../../../assets/figma/recurringLanding/lock-open.png') as ImageSourcePropType;
/** `947:5014` — 24pt, on the rail beside "One time planning, familiar cooks". */
export const LIKE_ICON =
  require('../../../assets/figma/recurringLanding/like.png') as ImageSourcePropType;

/** `547:2533` — the "Book Recurring" tag's 24pt calendar with a plus. */
export const CALENDAR_ADD_ICON =
  require('../../../assets/figma/recurringLanding/calendar-add.png') as ImageSourcePropType;

/** The "Recurring · Live" tag's 24pt circular arrow — the same icon as Home's Live chip. */
export const RESTART_ICON =
  require('../../../assets/figma/home2/icon-restart.png') as ImageSourcePropType;

/** `983:6052` — "Schedule", 20pt. */
export const SCHEDULE_ICON =
  require('../../../assets/figma/recurringLanding/calendar.png') as ImageSourcePropType;
/** `819:115` — "Pay as you go", 24pt. */
export const PAY_ICON =
  require('../../../assets/figma/recurringLanding/money.png') as ImageSourcePropType;
/** `497:2045` — "On the go flexibility": the same pencil the recurring flow uses. */
export const EDIT_ICON = require('../../../assets/figma/recurring/edit.png') as ImageSourcePropType;
/** `558:170` — "No surprises": the same cook glyph the recurring flow uses. */
export const COOK_ICON =
  require('../../../assets/figma/recurring/cook-visit.png') as ImageSourcePropType;

/**
 * `987:129` — the explainer card's play button: a rounded screen with a play triangle. Figma's
 * SVG export drops the triangle (it is the second subpath of the same vector), so this is
 * rendered from the node's own vector path instead.
 */
export const PLAY_ICON =
  require('../../../assets/figma/recurringLanding/play.png') as ImageSourcePropType;
/** `543:2337` — the explainer card's replay button once the video is watched, 24pt. */
export const REPLAY_ICON =
  require('../../../assets/figma/recurringLanding/restart-card.png') as ImageSourcePropType;

/** `970:5616` — the player's 64pt pause button: the yellow disc with its two bars. */
export const PAUSE_BUTTON =
  require('../../../assets/figma/recurringLanding/pause.png') as ImageSourcePropType;
/** `983:6142` — the player's "back 10 s" arrow, 19pt. */
export const SKIP_ARROW =
  require('../../../assets/figma/recurringLanding/restart-player.png') as ImageSourcePropType;
