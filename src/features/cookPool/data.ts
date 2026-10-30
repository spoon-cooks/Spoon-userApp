import { createContext, createElement, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

import { LOADING, ready } from '@core/data';
import type { DataState, ScreenQuery } from '@core/data';
import { normalizeError } from '@core/errors';
import { useRecurringEligibility } from '@features/recurringSetup';

import {
  DEFAULT_MINIMUM_SIZE,
  cookPoolSummaryFrom,
  cookProfileFrom,
  deckCooksFrom,
} from './adapters';
import {
  useAddCookToPool,
  useCookPoolCandidates,
  useCookPoolList,
  useCookPoolProfile,
  useDishLikesQuery,
  useRemoveCookFromPool,
  useSetDishLike,
} from './api';
import type { CookPoolCandidatesDto } from './api';
import type { CookPoolSummary, CookProfile } from './types';

/**
 * The Cook Pool's data seam — DEC-085's `/v1/me/cooks` routes.
 *
 *  - the landing (`719:1507`)  ← `GET /v1/me/cooks`, with Recurring's `unlockThreshold` as the
 *    pool's minimum
 *  - the deck (`755:2333`)     ← `GET /v1/me/cooks/candidates`
 *  - a profile (`719:1568`)    ← `GET /v1/me/cooks/:cookId`
 *  - Add / swipe right         → `POST /v1/me/cooks`; Remove → `DELETE /v1/me/cooks/:cookId`
 *  - a dish's heart            ← `GET /v1/me/dish-likes`; → `PUT` / `DELETE /v1/me/dish-likes/:dishCode`
 *
 * Skip and Undo stay on the device: the backend stores no skips. Dish likes (DEC-115) belong to
 * the household, so a dish liked on one cook is liked on every cook who cooks it.
 *
 * The reads come from a `CookPoolSource`. The app's is the API, and it is the default, so a
 * screen outside any provider reads the backend. The dev preview, which runs with no session,
 * provides the local demo store instead (`demoSource.ts`); the screens cannot tell the two apart.
 */

export interface CookPoolActions {
  /**
   * Puts the cook in the pool. The deck does not wait: the card has already flown, and the
   * landing reads the pool as the server has it when the customer returns to it.
   */
  readonly addCook: (cookId: string) => void;
  /** Resolves once the pool no longer holds the cook; rejects with the failure otherwise. */
  readonly removeCook: (cookId: string) => Promise<void>;
}

/** The dish cards' hearts: which dishes the household likes, and a tap on one. */
export interface DishLikes {
  /** Liked dish codes. Empty until the likes have loaded, or if they could not be read. */
  readonly liked: ReadonlySet<string>;
  readonly toggle: (dishCode: string) => void;
}

export interface CookPoolSource {
  readonly usePool: () => ScreenQuery<CookPoolSummary>;
  readonly useDeck: () => ScreenQuery<readonly CookProfile[]>;
  readonly useProfile: (cookId: string) => ScreenQuery<CookProfile>;
  readonly useActions: () => CookPoolActions;
  readonly useDishLikes: () => DishLikes;
}

/**
 * A read's state carried through an adapter: loading and errors pass through untouched. `adapt`
 * must be a stable (module-level) function.
 */
function useMapped<TFrom, TTo>(
  query: ScreenQuery<TFrom>,
  adapt: (data: TFrom) => TTo,
): ScreenQuery<TTo> {
  const state = useMemo<DataState<TTo>>(
    () => (query.state.status === 'ready' ? ready(adapt(query.state.data)) : query.state),
    [query.state, adapt],
  );
  return { state, refetch: query.refetch };
}

/**
 * The landing waits for Recurring's eligibility as well as the pool, so its empty places do not
 * jump from one count to another a moment after it draws. An eligibility read that FAILS does not
 * fail the landing: the pool is still worth showing, with the design's minimum.
 */
function useApiPool(): ScreenQuery<CookPoolSummary> {
  const pool = useCookPoolList();
  const eligibility = useRecurringEligibility();

  const state = useMemo<DataState<CookPoolSummary>>(() => {
    if (pool.state.status !== 'ready') return pool.state;
    if (eligibility.state.status === 'loading') return LOADING;
    const minimumSize =
      eligibility.state.status === 'ready'
        ? eligibility.state.data.unlockThreshold
        : DEFAULT_MINIMUM_SIZE;
    return ready(cookPoolSummaryFrom(pool.state.data, minimumSize));
  }, [pool.state, eligibility.state]);

  const { refetch: refetchPool } = pool;
  const { refetch: refetchEligibility } = eligibility;
  const refetch = useCallback(() => {
    refetchPool();
    refetchEligibility();
  }, [refetchPool, refetchEligibility]);

  return { state, refetch };
}

const deckFrom = (candidates: CookPoolCandidatesDto) => deckCooksFrom(candidates.cooks);

function useApiDeck(): ScreenQuery<readonly CookProfile[]> {
  return useMapped(useCookPoolCandidates(), deckFrom);
}

/** A cook the household has neither tried nor pooled is the backend's 404. */
function useApiProfile(cookId: string): ScreenQuery<CookProfile> {
  return useMapped(useCookPoolProfile(cookId), cookProfileFrom);
}

function useApiActions(): CookPoolActions {
  const { mutate: add } = useAddCookToPool();
  const { mutateAsync: remove } = useRemoveCookFromPool();

  return useMemo<CookPoolActions>(
    () => ({
      // A refused add (an unavailable cook) has nothing to show on a card that has already
      // gone; the invalidation that follows puts the landing and the deck right.
      addCook: (cookId) => add({ cookId }),
      removeCook: (cookId) =>
        remove({ cookId }).catch((error: unknown) => {
          // Already out of the pool (removed on another device): what was asked for is true.
          if (normalizeError(error).code === 'RESOURCE_NOT_FOUND') return;
          throw error;
        }),
    }),
    [add, remove],
  );
}

const NO_DISH_CODES: readonly string[] = [];

/**
 * The hearts as the server has them. A heart that cannot be read draws empty rather than failing
 * the profile: the menu is still worth showing, and the next read fills it in.
 */
function useApiDishLikes(): DishLikes {
  const { state } = useDishLikesQuery();
  const { mutate } = useSetDishLike();
  const codes = state.status === 'ready' ? state.data.dishCodes : NO_DISH_CODES;
  const liked = useMemo<ReadonlySet<string>>(() => new Set(codes), [codes]);
  const toggle = useCallback(
    (dishCode: string) => mutate({ dishCode, liked: !liked.has(dishCode) }),
    [mutate, liked],
  );
  return useMemo(() => ({ liked, toggle }), [liked, toggle]);
}

export const API_COOK_POOL_SOURCE: CookPoolSource = {
  usePool: useApiPool,
  useDeck: useApiDeck,
  useProfile: useApiProfile,
  useActions: useApiActions,
  useDishLikes: useApiDishLikes,
};

const CookPoolSourceContext = createContext<CookPoolSource>(API_COOK_POOL_SOURCE);

/**
 * Swaps where the Cook Pool reads from. The value must stay the same object for the provider's
 * lifetime: its members are hooks, and changing them between renders would change the hooks a
 * screen calls.
 */
export function CookPoolSourceProvider({
  source,
  children,
}: {
  readonly source: CookPoolSource;
  readonly children: ReactNode;
}) {
  return createElement(CookPoolSourceContext.Provider, { value: source }, children);
}

/** The landing (`719:1507`): the household's pool and its minimum size. */
export function useCookPool(): ScreenQuery<CookPoolSummary> {
  return useContext(CookPoolSourceContext).usePool();
}

/** The deck (`755:2333`): the cooks who have served the household and are not in its pool. */
export function useCookPoolDeck(): ScreenQuery<readonly CookProfile[]> {
  return useContext(CookPoolSourceContext).useDeck();
}

/** One cook's profile (`719:1568`). */
export function useCookProfile(cookId: string): ScreenQuery<CookProfile> {
  return useContext(CookPoolSourceContext).useProfile(cookId);
}

export function useCookPoolActions(): CookPoolActions {
  return useContext(CookPoolSourceContext).useActions();
}

/** The dish cards' hearts, on the profile and the deck alike. */
export function useDishLikes(): DishLikes {
  return useContext(CookPoolSourceContext).useDishLikes();
}
