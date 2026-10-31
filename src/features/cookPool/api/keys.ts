import { createKeyFactory } from '@core/query';

/**
 * Cook Pool cache keys. `all()` is the blast radius every write invalidates: an add or a remove
 * changes the pool, the candidates (which exclude pooled cooks) and the profile's `inPool`.
 */
const factory = createKeyFactory('cookPool');

export const cookPoolKeys = {
  all: factory.all,
  pool: () => factory.collection('pool'),
  candidates: () => factory.collection('candidates'),
  /** One cook's profile, read for a booking (`bookingId`) or for the Cook Pool (`null`). */
  profile: (cookId: string, bookingId: string | null = null) =>
    [...factory.detail(cookId), bookingId ?? 'pool'] as const,
  /** The household's dish likes (DEC-115). Under `all()`, so a pool write refetches them too. */
  dishLikes: () => factory.collection('dishLikes'),
} as const;
