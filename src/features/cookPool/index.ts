/**
 * Feature: Cook Pool — the household's preferred cooks (DEC-085). The landing shows the pool; the
 * deck adds cooks who have served the household by swiping; a cook's profile shows their menu and
 * can take them out of the pool. `CookPoolFlow` runs all three in one place for the dev preview,
 * over `createDemoCookPoolSource` in a `CookPoolSourceProvider`.
 */
export { CookPoolScreen } from './screens/CookPoolScreen';
export type { CookPoolScreenProps } from './screens/CookPoolScreen';
export { CookPoolDeckScreen } from './screens/CookPoolDeckScreen';
export type { CookPoolDeckScreenProps } from './screens/CookPoolDeckScreen';
export { CookProfileScreen } from './screens/CookProfileScreen';
export type { CookProfileScreenProps } from './screens/CookProfileScreen';
export { CookPoolFlow } from './screens/CookPoolFlow';
export type { CookPoolFlowProps } from './screens/CookPoolFlow';
export { API_COOK_POOL_SOURCE, CookPoolSourceProvider, useDishLikes } from './data';
export type { CookPoolActions, CookPoolSource, DishLikes } from './data';
export { createDemoCookPoolSource } from './demoSource';
/** A pooled cook's profile as the app draws it (lines, stats and the menu with dish pictures). */
export { cookCardLines, cookProfileFrom } from './adapters';
export * from './api';
export type { CookPoolState, ServedCook } from './pool';
export type {
  CookDish,
  CookMenuSection,
  CookPoolImage,
  CookPoolMember,
  CookPoolSummary,
  CookProfile,
  CookProfileLine,
} from './types';
