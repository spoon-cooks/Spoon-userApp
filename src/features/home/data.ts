import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useActiveBookings, useBookingDetails, useTrackings } from '@features/booking';
import { addressLineOf, currentAddressOf, useAddresses } from '@features/address';
import { useCatalogue } from '@features/catalogue';
import { useInstantAvailability } from '@features/availability';
import { ready } from '@core/data';
import type { ScreenQuery } from '@core/data';
import { currentSkewMs, slotHasEnded } from '@core/time';

import {
  formatClockLabel,
  formatDateLabel,
  formatTimeLabel,
  homeFrom,
  minutesOverdue,
  minutesRemainingUntil,
  minutesUntil,
} from './adapters';

import { homeBannerFor } from './state/homeBannerView';
import { DEMO_HOME_ACTIVE_BOOKING } from '@/demo/fixtures/home';
import type { HomeViewModel } from './types';

import type { BookingSummaryDto } from '@features/booking';

/**
 * The photo the Home banner draws for a booking's cook: the backend's, or none (DEC-114). The app
 * bundles no cook's photograph, so there is no fallback tier.
 */
export function homeCookPhotoFor(
  cook:
    { readonly photoUrl?: string | null; readonly profileCode?: string | null } | null | undefined,
): { readonly cookPhotoUrl: string | null; readonly cookPhotoFallbackUrl: string | null } {
  return { cookPhotoUrl: cook?.photoUrl ?? null, cookPhotoFallbackUrl: null };
}

/**
 * Every booking Home's carousel should offer, ascending by date/time — a past/live booking
 * (earlier `scheduledStart`) sorts before an upcoming one, which is the requested reading order.
 *
 * `GET /v1/me/bookings/active` already does the filtering: it returns live/upcoming bookings plus
 * completed-but-unrated-and-unrefunded ones within a server-side 120-hour backstop from
 * `actual_end` (confirmed against the backend repo) — this function only orders what it is given,
 * it does not re-filter by time. `status === 'cancelled'` rows are NOT excluded here (the old
 * single-pick version dropped them entirely): a booking the SYSTEM cancelled still gets its
 * apology card, and one the CUSTOMER cancelled is filtered downstream by `homeBannerFor`
 * (`cancelledBy !== 'system'` returns `null`, same as today) rather than by this function guessing
 * who cancelled it from the summary alone, which does not carry that field.
 */
export function selectHomeBookings(
  bookings: readonly BookingSummaryDto[],
): readonly BookingSummaryDto[] {
  return bookings.slice().sort((left, right) => {
    const leftStart =
      left.scheduledStart === null ? Number.POSITIVE_INFINITY : Date.parse(left.scheduledStart);
    const rightStart =
      right.scheduledStart === null ? Number.POSITIVE_INFINITY : Date.parse(right.scheduledStart);
    if (leftStart !== rightStart) return leftStart - rightStart;
    // Deterministic tie-break for equal (or both-null) timestamps.
    return left.id.localeCompare(right.id);
  });
}

/**
 * Home data.
 *
 * Three real reads, composed into the one designed screen:
 *
 *  - `GET /v1/me/addresses`  -> the header's address (the customer's default)
 *  - `GET /v1/me/bookings/active` -> whether the booking banner is drawn at all (ruling R-2)
 *  - `GET /v1/bookings/:id`  -> the cook, the timing and `allowedActions`, which the summary omits
 *  - `GET /v1/bookings/:id/tracking` -> the ETA, and ONLY while a cook is en route
 *  - `GET /v1/catalogue`     -> the instant arrival PROMISE behind "Spoon in 30 mins"
 *
 * `DEMO_HOME_ACTIVE_BOOKING` is no longer a data source. It is the static screen definition:
 * the promo panels, the two booking tiles, the cuisine mosaic, the reasons grid, the duration
 * matrix, the exclusions and the promise. None of that is domain state, and there is no endpoint
 * that serves it.
 *
 * PRODUCT_DECISION_PENDING: who owns that marketing content, and whether it should ever become
 * server-driven. Until that is answered it stays clearly static and clearly separate from the
 * domain reads above — which is what §18 asks for.
 *
 * Home renders as soon as the ADDRESS read settles. The active-booking read is additive: a Home
 * that is still fetching its booking shows the pre-booking variant rather than a spinner, which
 * is both faster and exactly what the design does when there is no booking.
 */
export function useHomeData(): ScreenQuery<HomeViewModel> {
  const addresses = useAddresses();
  const active = useActiveBookings();
  const catalogue = useCatalogue();

  const activeSummaries = useMemo(
    () => (active.state.status === 'ready' ? selectHomeBookings(active.state.data) : []),
    [active.state],
  );
  const activeSummaryIds = activeSummaries.map((summary) => summary.id);

  // The summary carries no cook, no timing and no allowed actions, so each card's cook, its
  // countdown and its rateability all come from its own DETAIL. One entry per summary, same
  // order — `useBookingDetails` builds its queries directly from this same id list.
  const details = useBookingDetails(activeSummaryIds, { poll: true });

  // Countdown labels are local display arithmetic over server timestamps. A one-second clock
  // state keeps every live card ticking without a network request; the detail/active reads
  // resync the authoritative timestamps and server clock offset. Live if ANY card needs it.
  const liveCountdown = details.some(
    (detail) =>
      detail.state.status === 'ready' &&
      (detail.state.data.status === 'cook_en_route' || detail.state.data.status === 'cooking'),
  );
  const [serverNowMs, setServerNowMs] = useState<number | null>(null);
  useEffect(() => {
    const updateClock = () => setServerNowMs(Date.now() - currentSkewMs());
    updateClock();
    if (!liveCountdown) return;
    const interval = setInterval(updateClock, 1_000);
    return () => clearInterval(interval);
  }, [liveCountdown]);

  /**
   * Tracking is read ONLY for bookings whose cook is currently travelling, because that is the
   * one banner with an ETA on it (`337:4284` "Arriving in 12 mins") and the endpoint 404s outside
   * that window. Polling it for a confirmed or completed booking would turn an expected absence
   * into an error, and would cost a request per interval for a number no card is showing.
   */
  const enRouteIds = activeSummaryIds.filter((_id, i) => {
    const detail = details[i];
    return detail?.state.status === 'ready' && detail.state.data.status === 'cook_en_route';
  });
  const trackings = useTrackings(enRouteIds);

  /**
   * Whether a cook can actually be dispatched right now — the question the arrival promise on
   * this screen implicitly answers, and did not used to ask.
   *
   * `catalogue.instant.arrivalPromiseMinutes` is POLICY: "we aim to be with you inside 30
   * minutes". It is published whatever the state of the network, so Home said "Spoon in 30 mins"
   * while `GET /v1/availability/instant` was answering `NO_PRESENT_COOK`. The promise is not
   * wrong, it is simply not keepable at that moment, and a screen that states it anyway is making
   * one on the operation's behalf.
   *
   * The probe duration is the SHORTEST the catalogue sells. Availability is asked per duration,
   * and `NO_PRESENT_COOK` is about whether anyone is on shift rather than about a length -- so
   * the shortest is the most permissive question available: if instant is refused even for that,
   * it is refused. A longer probe could report unavailable for a reason the header is not about.
   */
  const defaultAddressId =
    addresses.state.status === 'ready'
      ? (currentAddressOf(addresses.state.data)?.id ?? null)
      : null;

  const probeDurationMinutes =
    catalogue.state.status === 'ready'
      ? (catalogue.state.data.durations[0]?.durationMinutes ?? null)
      : null;
  const instantAvailability = useInstantAvailability({
    addressId: defaultAddressId,
    durationMinutes: probeDurationMinutes,
  });

  const state = useMemo(() => {
    if (addresses.state.status !== 'ready') return addresses.state;

    const defaultAddress = currentAddressOf(addresses.state.data);

    /**
     * One banner per booking, each built from what the SERVER said for THAT booking — never from
     * a client guess. A booking whose own detail has not resolved yet is simply not offered yet;
     * it joins the carousel the moment its detail arrives, the same way the single-card version
     * showed the pre-booking Home rather than a spinner while its one detail was in flight.
     *
     * Both minute figures are display arithmetic over a server INSTANT, not predictions: the ETA
     * is `eta.estimatedArrivalAt` and the time left is `timing.expectedEnd`, which moves when a
     * service starts late or is extended. `scheduledStart + duration` is deliberately not used
     * for either.
     */
    const activeBookings =
      serverNowMs === null
        ? []
        : (() => {
            const serverNow = new Date(serverNowMs);
            const trackingByBookingId = new Map(
              enRouteIds.map((id, i) => [
                id,
                trackings[i]?.state.status === 'ready' ? trackings[i]?.state.data : undefined,
              ]),
            );

            return activeSummaries
              .map((summary, i) => {
                const detail = details[i];
                if (detail?.state.status !== 'ready') return null;
                const detailData = detail.state.data;
                const trackingData = trackingByBookingId.get(summary.id);

                return homeBannerFor({
                  bookingId: summary.id,
                  status: detailData.status,
                  cookName: detailData.cook?.name ?? null,
                  // The backend's photo; a cook without one renders the banner without a photo.
                  // See `homeCookPhotoFor`.
                  ...homeCookPhotoFor(detailData.cook),
                  dateLabel: formatDateLabel(detailData.scheduledStart, serverNow),
                  timeLabel: formatTimeLabel(detailData.scheduledStart, detailData.durationMinutes),
                  etaMinutes: minutesUntil(trackingData?.eta.estimatedArrivalAt, serverNow),
                  minutesLeft:
                    detailData.status === 'cooking'
                      ? minutesRemainingUntil(detailData.timing.expectedEnd, serverNow)
                      : null,
                  // The same instant read the other way, so the badge can count up past it.
                  minutesOver:
                    detailData.status === 'cooking'
                      ? minutesOverdue(detailData.timing.expectedEnd, serverNow)
                      : null,
                  arrivedAtLabel: formatClockLabel(detailData.timing.arrivedAt),
                  canRate: detailData.allowedActions.canRate,
                  cancelledBy: detailData.cancellation?.cancelledBy ?? null,
                  // The same window `timeLabel` above draws, asked whether it is over. Only the
                  // cancelled card reads it; see `variantFor`.
                  slotEnded: slotHasEnded(
                    detailData.scheduledStart,
                    detailData.durationMinutes,
                    serverNow,
                  ),
                  reassigned: detailData.reassignment?.occurred === true,
                  recoveryHandoff: detailData.recovery?.state === 'support_handoff',
                });
              })
              .filter((banner): banner is NonNullable<typeof banner> => banner !== null);
          })();

    const base = DEMO_HOME_ACTIVE_BOOKING;
    /**
     * The promise is stated only while it can be kept.
     *
     * `available === false` drops the minutes from both surfaces -- the header reads "Spoon", the
     * Instant tile "Get a cook" -- rather than hiding the tile or inventing a different number.
     * The offer is still real; what is not real, today, is the timing.
     *
     * An availability read that has NOT resolved is treated as unavailable too. The alternative
     * is to show a promise on the strength of not having asked yet, and then take it away a
     * moment later, which is both a flicker and a claim the app has no basis for. The minutes
     * appear when the server says they can be met, and not before -- so the day instant is
     * switched on, every one of these comes back on its own with nothing to redeploy.
     */
    const instantAvailable =
      instantAvailability.state.status === 'ready' && instantAvailability.state.data.available;

    /**
     * The minutes Home states, from the REAL estimate where one exists.
     *
     * `projectedArrival.etaMinutes` is computed per request for this address: route time to its
     * gate from the candidate cook, plus when that cook comes free, plus the preparation
     * allowance. It is the only number here that reflects anything about actual supply.
     *
     * Both figures it replaces are the same fixed 30. `catalogue.instant.arrivalPromiseMinutes`
     * is the published promise, and `arrivalTargetMinutes` on the availability response is that
     * same promise echoed back -- the backend locks it to exactly 30 by DEC-019 and two
     * validators, so reading either one could never have shown a customer anything else. Home
     * said "Spoon in 30 mins" to everybody, everywhere, at every hour, while the honest answer
     * was already on the wire and being dropped by a schema that did not declare it.
     *
     * The promise remains the FALLBACK, which is its honest use: no candidate means nothing to
     * estimate from, and the operating promise is then the truest thing left to say. Absent both,
     * the minutes are removed rather than invented.
     */
    const estimated =
      instantAvailability.state.status === 'ready'
        ? instantAvailability.state.data.projectedArrival?.etaMinutes
        : null;
    const promised =
      catalogue.state.status === 'ready'
        ? catalogue.state.data.instant.arrivalPromiseMinutes
        : null;

    const promiseMinutes = !instantAvailable
      ? null
      : typeof estimated === 'number' && estimated > 0
        ? Math.round(estimated)
        : typeof promised === 'number' && promised > 0
          ? promised
          : null;

    return ready(
      homeFrom({
        /**
         * The arrival PROMISE appears TWICE on this screen and both readings are the catalogue's.
         *
         * The header headline was already patched from `instant.arrivalPromiseMinutes`; the
         * Instant tile's emphasised run was not, so it kept rendering the fixture's transcribed
         * " 18 mins" while the Instant sheet — which reads the same policy value — said 30. One
         * screen stated the promise two ways, and the tile's was simply a number from a Figma
         * frame. Both now come from the one published figure, so re-tuning the promise moves
         * every surface at once and none of them can drift again.
         *
         * The tile is matched by id rather than by position: `tiles` is ordered content, and a
         * future payload that puts Schedule first must not rewrite Schedule's subtitle.
         */
        base:
          promiseMinutes === null
            ? {
                ...base,
                /**
                 * `base` is the design fixture, and it carries "Spoon in 18 mins" and a " 18
                 * mins" run transcribed off the frame. Falling through to it unchanged would
                 * replace one unkeepable promise with an older one, so the minutes are removed
                 * here rather than merely left un-patched.
                 */
                header: { ...base.header, etaHeadline: 'Spoon' },
                tiles: base.tiles.map((tile) =>
                  tile.id === 'instant' && tile.subtitleEmphasis !== undefined
                    ? /*
                       * BOTH runs. The subtitle is one sentence in two styles -- "Get a cook in"
                       * and an emphasised " 30 mins" -- so clearing only the second leaves a
                       * dangling "Get a cook in" with nothing after it. The sentence loses its
                       * preposition with its number.
                       */
                      { ...tile, subtitle: 'Get a cook', subtitleEmphasis: '' }
                    : tile,
                ),
              }
            : {
                ...base,
                header: { ...base.header, etaHeadline: `Spoon in ${promiseMinutes} mins` },
                tiles: base.tiles.map((tile) =>
                  tile.id === 'instant' && tile.subtitleEmphasis !== undefined
                    ? { ...tile, subtitleEmphasis: ` ${promiseMinutes} mins` }
                    : tile,
                ),
              },
        addressLabel: defaultAddress?.label ?? null,
        addressLine:
          defaultAddress === undefined || defaultAddress === null
            ? null
            : addressLineOf(defaultAddress),
        activeBookings,
      }),
    );
  }, [
    addresses.state,
    activeSummaries,
    details,
    trackings,
    enRouteIds,
    catalogue.state,
    instantAvailability.state,
    serverNowMs,
  ]);

  const refetchers = useRef({
    addresses: addresses.refetch,
    active: active.refetch,
    details: details.map((detail) => detail.refetch),
    trackings: trackings.map((tracking) => tracking.refetch),
  });
  useEffect(() => {
    refetchers.current = {
      addresses: addresses.refetch,
      active: active.refetch,
      details: details.map((detail) => detail.refetch),
      trackings: trackings.map((tracking) => tracking.refetch),
    };
  }, [addresses.refetch, active.refetch, details, trackings]);
  const refetch = useCallback(() => {
    refetchers.current.addresses();
    refetchers.current.active();
    refetchers.current.details.forEach((detailRefetch) => detailRefetch());
    refetchers.current.trackings.forEach((trackingRefetch) => trackingRefetch());
  }, []);

  return {
    state,
    refetch,
  };
}
