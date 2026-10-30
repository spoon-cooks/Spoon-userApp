import type { ImageSourcePropType } from 'react-native';

import type { CookMenuSection, CookPoolState, ServedCook } from '@features/cookPool';

/**
 * DEMO FIXTURES — NOT PRODUCTION DATA.
 *
 * The Cook Pool as a household that has been served by four cooks and has not built its pool yet
 * (`844:5842`) — the dev preview's local store (`createDemoCookPoolSource`), which runs with no
 * session. The app reads the same screens from DEC-085's `/v1/me/cooks` routes.
 *
 * Every dish shows the one sample plate the frames draw (`755:2365`).
 */

const DISH = require('../../../assets/figma/cookpool/sample-dish.webp') as ImageSourcePropType;

function section(cook: string, id: string, title: string, dishes: readonly string[]) {
  return {
    id: `${cook}-${id}`,
    title,
    dishes: dishes.map((name) => ({
      id: `${cook}-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`,
      name,
      image: DISH,
    })),
  } satisfies CookMenuSection;
}

/** `1380:3196` — as the adapter builds them from a cook card. */
function lines(region: string, languages: string, visits: number, rating: string) {
  return {
    badges: ['Spoon trained', 'Verified'],
    details: [
      { id: 'region', value: region },
      { id: 'languages', value: `Speaks ${languages}` },
    ],
    stats: [
      { id: 'visits', label: 'Visits with you', value: String(visits) },
      { id: 'rating', label: 'Your rating', value: rating, icon: 'star' },
    ],
  };
}

const MEERA_COOK: ServedCook = {
  cookId: 'demo-pool-meera',
  name: 'Cook Meera',
  shortName: 'Meera',
  ...lines('West Bengal', 'Hindi, Bengali', 45, '4.5'),
  menu: [
    section('meera', 'veg', 'Curries/ sabzis- Veg', [
      'Dahi bhindi',
      'Aloo posto',
      'Shukto',
      'Chhanar dalna',
      'Begun bhaja',
    ]),
    section('meera', 'non-veg', 'Curries/ sabzis- Non Veg', [
      'Macher jhol',
      'Chicken kosha',
      'Egg curry',
      'Chingri malai',
    ]),
    section('meera', 'breakfast', 'Breakfast', ['Luchi', 'Poha', 'Aloo paratha', 'Upma']),
    section('meera', 'one-pot', 'One pot recipes', ['Khichuri', 'Veg pulao', 'Chicken biryani']),
    section('meera', 'snacks', 'Snacks', ['Ghugni', 'Veg chop', 'Samosa']),
    section('meera', 'salads', 'Salads', ['Kachumber', 'Sprouts chaat']),
    section('meera', 'drinks', 'Drinks', ['Masala chai', 'Aam panna', 'Lassi']),
  ],
};

const ASHA_COOK: ServedCook = {
  cookId: 'demo-pool-asha',
  name: 'Cook Asha',
  shortName: 'Asha',
  ...lines('West Bengal', 'Hindi, Bengali', 12, '4.8'),
  menu: [
    section('asha', 'veg', 'Curries/ sabzis- Veg', [
      'Palak paneer',
      'Dal tadka',
      'Mix veg',
      'Rajma',
    ]),
    section('asha', 'breakfast', 'Breakfast', ['Aloo paratha', 'Besan chilla', 'Idli']),
    section('asha', 'one-pot', 'One pot recipes', ['Veg pulao', 'Dal khichdi']),
    section('asha', 'drinks', 'Drinks', ['Masala chai', 'Lassi']),
  ],
};

const KAVITA_COOK: ServedCook = {
  cookId: 'demo-pool-kavita',
  name: 'Cook Kavita',
  shortName: 'Kavita',
  ...lines('Odisha', 'Hindi, Odia', 8, '4.6'),
  menu: [
    section('kavita', 'veg', 'Curries/ sabzis- Veg', ['Dalma', 'Santula', 'Aloo bharta']),
    section('kavita', 'non-veg', 'Curries/ sabzis- Non Veg', ['Chicken curry', 'Fish fry']),
    section('kavita', 'snacks', 'Snacks', ['Pakoda', 'Bara']),
  ],
};

const LATA_COOK: ServedCook = {
  cookId: 'demo-pool-lata',
  name: 'Cook Lata',
  shortName: 'Lata',
  ...lines('West Bengal', 'Hindi, Bengali', 3, '4.2'),
  menu: [
    section('lata', 'veg', 'Curries/ sabzis- Veg', ['Aloo dum', 'Cholar dal', 'Labra']),
    section('lata', 'breakfast', 'Breakfast', ['Poha', 'Upma']),
  ],
};

/** `844:5842` — four cooks have served the household; its pool is empty; it needs two. */
export const DEMO_COOK_POOL: CookPoolState = {
  minimumSize: 2,
  servedCooks: [MEERA_COOK, ASHA_COOK, KAVITA_COOK, LATA_COOK],
  poolIds: [],
};
