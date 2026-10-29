import type {
  CookMenuSection,
  CookPoolImage,
  CookPoolSummary,
  CookProfile,
  CookProfileLine,
} from './types';

/**
 * The Cook Pool as a local store — the dev preview's source (`demoSource.ts`), which runs with no
 * session — and the reads the screens take from it.
 *
 * Shaped after what the backend holds (DEC-085): the cooks who have served the household and
 * which of them are in its pool. Every read keeps the order the lists arrive in; nothing here
 * sorts. Dish favourites are not here: they are local in the app too (`favourites.ts`).
 */

/** A cook who has served the household, as the backend would send them. */
export interface ServedCook {
  readonly cookId: string;
  /** The profile's title — "Cook Meera". */
  readonly name: string;
  /** The pool grid's caption — "Meera". */
  readonly shortName: string;
  readonly photo?: CookPoolImage | undefined;
  readonly badges: readonly string[];
  readonly details: readonly CookProfileLine[];
  readonly stats: readonly CookProfileLine[];
  readonly menu: readonly CookMenuSection[];
}

export interface CookPoolState {
  readonly minimumSize: number;
  /** Every cook who has served the household — the deck's order. */
  readonly servedCooks: readonly ServedCook[];
  /** The pool, newest first (`GET /v1/me/cooks`'s order). */
  readonly poolIds: readonly string[];
}

/** Puts a cook in the pool, newest first. Already there: unchanged. */
export function addCook(state: CookPoolState, cookId: string): CookPoolState {
  if (state.poolIds.includes(cookId)) return state;
  if (!state.servedCooks.some((cook) => cook.cookId === cookId)) return state;
  return { ...state, poolIds: [cookId, ...state.poolIds] };
}

/** Takes a cook out of the pool. Not there: unchanged. */
export function removeCook(state: CookPoolState, cookId: string): CookPoolState {
  if (!state.poolIds.includes(cookId)) return state;
  return { ...state, poolIds: state.poolIds.filter((id) => id !== cookId) };
}

/** The landing's pool grid. */
export function poolSummary(state: CookPoolState): CookPoolSummary {
  const byId = new Map(state.servedCooks.map((cook) => [cook.cookId, cook]));
  return {
    minimumSize: state.minimumSize,
    members: state.poolIds.flatMap((cookId) => {
      const cook = byId.get(cookId);
      return cook === undefined ? [] : [{ cookId, name: cook.shortName, photo: cook.photo }];
    }),
  };
}

/**
 * The deck: the cooks who have served the household and are not in its pool — what
 * `GET /v1/me/cooks/candidates` serves.
 */
export function deckCooks(state: CookPoolState): readonly CookProfile[] {
  return state.servedCooks
    .filter((cook) => !state.poolIds.includes(cook.cookId))
    .map((cook) => toProfile(cook, false));
}

export function cookProfile(state: CookPoolState, cookId: string): CookProfile | undefined {
  const cook = state.servedCooks.find((entry) => entry.cookId === cookId);
  return cook === undefined ? undefined : toProfile(cook, state.poolIds.includes(cookId));
}

/**
 * How many empty places the landing's grid keeps after the pool's cooks: enough to reach the
 * minimum, and always one — the "Add" place that opens the deck.
 */
export function emptyPlaces(memberCount: number, minimumSize: number): number {
  return Math.max(1, minimumSize - memberCount);
}

function toProfile(cook: ServedCook, inPool: boolean): CookProfile {
  return {
    cookId: cook.cookId,
    name: cook.name,
    photo: cook.photo,
    badges: cook.badges,
    details: cook.details,
    stats: cook.stats,
    menu: cook.menu,
    inPool,
  };
}
