import type { DishGlyphKey } from '@ui/components/dishGlyphs';
import type { CookViewModel, DishViewModel } from '@ui/types/viewModels';

/**
 * DEMO / TEST FIXTURES — NOT PRODUCTION DATA.
 *
 * Everything in `src/demo/` exists to exercise components before a backend contract exists. It is
 * never imported by a feature module or a production screen; the only consumers are the component
 * showcase (`src/app/(dev)/showcase.tsx`, dev-only) and tests.
 *
 * These are made-up sample cooks. No real cook's name, photograph or dishes are written in the app
 * (DEC-114): real cooks come from the backend. The samples carry no photograph, so the card draws
 * its initials disc.
 */

function dishes(
  ...entries: readonly (readonly [string, DishGlyphKey])[]
): readonly DishViewModel[] {
  return entries.map(([label, glyph]) => ({
    id: label.toLowerCase().replace(/[^a-z]+/g, '-'),
    label,
    glyph,
  }));
}

const MIXED_DISHES = dishes(
  ['Chicken biryani', 'poultryLeg'],
  ['Fish curries', 'fish'],
  ['Mutton curries', 'meat'],
  ['Lauki variants', 'cucumber'],
  ['Chola bhatura', 'naan'],
  ['Chutney variants', 'tomato'],
  ['Pyaaz/ gobi pakode', 'onion'],
  ['Pav bhaji', 'beefBurger'],
  ['Momo variants', 'dimSum'],
);

const VEG_DISHES = dishes(
  ['Matar paneer', 'sugarCubes'],
  ['Shahi paneer', 'sugarCubes'],
  ['Dry fry/ tadka', 'soupPlate'],
  ['Kheer/ sewai', 'riceBowl'],
  ['Paratha variants', 'naan'],
  ['Litti chokha', 'zucchini'],
  ['Samosa', 'samosa'],
  ['Aloo tikki chaat', 'potato'],
  ['Namakpara/ nimki', 'nachos'],
);

/**
 * Every sample card earns all three badges. That is a property of the SAMPLE, not of cooks — see
 * `CookBadgesViewModel` — so `DEMO_COOK_PARTIAL_BADGES` still exercises the other case.
 */
const ALL_BADGES = { spoonTrained: true, backgroundVerified: true, hygienic: true } as const;

function sampleCook(
  key: string,
  firstName: string,
  homeState: string,
  languages?: readonly string[],
): CookViewModel {
  return {
    id: `demo-cook-${key}`,
    displayName: `Cook ${firstName}`,
    firstName,
    gender: 'Female',
    cuisine: 'North Indian',
    homeState,
    ...(languages === undefined ? {} : { languages }),
    specialties: MIXED_DISHES,
    pureVegSpecialties: VEG_DISHES,
    badges: ALL_BADGES,
  };
}

export const DEMO_COOK_ASHA = sampleCook('asha', 'Asha', 'West Bengal');
export const DEMO_COOK_KAVITA = sampleCook('kavita', 'Kavita', 'Odisha', ['Hindi', 'Odiya']);
export const DEMO_COOK_MEERA = sampleCook('meera-full', 'Meera', 'West Bengal');
export const DEMO_COOK_LATA = sampleCook('lata', 'Lata', 'West Bengal');

/** Each sample cook in both card variants. */
export const DEMO_COOK_PROFILES = [
  { cook: DEMO_COOK_KAVITA, variant: 'standard', node: '289:7392' },
  { cook: DEMO_COOK_ASHA, variant: 'standard', node: '289:8388' },
  { cook: DEMO_COOK_MEERA, variant: 'standard', node: '299:2255' },
  { cook: DEMO_COOK_LATA, variant: 'standard', node: '289:7266' },
  { cook: DEMO_COOK_KAVITA, variant: 'pureVeg', node: '289:7891' },
  { cook: DEMO_COOK_ASHA, variant: 'pureVeg', node: '289:8263' },
  { cook: DEMO_COOK_MEERA, variant: 'pureVeg', node: '289:7642' },
  { cook: DEMO_COOK_LATA, variant: 'pureVeg', node: '289:7767' },
] as const;

/** A cook with only some badges earned — the case the sample cards never show. */
export const DEMO_COOK_PARTIAL_BADGES: CookViewModel = {
  id: 'demo-cook-meera',
  displayName: 'Cook Meera',
  firstName: 'Meera',
  gender: 'Female',
  cuisine: 'North Indian',
  homeState: 'Assam',
  languages: ['Hindi', 'Assamese'],
  specialties: MIXED_DISHES.slice(0, 3),
  badges: { spoonTrained: true },
};

/** Nothing optional supplied — proves the card degrades instead of breaking. */
export const DEMO_COOK_MINIMAL: CookViewModel = {
  id: 'demo-cook-minimal',
  displayName: 'Cook Kavita',
  firstName: 'Kavita',
};
