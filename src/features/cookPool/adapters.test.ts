import { cookPoolSummaryFrom, cookProfileFrom, deckCooksFrom, shortNameOf } from './adapters';
import type { CookProfilePresentationDto, PoolCookCardDto, PoolCookProfileDto } from './api';

function card(overrides: Partial<PoolCookCardDto> = {}): PoolCookCardDto {
  return {
    cookId: 'cook-meera',
    profileCode: 'COOK_TEST',
    displayName: 'Cook Meera',
    profileImageUrl: null,
    region: 'West Bengal',
    languages: ['Hindi', 'Bengali'],
    cuisines: [],
    specialties: null,
    gender: null,
    spoonTrained: true,
    backgroundVerified: true,
    hygieneVerified: true,
    specialtyDishes: [
      { dishKey: 'palak-paneer', label: 'Palak paneer', dietCategory: 'veg', displayOrder: 1 },
    ],
    profileVariant: 'mixed',
    rating: { average: 4.46, count: 12 },
    visitsWithYou: 45,
    yourRating: { average: 4.75, count: 2 },
    ...overrides,
  };
}

/** DEC-114: what the backend sends, already chosen, labelled and ordered. */
const PRESENTATION: CookProfilePresentationDto = {
  timeSlot: 'dinner',
  badges: ['Spoon trained', 'Verified'],
  details: [
    { id: 'region', label: null, value: 'West Bengal', icon: null },
    { id: 'languages', label: null, value: 'Speaks Hindi, Bengali', icon: null },
  ],
  stats: [
    { id: 'visits', label: 'Visits with you', value: '45', icon: null },
    { id: 'rating', label: 'Your rating', value: '4.8', icon: 'star' },
  ],
  shelves: [
    {
      id: 'one_pots',
      title: 'One-pots',
      dishes: [
        {
          dishCode: 'N-CHK-001',
          name: 'Chicken Biryani',
          imageUrl: 'https://dishes.test/N-CHK-001.webp',
        },
        { dishCode: 'V-013', name: 'Veg Biryani', imageUrl: null },
      ],
    },
    {
      id: 'a_shelf_this_build_never_heard_of',
      title: 'Monsoon specials',
      dishes: [{ dishCode: 'V-099', name: 'Pakoda', imageUrl: null }],
    },
  ],
};

describe('Cook Pool adapters', () => {
  it('captions the pool with short names, in the backend’s order, at the minimum it is given', () => {
    const summary = cookPoolSummaryFrom(
      {
        cooks: [
          {
            cook: card({ cookId: 'asha', displayName: 'Cook Asha', profileCode: null }),
            available: true,
            addedAt: '2026-10-02T00:00:00.000Z',
          },
          { cook: card(), available: false, addedAt: '2026-10-01T00:00:00.000Z' },
        ],
        count: 2,
      },
      3,
    );

    expect(summary.minimumSize).toBe(3);
    expect(summary.members.map((member) => [member.cookId, member.name])).toEqual([
      ['asha', 'Asha'],
      ['cook-meera', 'Meera'],
    ]);
    expect(summary.members[0]?.photo).toBeUndefined();
  });

  it('keeps a name with no honorific as it is', () => {
    expect(shortNameOf('Meera')).toBe('Meera');
  });

  it('draws the hosted photo, and no photo at all without one', () => {
    expect(deckCooksFrom([{ ...card(), presentation: PRESENTATION }])[0]?.photo).toBeUndefined();
    expect(
      deckCooksFrom([
        { ...card({ profileImageUrl: 'https://cdn.test/meera.webp' }), presentation: PRESENTATION },
      ])[0]?.photo,
    ).toEqual({ uri: 'https://cdn.test/meera.webp' });
  });

  it('draws the backend’s header lines as sent, labels included', () => {
    const [profile] = deckCooksFrom([{ ...card(), presentation: PRESENTATION }]);
    expect(profile?.badges).toEqual(['Spoon trained', 'Verified']);
    expect(profile?.details).toEqual([
      { id: 'region', value: 'West Bengal' },
      { id: 'languages', value: 'Speaks Hindi, Bengali' },
    ]);
    expect(profile?.stats).toEqual([
      { id: 'visits', label: 'Visits with you', value: '45' },
      { id: 'rating', label: 'Your rating', value: '4.8', icon: 'star' },
    ]);
  });

  it('draws the shelves in the order they arrive, a shelf it does not know included', () => {
    const [profile] = deckCooksFrom([{ ...card(), presentation: PRESENTATION }]);
    expect(profile?.inPool).toBe(false);
    expect(
      profile?.menu.map((section) => [section.title, section.dishes.map((d) => d.id)]),
    ).toEqual([
      ['One-pots', ['N-CHK-001', 'V-013']],
      ['Monsoon specials', ['V-099']],
    ]);
    const dishes = profile?.menu[0]?.dishes;
    expect(dishes?.[0]?.image).toEqual({ uri: 'https://dishes.test/N-CHK-001.webp' });
    expect(dishes?.[1]?.image).toBeUndefined();
  });

  it('draws only the name and photo for a backend that sends no presentation', () => {
    const [profile] = deckCooksFrom([card()]);
    expect(profile?.badges).toEqual([]);
    expect(profile?.details).toEqual([]);
    expect(profile?.stats).toEqual([]);
    expect(profile?.menu).toEqual([]);
  });

  it('builds a profile from the profile read’s presentation', () => {
    const dto: PoolCookProfileDto = {
      cook: card(),
      available: true,
      inPool: true,
      addedAt: '2026-10-01T00:00:00.000Z',
      dishesByCategory: [],
      presentation: PRESENTATION,
    };
    const profile = cookProfileFrom(dto);
    expect(profile.name).toBe('Cook Meera');
    expect(profile.inPool).toBe(true);
    expect(profile.menu.map((section) => section.id)).toEqual([
      'one_pots',
      'a_shelf_this_build_never_heard_of',
    ]);
  });
});
