import { DEMO_COOK_POOL } from '@/demo/fixtures/cookPool';

import { addCook, cookProfile, deckCooks, emptyPlaces, poolSummary, removeCook } from './pool';

const MEERA = 'demo-pool-meera';
const ASHA = 'demo-pool-asha';

describe('Cook Pool state', () => {
  it('puts the newest cook first, once', () => {
    const one = addCook(DEMO_COOK_POOL, MEERA);
    const two = addCook(one, ASHA);
    expect(two.poolIds).toEqual([ASHA, MEERA]);
    expect(addCook(two, ASHA)).toBe(two);
  });

  it('only adds cooks who have served the household', () => {
    expect(addCook(DEMO_COOK_POOL, 'someone-else')).toBe(DEMO_COOK_POOL);
  });

  it('takes a cook out of the pool', () => {
    const pooled = addCook(DEMO_COOK_POOL, MEERA);
    const removed = removeCook(pooled, MEERA);
    expect(removed.poolIds).toEqual([]);
    expect(removeCook(removed, MEERA)).toBe(removed);
  });

  it('deals only the cooks not in the pool, as the candidates route does', () => {
    const pooled = addCook(DEMO_COOK_POOL, MEERA);
    const deck = deckCooks(pooled);
    expect(deck.map((cook) => cook.cookId)).toEqual(
      DEMO_COOK_POOL.servedCooks.map((cook) => cook.cookId).filter((cookId) => cookId !== MEERA),
    );
    expect(deck.every((cook) => !cook.inPool)).toBe(true);
  });

  it('keeps the backend order of cooks, lines and menu', () => {
    expect(deckCooks(DEMO_COOK_POOL).map((cook) => cook.cookId)).toEqual(
      DEMO_COOK_POOL.servedCooks.map((cook) => cook.cookId),
    );
    const profile = cookProfile(DEMO_COOK_POOL, MEERA);
    const source = DEMO_COOK_POOL.servedCooks[0];
    expect(profile?.menu.map((section) => section.title)).toEqual(
      source?.menu.map((section) => section.title),
    );
    expect(profile?.stats).toBe(source?.stats);
  });

  it('marks whether a profile is in the pool, and has none for a stranger', () => {
    expect(cookProfile(DEMO_COOK_POOL, MEERA)?.inPool).toBe(false);
    expect(cookProfile(addCook(DEMO_COOK_POOL, MEERA), MEERA)?.inPool).toBe(true);
    expect(cookProfile(DEMO_COOK_POOL, 'someone-else')).toBeUndefined();
  });

  it('summarises the pool with each cook’s short name', () => {
    const summary = poolSummary(addCook(DEMO_COOK_POOL, MEERA));
    expect(summary.members).toEqual([expect.objectContaining({ cookId: MEERA, name: 'Meera' })]);
    expect(summary.minimumSize).toBe(2);
  });

  it('keeps empty places up to the minimum, and always one', () => {
    expect(emptyPlaces(0, 2)).toBe(2);
    expect(emptyPlaces(1, 2)).toBe(1);
    expect(emptyPlaces(2, 2)).toBe(1);
    expect(emptyPlaces(7, 3)).toBe(1);
  });
});
