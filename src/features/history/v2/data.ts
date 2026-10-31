import { useEffect, useMemo, useState } from 'react';

import { useActiveBookingPages, useBookingHistoryPages } from '@features/booking';
import { ready } from '@core/data';
import type { DataState } from '@core/data';
import { currentSkewMs, slotHasEnded } from '@core/time';
import type { BookingSummaryDto } from '@features/booking';

import { byMostRecentFirst, bySoonestFirst } from '../adapters';
import { isStillUpcoming } from '../data';
import { bookingRowFrom, upcomingFrom } from './model';
import type { BookingRow, NextVisit } from './model';

export interface BookingTabPaging {
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly loadMoreError: boolean;
  readonly loadMore: () => void;
  readonly retryLoadMore: () => void;
  readonly refetch: () => void;
}

export interface UpcomingTab extends BookingTabPaging {
  readonly state: DataState<{
    readonly next: NextVisit | null;
    readonly later: readonly BookingRow[];
  }>;
  readonly count: number;
}

export interface PastTab extends BookingTabPaging {
  readonly state: DataState<readonly BookingRow[]>;
  readonly count: number;
}

/**
 * A finished booking (from `GET /v1/me/bookings`) whose booked slot is still ahead — a visit
 * cancelled for a later date, or one completed before its window closed. Dev note `2192:4489`:
 * "Cancelled … stays here until its date passes, then moves to Past", so it is drawn on Upcoming,
 * not Past, until then. `/me/bookings/active` cannot carry it: it lists a cancelled booking only
 * while Spoon's own cancellation notice is unread. An instant booking has no slot, so it is Past.
 */
function slotStillAhead(booking: BookingSummaryDto, now: Date): boolean {
  return (
    booking.scheduledStart !== null &&
    !slotHasEnded(booking.scheduledStart, booking.durationMinutes, now)
  );
}

/** The live list's still-upcoming rows plus history rows whose slot is ahead, soonest first. */
export function upcomingBookingsFrom(
  active: readonly BookingSummaryDto[],
  history: readonly BookingSummaryDto[],
  now: Date,
): readonly BookingSummaryDto[] {
  const live = active.filter((booking) => isStillUpcoming(booking, now));
  const ids = new Set(live.map((booking) => booking.id));
  const ahead = history.filter((booking) => !ids.has(booking.id) && slotStillAhead(booking, now));
  return [...live, ...ahead].sort(bySoonestFirst);
}

/** History rows whose slot has passed (or that never had one) — the Past tab. */
export function pastBookingsFrom(
  history: readonly BookingSummaryDto[],
  now: Date,
): readonly BookingSummaryDto[] {
  return history.filter((booking) => !slotStillAhead(booking, now));
}

/**
 * Both tabs of the redesigned My bookings, from the same two endpoints the old list read:
 * `GET /v1/me/bookings/active` (Upcoming, soonest first — the server's order) and
 * `GET /v1/me/bookings` (Past, newest first). A finished booking sits on Upcoming while its slot is
 * still ahead and on Past once it has passed — never both (`upcomingBookingsFrom`,
 * `pastBookingsFrom`).
 */
export function useMyBookingsV2(): { readonly upcoming: UpcomingTab; readonly past: PastTab } {
  const active = useActiveBookingPages();
  const history = useBookingHistoryPages();
  // Read once on open, skew-corrected — see `useUpcomingBookingsData`.
  const [nowMs] = useState(() => Date.now() - currentSkewMs());

  const historyRows = history.state.status === 'ready' ? history.state.data : undefined;
  const pastRows = useMemo(
    () => (historyRows === undefined ? undefined : pastBookingsFrom(historyRows, new Date(nowMs))),
    [historyRows, nowMs],
  );

  const visible = useMemo(
    () =>
      active.state.status === 'ready'
        ? upcomingBookingsFrom(active.state.data, historyRows ?? [], new Date(nowMs))
        : undefined,
    [active.state, historyRows, nowMs],
  );

  const upcomingState = useMemo(() => {
    if (active.state.status !== 'ready') return active.state;
    return ready(upcomingFrom(visible ?? [], new Date(nowMs)));
  }, [active.state, visible, nowMs]);

  const pastState = useMemo(() => {
    if (history.state.status !== 'ready') return history.state;
    return ready(
      (pastRows ?? [])
        .slice()
        .sort(byMostRecentFirst)
        .map((dto) => bookingRowFrom(dto, new Date(nowMs))),
    );
  }, [history.state, pastRows, nowMs]);

  // Every row loaded so far filtered out, with more behind them: nothing draws a scroll area to
  // ask for the next page, so ask here (as the old list did).
  const { hasMore, loadingMore, loadMore } = active;
  const nothingVisibleYet = visible !== undefined && visible.length === 0;
  useEffect(() => {
    if (nothingVisibleYet && hasMore && !loadingMore) loadMore();
  }, [nothingVisibleYet, hasMore, loadingMore, loadMore]);

  // The same for Past, whose loaded rows can all be visits still ahead of their slot.
  const noPastYet = pastRows !== undefined && pastRows.length === 0;
  const { hasMore: pastHasMore, loadingMore: pastLoadingMore, loadMore: loadMorePast } = history;
  useEffect(() => {
    if (noPastYet && pastHasMore && !pastLoadingMore) loadMorePast();
  }, [noPastYet, pastHasMore, pastLoadingMore, loadMorePast]);

  return {
    upcoming: {
      state: upcomingState,
      count: visible?.length ?? 0,
      hasMore: active.hasMore,
      loadingMore: active.loadingMore,
      loadMoreError: active.loadMoreError !== null,
      loadMore: active.loadMore,
      retryLoadMore: active.retryLoadMore,
      refetch: active.refetch,
    },
    past: {
      state: pastState,
      count: pastRows?.length ?? 0,
      hasMore: history.hasMore,
      loadingMore: history.loadingMore,
      loadMoreError: history.loadMoreError !== null,
      loadMore: history.loadMore,
      retryLoadMore: history.retryLoadMore,
      refetch: history.refetch,
    },
  };
}
