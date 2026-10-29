import type { ImageSourcePropType } from 'react-native';

/**
 * Cook Pool view models — Figma `cCQlzTeiObQkpVBzwI8mZi` (Spoon — User): the landing (`844:5842`,
 * `719:1507`, `848:7605`), the selection deck (`755:2333`) and the cook profile (`719:1568`).
 *
 * Every piece of content here is the backend's: names, photos, the lines under a cook's name, the
 * menu's sections and dishes, and the pool's minimum size. The screens add no copy of their own
 * to a cook, and draw every list in the order it arrives — a new line or section the backend
 * starts sending shows up without an app release.
 */

/** A photo the backend points at: a URL in production, a bundled asset in the dev fixtures. */
export type CookPoolImage = ImageSourcePropType;

/** One cook on the landing's pool grid (`719:1507`). */
export interface CookPoolMember {
  readonly cookId: string;
  /** The caption under the avatar — "Meera". */
  readonly name: string;
  readonly photo?: CookPoolImage | undefined;
}

/** The landing: the household's pool, in the backend's order. */
export interface CookPoolSummary {
  readonly members: readonly CookPoolMember[];
  /**
   * How many cooks the pool needs before it counts. The landing keeps empty places on the grid
   * until the pool reaches it (`844:5842`).
   */
  readonly minimumSize: number;
}

/**
 * One line of a cook's profile header (`1380:3196`): "West Bengal", "Speaks Hindi, Bengali",
 * "Visits with you: 45", "Your rating: 4.5 ★". Drawn as `label: value`, or the value alone when the
 * line carries no label.
 */
export interface CookProfileLine {
  readonly id: string;
  readonly label?: string | undefined;
  readonly value: string;
  /**
   * A glyph after the value. The app knows `star` (`855:129`); a key it does not know draws no
   * glyph rather than a wrong one.
   */
  readonly icon?: string | undefined;
}

/** `848:7809` — one dish on a cook's menu. */
export interface CookDish {
  readonly id: string;
  readonly name: string;
  readonly image?: CookPoolImage | undefined;
}

/** `755:2360` — one titled row of a cook's menu ("Curries/ sabzis- Veg"). */
export interface CookMenuSection {
  readonly id: string;
  readonly title: string;
  readonly dishes: readonly CookDish[];
}

/** A cook as the deck card (`755:2347`) and the profile page (`719:1568`) draw them. */
export interface CookProfile {
  readonly cookId: string;
  /** The header's title — "Cook Meera". */
  readonly name: string;
  readonly photo?: CookPoolImage | undefined;
  /**
   * The trust marks above the name (`1380:3194`) — "Spoon trained", "Verified" — drawn uppercased
   * and joined with " · ". Empty draws no eyebrow.
   */
  readonly badges: readonly string[];
  /** Caption lines under the name — Regular 12/16, 60 % ink, joined with " · " on one line. */
  readonly details: readonly CookProfileLine[];
  /** The emphasised lines below them — SemiBold 14/20. */
  readonly stats: readonly CookProfileLine[];
  readonly menu: readonly CookMenuSection[];
  /** Whether the cook is in the household's pool; the profile offers removal only if so. */
  readonly inPool: boolean;
}
