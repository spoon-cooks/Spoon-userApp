import { z } from 'zod';

import type { ApiClient } from '@core/api';
import { useApiQuery } from '@core/data';
import type { ScreenQuery } from '@core/data';
import { createKeyFactory } from '@core/query';
import { useRuntime } from '@core/runtimeContext';

/**
 * `GET /v1/cooks/featured` (DEC-114) — the cooks Home introduces in "Cooks you can trust", in the
 * backend's order: active cooks with a published menu, best rated first, at most four. Public like
 * `/v1/catalogue`, so a guest's Home draws them too. The app adds no cook of its own.
 */
export const FEATURED_COOKS_PATH = '/v1/cooks/featured';

const featuredCookSchema = z.object({
  displayName: z.string(),
  region: z.string().nullable(),
  /** The overall average to one decimal; null while nobody has rated her. */
  rating: z.number().nullable(),
  photoUrl: z.string().nullable(),
});

const featuredCooksSchema = z.object({ cooks: z.array(featuredCookSchema) });

export type FeaturedCookDto = z.infer<typeof featuredCookSchema>;

const featuredCookKeys = { list: () => createKeyFactory('cooks').collection('featured') } as const;

export function createFeaturedCooksApi(api: ApiClient) {
  return {
    async list(signal?: AbortSignal): Promise<readonly FeaturedCookDto[]> {
      return api.request(FEATURED_COOKS_PATH, {
        parse: (data) => featuredCooksSchema.parse(data).cooks,
        ...(signal === undefined ? {} : { signal }),
      });
    },
  };
}

export function useFeaturedCooks(): ScreenQuery<readonly FeaturedCookDto[]> {
  const { api } = useRuntime();
  const cooks = createFeaturedCooksApi(api);
  return useApiQuery<readonly FeaturedCookDto[]>({
    queryKey: featuredCookKeys.list(),
    queryFn: ({ signal }) => cooks.list(signal),
    staleTime: 15 * 60_000,
  });
}
