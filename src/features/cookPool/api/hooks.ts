import { useMutation, useQueryClient } from '@tanstack/react-query';
import { idempotency } from '@core/api';
import { useApiQuery } from '@core/data';
import type { ScreenQuery } from '@core/data';
import { useRuntime } from '@core/runtimeContext';
import { recurringKeys } from '@features/recurringSetup';

import { cookPoolAddScope, createCookPoolApi } from './cookPoolApi';
import { cookPoolKeys } from './keys';
import type {
  AddCookToPoolDto,
  CookPoolCandidatesDto,
  CookPoolListDto,
  DishLikesDto,
  PoolCookProfileDto,
} from './schemas';

/**
 * Cook Pool reads and writes.
 *
 * Same rules as the booking and recurring hooks: reads go through `useApiQuery`, writes are
 * mutations that invalidate rather than write the cache optimistically — the pool is the
 * server's, and its `count` is what unlocks Recurring.
 */

export function useCookPoolList(options: { enabled?: boolean } = {}): ScreenQuery<CookPoolListDto> {
  const { api } = useRuntime();
  const pool = createCookPoolApi(api);
  return useApiQuery<CookPoolListDto>({
    queryKey: cookPoolKeys.pool(),
    queryFn: ({ signal }) => pool.list(signal),
    enabled: options.enabled !== false,
  });
}

export function useCookPoolCandidates(
  options: { enabled?: boolean } = {},
): ScreenQuery<CookPoolCandidatesDto> {
  const { api } = useRuntime();
  const pool = createCookPoolApi(api);
  return useApiQuery<CookPoolCandidatesDto>({
    queryKey: cookPoolKeys.candidates(),
    queryFn: ({ signal }) => pool.candidates(signal),
    enabled: options.enabled !== false,
  });
}

export function useCookPoolProfile(
  cookId: string,
  /**
   * `bookingId`: the booking whose cook card this is. Send it only to a V0 that takes it
   * (`useStepVersionsSupported`, both ship in V0#203): an older one refuses unknown query keys.
   */
  options: { enabled?: boolean; bookingId?: string | null } = {},
): ScreenQuery<PoolCookProfileDto> {
  const { api } = useRuntime();
  const pool = createCookPoolApi(api);
  const bookingId = options.bookingId ?? null;
  return useApiQuery<PoolCookProfileDto>({
    queryKey: cookPoolKeys.profile(cookId, bookingId),
    queryFn: ({ signal }) => pool.profile(cookId, signal, bookingId),
    enabled: options.enabled !== false,
  });
}

/**
 * Invalidates the pool, the candidates and every profile, and the whole Recurring feature: the
 * pool's size is Recurring's unlock (`eligibility`), and only pool cooks serve its calendar and
 * start times.
 */
function useInvalidatePool(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: cookPoolKeys.all() });
    void queryClient.invalidateQueries({ queryKey: recurringKeys.all() });
  };
}

/**
 * The scope names the COOK, so a retried add after an ambiguous failure replays rather than adds
 * twice. Invalidated on every outcome: a refused add (an unavailable cook) leaves the deck's
 * candidates stale too.
 */
export function useAddCookToPool() {
  const { api } = useRuntime();
  const pool = createCookPoolApi(api);
  const invalidate = useInvalidatePool();
  return useMutation<AddCookToPoolDto, Error, { cookId: string }>({
    mutationFn: ({ cookId }) => pool.add(cookId, cookPoolAddScope(cookId)),
    onSuccess(_result, variables) {
      idempotency.release(cookPoolAddScope(variables.cookId));
    },
    onSettled: invalidate,
  });
}

export function useRemoveCookFromPool() {
  const { api } = useRuntime();
  const pool = createCookPoolApi(api);
  const invalidate = useInvalidatePool();
  return useMutation<void, Error, { cookId: string }>({
    mutationFn: ({ cookId }) => pool.remove(cookId),
    onSettled: invalidate,
  });
}

export function useDishLikesQuery(): ScreenQuery<DishLikesDto> {
  const { api } = useRuntime();
  const pool = createCookPoolApi(api);
  return useApiQuery<DishLikesDto>({
    queryKey: cookPoolKeys.dishLikes(),
    queryFn: ({ signal }) => pool.dishLikes(signal),
  });
}

/**
 * Likes or unlikes a dish (DEC-115). Unlike the pool writes this one IS optimistic: a heart has to
 * fill under the finger, and nothing else depends on it. The cache flips at once, goes back if the
 * request fails, and is re-read once it settles.
 *
 * Every like shares one mutation scope, so taps reach the server in the order they were made: a
 * quick like-unlike can never land as unlike-like.
 */
export function useSetDishLike() {
  const { api } = useRuntime();
  const pool = createCookPoolApi(api);
  const queryClient = useQueryClient();
  const key = cookPoolKeys.dishLikes();
  return useMutation<void, Error, { dishCode: string; liked: boolean }, DishLikesDto | undefined>({
    scope: { id: 'cookPool.dishLike' },
    mutationFn: ({ dishCode, liked }) =>
      liked ? pool.likeDish(dishCode) : pool.unlikeDish(dishCode),
    async onMutate({ dishCode, liked }) {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DishLikesDto>(key);
      const others = (previous?.dishCodes ?? []).filter((code) => code !== dishCode);
      queryClient.setQueryData<DishLikesDto>(key, {
        dishCodes: liked ? [...others, dishCode] : others,
      });
      return previous;
    },
    onError(_error, _variables, previous) {
      queryClient.setQueryData(key, previous);
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
