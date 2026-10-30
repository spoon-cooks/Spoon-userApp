import { useMemo } from 'react';

import { useAddresses } from '@features/address';
import { useCookPoolList } from '@features/cookPool';
import { useMyBookingsV2 } from '@features/history';

export interface PoolFace {
  readonly id: string;
  readonly photo: string | null;
  readonly initials: string;
}

/**
 * The live counts the Accounts screens summarise (dev notes `2084:2770`, `2084:2781`,
 * `2084:2786`): upcoming bookings, past visits, saved addresses and the Cook Pool. Each is `null`
 * until its own request has answered, so a slow list never shows as an empty one.
 */
export interface AccountSummary {
  readonly upcomingCount: number | null;
  /** Completed visits loaded so far, and whether older pages remain. */
  readonly visits: { readonly count: number; readonly more: boolean } | null;
  readonly hasBooked: boolean | null;
  readonly addressLabels: readonly string[] | null;
  readonly poolCount: number | null;
  /**
   * The pool, or the bookings that decide which empty card to draw, are still loading. A failed
   * read is not pending: it settles, and the card falls back as before.
   */
  readonly poolPending: boolean;
  readonly poolFaces: readonly PoolFace[];
}

function initialsOf(name: string): string {
  const words = name
    .replace(/^Cook\s+/i, '')
    .trim()
    .split(/\s+/);
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

export function useAccountSummary(): AccountSummary {
  const bookings = useMyBookingsV2();
  const addresses = useAddresses();
  const pool = useCookPoolList();

  return useMemo(() => {
    const upcomingReady = bookings.upcoming.state.status === 'ready';
    const pastRows = bookings.past.state.status === 'ready' ? bookings.past.state.data : null;
    const poolData = pool.state.status === 'ready' ? pool.state.data : null;
    return {
      upcomingCount: upcomingReady ? bookings.upcoming.count : null,
      visits:
        pastRows === null
          ? null
          : {
              count: pastRows.filter((row) => row.status === 'Completed').length,
              more: bookings.past.hasMore,
            },
      hasBooked:
        pastRows === null || !upcomingReady
          ? null
          : pastRows.length > 0 || bookings.upcoming.count > 0,
      addressLabels:
        addresses.state.status === 'ready'
          ? addresses.state.data.map((address) => address.label)
          : null,
      poolCount: poolData?.count ?? null,
      poolPending:
        pool.state.status === 'loading' ||
        (poolData?.count === 0 &&
          (bookings.upcoming.state.status === 'loading' ||
            bookings.past.state.status === 'loading')),
      poolFaces: (poolData?.cooks ?? []).slice(0, 3).map(({ cook }) => ({
        id: cook.cookId,
        photo: cook.profileImageUrl,
        initials: initialsOf(cook.displayName),
      })),
    };
  }, [bookings, addresses.state, pool.state]);
}
