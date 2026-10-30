import { useMemo, useSyncExternalStore } from 'react';

import { failed, ready } from '@core/data';
import type { ScreenQuery } from '@core/data';
import { fromStatus } from '@core/errors';

import type { CookPoolActions, CookPoolSource } from './data';
import { toggleFavouriteDish, useFavouriteDishIds } from './favourites';
import { addCook, cookProfile, deckCooks, poolSummary, removeCook } from './pool';
import type { CookPoolState } from './pool';
import type { CookPoolSummary, CookProfile } from './types';

/**
 * DEVELOPMENT ONLY — a `CookPoolSource` over a local store, for the dev preview, which runs
 * outside the signed-in stack and has no backend to read.
 *
 * It behaves as the routes do: the deck deals the served cooks not in the pool (the candidates),
 * an add puts the cook first, a cook the household has never had is a 404. Every change is
 * applied at once and every screen of the preview reads the same store, so each shows it on
 * return. The seed is passed in — this module imports no fixture; the preview route does.
 */
export function createDemoCookPoolSource(seed: CookPoolState): CookPoolSource {
  let current = seed;
  const listeners = new Set<() => void>();

  const update = (next: CookPoolState) => {
    if (next === current) return;
    current = next;
    listeners.forEach((listener) => listener());
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const useStore = () => useSyncExternalStore(subscribe, () => current);
  const noop = () => undefined;

  const actions: CookPoolActions = {
    addCook: (cookId) => update(addCook(current, cookId)),
    removeCook: async (cookId) => update(removeCook(current, cookId)),
  };

  return {
    usePool(): ScreenQuery<CookPoolSummary> {
      const state = useStore();
      return useMemo(() => ({ state: ready(poolSummary(state)), refetch: noop }), [state]);
    },
    useDeck(): ScreenQuery<readonly CookProfile[]> {
      const state = useStore();
      return useMemo(() => ({ state: ready(deckCooks(state)), refetch: noop }), [state]);
    },
    useProfile(cookId: string): ScreenQuery<CookProfile> {
      const state = useStore();
      return useMemo(() => {
        const profile = cookProfile(state, cookId);
        return {
          state:
            profile === undefined
              ? failed(fromStatus(404, { code: 'RESOURCE_NOT_FOUND', message: 'Cook not found' }))
              : ready(profile),
          refetch: noop,
        };
      }, [state, cookId]);
    },
    useActions: () => actions,
    // The preview has no session to save a like against: its hearts last until the app closes.
    useDishLikes() {
      const liked = useFavouriteDishIds();
      return useMemo(() => ({ liked, toggle: toggleFavouriteDish }), [liked]);
    },
  };
}
