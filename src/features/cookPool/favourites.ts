import { useSyncExternalStore } from 'react';

/**
 * DEVELOPMENT ONLY — the dish card's heart (`848:7809`) for the dev preview (`demoSource.ts`),
 * which runs with no session to save a like against. A heart lives in memory until the app is
 * closed. The signed-in app saves likes on the backend instead (`useDishLikes`, DEC-115).
 */

let favourites: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function toggleFavouriteDish(dishId: string): void {
  const next = new Set(favourites);
  if (next.has(dishId)) next.delete(dishId);
  else next.add(dishId);
  favourites = next;
  listeners.forEach((listener) => listener());
}

/** The dishes hearted this session. */
export function useFavouriteDishIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => favourites);
}
