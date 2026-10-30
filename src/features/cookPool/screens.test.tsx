import type { ReactElement } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { fromStatus } from '@core/errors';
import { DEMO_COOK_POOL } from '@/demo/fixtures/cookPool';
import { createStubApi, createTestRuntime, renderWithRuntime } from '@/test/renderWithRuntime';
import type { StubHandlers } from '@/test/renderWithRuntime';

import { CookPoolSourceProvider } from './data';
import { createDemoCookPoolSource } from './demoSource';
import { CookPoolDeckScreen } from './screens/CookPoolDeckScreen';
import { CookPoolScreen } from './screens/CookPoolScreen';
import { CookProfileScreen } from './screens/CookProfileScreen';

/**
 * Reanimated and worklets are native runtimes with no headless implementation, so the deck runs
 * against their own jest mocks, as the recurring landing's tests do.
 */
jest.mock('react-native-worklets', () =>
  jest.requireActual('react-native-worklets/lib/module/mock'),
);
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));

/**
 * No navigator is mounted: focus is the screen's mount, and `mockBlur()` plays the screen losing
 * focus (a push or a deep link over it) by running each focus effect's cleanup.
 */
const mockBlurs = new Set<() => void>();
function mockBlur() {
  act(() => {
    mockBlurs.forEach((cleanup) => cleanup());
  });
}
jest.mock('expo-router', () => ({
  __esModule: true,
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(() => {
      const cleanup = effect();
      if (cleanup === undefined) return undefined;
      mockBlurs.add(cleanup);
      return () => {
        mockBlurs.delete(cleanup);
        cleanup();
      };
    }, [effect]);
  },
}));

const MEERA = 'demo-pool-meera';

/** The dev preview's way in: the local store, seeded with these cooks already in the pool. */
function renderDemo(ui: ReactElement, poolIds: readonly string[] = []) {
  const source = createDemoCookPoolSource({ ...DEMO_COOK_POOL, poolIds });
  return render(<CookPoolSourceProvider source={source}>{ui}</CookPoolSourceProvider>);
}

const landingHandlers = () => ({ onBack: jest.fn(), onAddCooks: jest.fn(), onOpenCook: jest.fn() });

describe('Cook Pool landing (demo source)', () => {
  it('shows a new household two empty places, each opening the deck', () => {
    const handlers = landingHandlers();
    renderDemo(<CookPoolScreen {...handlers} />);
    const places = screen.getAllByTestId('cook-pool-screen-pool-add');
    expect(places).toHaveLength(2);
    fireEvent.press(places[0]!);
    expect(handlers.onAddCooks).toHaveBeenCalled();
  });

  it('lists the pool in its order, then one Add, and opens a cook', () => {
    const handlers = landingHandlers();
    renderDemo(<CookPoolScreen {...handlers} />, ['demo-pool-asha', MEERA]);
    const names = screen.getAllByText(/^(Asha|Meera|Add)$/).map((node) => node.props.children);
    expect(names).toEqual(['Asha', 'Meera', 'Add']);
    fireEvent.press(screen.getByTestId(`cook-pool-screen-pool-${MEERA}`));
    expect(handlers.onOpenCook).toHaveBeenCalledWith(MEERA);
  });
});

describe('Cook profile (demo source)', () => {
  it('draws the lines and menu', () => {
    renderDemo(<CookProfileScreen cookId={MEERA} onBack={jest.fn()} onRemoved={jest.fn()} />);
    expect(screen.getByText('Cook Meera')).toBeTruthy();
    expect(screen.getByText('SPOON TRAINED · VERIFIED')).toBeTruthy();
    expect(screen.getByText('West Bengal · Speaks Hindi, Bengali')).toBeTruthy();
    expect(screen.getByText('Visits with you: 45')).toBeTruthy();
    expect(screen.getByText('Curries/ sabzis- Non Veg')).toBeTruthy();
    // Not in the pool: nothing to remove.
    expect(screen.queryByTestId('cook-profile-screen-remove')).toBeNull();
  });

  it('removes a pooled cook only after Remove is confirmed', async () => {
    const onRemoved = jest.fn();
    renderDemo(<CookProfileScreen cookId={MEERA} onBack={jest.fn()} onRemoved={onRemoved} />, [
      MEERA,
    ]);

    fireEvent.press(screen.getByTestId('cook-profile-screen-remove'));
    expect(screen.getByText('Remove Cook Meera from your Cook Pool?')).toBeTruthy();
    fireEvent.press(screen.getByTestId('cook-profile-screen-dialog-keep'));
    expect(onRemoved).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('cook-profile-screen-remove'));
    fireEvent.press(screen.getByTestId('cook-profile-screen-dialog-remove'));
    await waitFor(() => expect(onRemoved).toHaveBeenCalled());
    expect(screen.queryByTestId('cook-profile-screen-remove')).toBeNull();
  });

  it('closes the remove dialog when the profile loses focus', () => {
    renderDemo(<CookProfileScreen cookId={MEERA} onBack={jest.fn()} onRemoved={jest.fn()} />, [
      MEERA,
    ]);
    fireEvent.press(screen.getByTestId('cook-profile-screen-remove'));
    expect(screen.getByTestId('cook-profile-screen-dialog')).toBeTruthy();

    mockBlur();
    expect(screen.queryByTestId('cook-profile-screen-dialog')).toBeNull();
  });

  it('hearts a dish, on the device only', () => {
    renderDemo(<CookProfileScreen cookId={MEERA} onBack={jest.fn()} onRemoved={jest.fn()} />);
    const heart = screen.getByTestId('dish-card-meera-dahi-bhindi-favourite');
    expect(heart.props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
    fireEvent.press(heart);
    expect(
      screen.getByTestId('dish-card-meera-dahi-bhindi-favourite').props.accessibilityState,
    ).toEqual(expect.objectContaining({ selected: true }));
  });

  it('reports a cook the household has never had', () => {
    renderDemo(<CookProfileScreen cookId="nobody" onBack={jest.fn()} onRemoved={jest.fn()} />);
    expect(screen.queryByText('Cook Meera')).toBeNull();
  });
});

const COOK_ID = '986ff249-ab67-5ee5-8eb0-5c24a8187f9a';

/** DEC-114: the profile as the backend lays it out. */
const PRESENTATION = {
  timeSlot: 'lunch',
  badges: ['Spoon trained', 'Verified'],
  details: [{ id: 'region', label: null, value: 'West Bengal', icon: null }],
  stats: [
    { id: 'visits', label: 'Visits with you', value: '3', icon: null },
    { id: 'rating', label: 'Your rating', value: '4.5', icon: 'star' },
  ],
  shelves: [
    {
      id: 'proteins',
      title: 'Proteins',
      dishes: [{ dishCode: 'V-016', name: 'Palak paneer', imageUrl: null }],
    },
  ],
};

const CARD = {
  cookId: COOK_ID,
  profileCode: 'COOK_MEERA',
  displayName: 'Cook Meera',
  profileImageUrl: null,
  region: 'West Bengal',
  languages: ['Hindi'],
  cuisines: [],
  specialties: null,
  gender: 'female',
  spoonTrained: true,
  backgroundVerified: true,
  hygieneVerified: true,
  specialtyDishes: [
    { dishKey: 'palak-paneer', label: 'Palak paneer', dietCategory: 'veg', displayOrder: 1 },
  ],
  profileVariant: 'mixed',
  rating: { average: 4.2, count: 12 },
  yourRating: { average: 4.5, count: 3 },
  visitsWithYou: 3,
};

const PROFILE = {
  cook: CARD,
  available: true,
  inPool: true,
  addedAt: '2026-10-01T06:00:00.000Z',
  dishesByCategory: [{ category: 'veg', dishes: CARD.specialtyDishes }],
  presentation: PRESENTATION,
};

/** Eligibility is Recurring's; these tests are about the pool, so it is simply unavailable. */
const NO_ELIGIBILITY = () => {
  throw fromStatus(503, { code: 'SERVICE_UNAVAILABLE' });
};

function renderApi(ui: ReactElement, handlers: StubHandlers) {
  const runtime = createTestRuntime({ api: createStubApi(handlers) });
  return renderWithRuntime(ui, { runtime });
}

describe('Cook Pool on the API (default source)', () => {
  it('draws the pool from GET /v1/me/cooks, at the design’s minimum without eligibility', async () => {
    renderApi(<CookPoolScreen {...landingHandlers()} />, {
      'GET /v1/me/cooks': () => ({
        cooks: [{ cook: CARD, available: true, addedAt: '2026-10-01T06:00:00.000Z' }],
        count: 1,
      }),
      'GET /v1/recurring/eligibility': NO_ELIGIBILITY,
    });

    await waitFor(() => expect(screen.getByText('Meera')).toBeTruthy());
    expect(screen.getAllByTestId('cook-pool-screen-pool-add')).toHaveLength(1);
  });

  it('removes with DELETE, then leaves and refreshes the pool and Recurring', async () => {
    const deleted: string[] = [];
    const onRemoved = jest.fn();
    const { queryClient } = renderApi(
      <CookProfileScreen cookId={COOK_ID} onBack={jest.fn()} onRemoved={onRemoved} />,
      {
        [`GET /v1/me/cooks/${COOK_ID}`]: () => PROFILE,
        [`DELETE /v1/me/cooks/${COOK_ID}`]: () => {
          deleted.push(COOK_ID);
          return undefined;
        },
      },
    );
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await waitFor(() => expect(screen.getByText('Visits with you: 3')).toBeTruthy());
    expect(screen.getByText('Your rating: 4.5')).toBeTruthy();
    fireEvent.press(screen.getByTestId('cook-profile-screen-remove'));
    fireEvent.press(screen.getByTestId('cook-profile-screen-dialog-remove'));

    await waitFor(() => expect(onRemoved).toHaveBeenCalled());
    expect(deleted).toEqual([COOK_ID]);
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual(expect.arrayContaining([['cookPool'], ['recurring']]));
  });

  it('keeps the dialog open with the reason when the DELETE fails', async () => {
    const onRemoved = jest.fn();
    renderApi(<CookProfileScreen cookId={COOK_ID} onBack={jest.fn()} onRemoved={onRemoved} />, {
      [`GET /v1/me/cooks/${COOK_ID}`]: () => PROFILE,
      [`DELETE /v1/me/cooks/${COOK_ID}`]: () => {
        throw fromStatus(500, { code: 'INTERNAL_ERROR' });
      },
    });

    await waitFor(() => expect(screen.getByTestId('cook-profile-screen-remove')).toBeTruthy());
    fireEvent.press(screen.getByTestId('cook-profile-screen-remove'));
    fireEvent.press(screen.getByTestId('cook-profile-screen-dialog-remove'));

    await waitFor(() =>
      expect(screen.getByTestId('cook-profile-screen-dialog-error')).toBeTruthy(),
    );
    expect(onRemoved).not.toHaveBeenCalled();
  });

  it('deals the candidates', async () => {
    const liked = new Set<string>();
    const sent: string[] = [];
    renderApi(<CookPoolDeckScreen onDone={jest.fn()} />, {
      'GET /v1/me/cooks/candidates': () => ({ cooks: [{ ...CARD, presentation: PRESENTATION }] }),
      'GET /v1/me/dish-likes': () => ({ dishCodes: [...liked] }),
      'PUT /v1/me/dish-likes/V-016': () => {
        sent.push('PUT V-016');
        liked.add('V-016');
        return { dishCode: 'V-016', liked: true };
      },
      'DELETE /v1/me/dish-likes/V-016': () => {
        sent.push('DELETE V-016');
        liked.delete('V-016');
        return undefined;
      },
    });

    await waitFor(() => expect(screen.getByTestId('cook-pool-deck-swipes')).toBeTruthy());
    expect(screen.queryByTestId('cook-pool-deck-empty')).toBeNull();
    // The deck deals once it knows its size.
    fireEvent(screen.getByTestId('cook-pool-deck-swipes'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 402, height: 600 } },
    });
    expect(screen.getAllByText('Cook Meera').length).toBeGreaterThan(0);

    // `755:2333` — each dish on the card carries its heart, the household's likes (DEC-115): one
    // cook dealt is drawn on top and again behind it, and both hearts follow the one read.
    const selected = () =>
      screen
        .getAllByLabelText('Favourite Palak paneer')
        .map((heart) => (heart.props.accessibilityState as { selected?: boolean }).selected);
    expect(selected()).toEqual([false, false]);
    fireEvent.press(screen.getAllByLabelText('Favourite Palak paneer')[1]!);
    await waitFor(() => expect(selected()).toEqual([true, true]));
    fireEvent.press(screen.getAllByLabelText('Favourite Palak paneer')[1]!);
    await waitFor(() => expect(selected()).toEqual([false, false]));
    // Saved by dish code, in the order tapped.
    await waitFor(() => expect(sent).toEqual(['PUT V-016', 'DELETE V-016']));
  });

  it('draws saved likes filled, and puts a heart back when the like fails', async () => {
    let attempts = 0;
    renderApi(<CookProfileScreen cookId={COOK_ID} onBack={jest.fn()} onRemoved={jest.fn()} />, {
      [`GET /v1/me/cooks/${COOK_ID}`]: () => PROFILE,
      'GET /v1/me/dish-likes': () => ({ dishCodes: ['V-016'] }),
      'DELETE /v1/me/dish-likes/V-016': () => {
        attempts += 1;
        throw fromStatus(500, { code: 'INTERNAL_ERROR' });
      },
    });
    const heart = () =>
      (
        screen.getByLabelText('Favourite Palak paneer').props.accessibilityState as {
          selected?: boolean;
        }
      ).selected;

    await waitFor(() => expect(heart()).toBe(true));
    fireEvent.press(screen.getByLabelText('Favourite Palak paneer'));
    // The unlike is refused, so the heart fills again.
    await waitFor(() => expect(attempts).toBeGreaterThan(0));
    await waitFor(() => expect(heart()).toBe(true));
  });

  it('adds the top cook with POST /v1/me/cooks, and skipping stores nothing', async () => {
    const posted: unknown[] = [];
    const second = { ...CARD, cookId: 'cook-asha', displayName: 'Cook Asha' };
    renderApi(<CookPoolDeckScreen onDone={jest.fn()} />, {
      'GET /v1/me/cooks/candidates': () => ({
        cooks: [
          { ...CARD, presentation: PRESENTATION },
          { ...second, presentation: PRESENTATION },
        ],
      }),
      'POST /v1/me/cooks': (body) => {
        posted.push(body);
        return { cookId: COOK_ID, added: true, addedAt: '2026-10-06T06:00:00.000Z', count: 1 };
      },
      'GET /v1/me/cooks': () => ({ cooks: [], count: 0 }),
      'GET /v1/recurring/eligibility': NO_ELIGIBILITY,
    });

    await waitFor(() => expect(screen.getByTestId('cook-pool-deck-swipes')).toBeTruthy());
    fireEvent(screen.getByTestId('cook-pool-deck-swipes'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 402, height: 600 } },
    });
    // The fly-off finishes on a later tick, which is when the swipe is decided.
    await act(async () => {
      fireEvent.press(screen.getByTestId('cook-pool-deck-swipes-add'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(posted).toEqual([{ cookId: COOK_ID }]));

    await act(async () => {
      fireEvent.press(screen.getByTestId('cook-pool-deck-swipes-skip'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(posted).toHaveLength(1);
  });

  it('tells a household with no cook to add how to meet one', async () => {
    const onBookVisit = jest.fn();
    renderApi(<CookPoolDeckScreen onDone={jest.fn()} onBookVisit={onBookVisit} />, {
      'GET /v1/me/cooks/candidates': () => ({ cooks: [] }),
    });

    await waitFor(() => expect(screen.getByTestId('cook-pool-deck-empty')).toBeTruthy());
    fireEvent.press(screen.getByTestId('cook-pool-deck-empty-action'));
    expect(onBookVisit).toHaveBeenCalled();
  });
});
