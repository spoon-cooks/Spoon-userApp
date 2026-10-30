import type { ApiClient, RequestOptions } from '@core/api';
import { idempotency } from '@core/api';

import { cookPoolAddScope, createCookPoolApi } from './cookPoolApi';

/**
 * The Cook Pool wire contract — DEC-085, V0 `src/cook-pool/pool-service.ts` and the
 * `/v1/me/cooks` routes.
 *
 * Payloads are transcribed from the backend's own types (`PoolCookCard`, `PoolMember`,
 * `PoolCookProfile`, `AddCookToPoolResult`), not a live instance. The add body matters: the route
 * is `additionalProperties: false` and takes `cookId` alone.
 */

interface Captured {
  path: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}

function recording(response: unknown) {
  const calls: Captured[] = [];
  const api: ApiClient = {
    async request<T>(path: string, options: RequestOptions<T>): Promise<T> {
      calls.push({
        path,
        method: options.method ?? 'GET',
        body: options.body,
        headers: { ...(options.headers ?? {}) },
      });
      return options.parse(response);
    },
  };
  return { calls, pool: createCookPoolApi(api) };
}

const COOK_ID = '986ff249-ab67-5ee5-8eb0-5c24a8187f9a';

const CARD = {
  cookId: COOK_ID,
  profileCode: 'COOK_MEERA',
  displayName: 'Cook Meera',
  profileImageUrl: null,
  region: 'West Bengal',
  languages: ['Hindi', 'Bengali'],
  cuisines: ['Bengali'],
  specialties: null,
  gender: 'female',
  spoonTrained: true,
  backgroundVerified: true,
  hygieneVerified: false,
  specialtyDishes: [
    { dishKey: 'palak-paneer', label: 'Palak paneer', dietCategory: 'veg', displayOrder: 1 },
    { dishKey: 'mustard-fish', label: 'Mustard fish', dietCategory: 'non_veg', displayOrder: 2 },
  ],
  profileVariant: 'mixed',
  rating: { average: 4.5, count: 12 },
  visitsWithYou: 45,
};

describe('Cook Pool reads', () => {
  it('reads the pool with its count', async () => {
    const { calls, pool } = recording({
      cooks: [{ cook: CARD, available: true, addedAt: '2026-10-01T06:00:00.000Z' }],
      count: 1,
    });

    const list = await pool.list();

    expect(calls[0]).toMatchObject({ path: '/v1/me/cooks', method: 'GET' });
    expect(list.count).toBe(1);
    expect(list.cooks[0]?.cook.visitsWithYou).toBe(45);
  });

  it('reads the candidates', async () => {
    const { calls, pool } = recording({ cooks: [CARD] });

    const candidates = await pool.candidates();

    expect(calls[0]).toMatchObject({ path: '/v1/me/cooks/candidates', method: 'GET' });
    expect(candidates.cooks.map((cook) => cook.cookId)).toEqual([COOK_ID]);
  });

  it('reads one cook’s profile, with a category the app does not know yet', async () => {
    const { calls, pool } = recording({
      cook: CARD,
      available: false,
      inPool: false,
      addedAt: null,
      dishesByCategory: [
        { category: 'veg', dishes: [CARD.specialtyDishes[0]] },
        { category: 'jain', dishes: [] },
      ],
    });

    const profile = await pool.profile(COOK_ID);

    expect(calls[0]).toMatchObject({ path: `/v1/me/cooks/${COOK_ID}`, method: 'GET' });
    expect(profile.available).toBe(false);
    expect(profile.dishesByCategory.map((group) => group.category)).toEqual(['veg', 'jain']);
  });

  it('refuses a card missing a field the backend always sends', async () => {
    const { visitsWithYou: _dropped, ...partial } = CARD;
    const { pool } = recording({ cooks: [partial] });

    await expect(pool.candidates()).rejects.toThrow();
  });
});

describe('Cook Pool writes', () => {
  it('adds a cook by id alone, under an Idempotency-Key scoped to the cook', async () => {
    const { calls, pool } = recording({
      cookId: COOK_ID,
      added: true,
      addedAt: '2026-10-06T06:00:00.000Z',
      count: 2,
    });

    const scope = cookPoolAddScope(COOK_ID);
    const result = await pool.add(COOK_ID, scope);

    expect(calls[0]).toMatchObject({
      path: '/v1/me/cooks',
      method: 'POST',
      body: { cookId: COOK_ID },
    });
    expect(calls[0]?.headers['Idempotency-Key']).toBe(idempotency.keyFor(scope));
    expect(result).toMatchObject({ added: true, count: 2 });
    idempotency.release(scope);
  });

  it('removes a cook with a bare DELETE', async () => {
    const { calls, pool } = recording(undefined);

    await pool.remove(COOK_ID);

    expect(calls[0]).toMatchObject({ path: `/v1/me/cooks/${COOK_ID}`, method: 'DELETE' });
    expect(calls[0]?.headers['Idempotency-Key']).toBeUndefined();
  });

  it('reads the household dish likes (DEC-115)', async () => {
    const { calls, pool } = recording({ dishCodes: ['V-016', 'N-CHK-001'] });

    await expect(pool.dishLikes()).resolves.toEqual({ dishCodes: ['V-016', 'N-CHK-001'] });
    expect(calls[0]).toMatchObject({ path: '/v1/me/dish-likes', method: 'GET' });
  });

  it('likes with a PUT and unlikes with a DELETE on the dish code, with no key', async () => {
    const liking = recording({ dishCode: 'N-CHK-001', liked: true });
    await liking.pool.likeDish('N-CHK-001');
    expect(liking.calls[0]).toMatchObject({ path: '/v1/me/dish-likes/N-CHK-001', method: 'PUT' });
    expect(liking.calls[0]?.headers['Idempotency-Key']).toBeUndefined();

    const unliking = recording(undefined);
    await unliking.pool.unlikeDish('N-CHK-001');
    expect(unliking.calls[0]).toMatchObject({
      path: '/v1/me/dish-likes/N-CHK-001',
      method: 'DELETE',
    });
  });
});
