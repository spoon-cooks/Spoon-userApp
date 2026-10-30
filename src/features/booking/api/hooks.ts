import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { idempotency } from '@core/api';
import { useApiInfiniteQuery, useApiQueries, useApiQuery } from '@core/data';
import { observeServerTime } from '@core/time';
import { isAwaitingConfirmation } from '../state/bookingStatusView';
import type { PagedScreenQuery, ScreenQuery } from '@core/data';
import { useRuntime } from '@core/runtimeContext';

import { createBookingApi, createServiceApi } from './bookingApi';
import type {
  BookingActivePage,
  BookingHistoryPage,
  BookingRequestInput,
  RefundHistoryPage,
} from './bookingApi';
import type { CheckoutLauncher } from '@features/payment';
import { unavailableCheckoutLauncher } from '@features/payment';
import { bookingKeys } from './keys';
import { uploadRatingAttachments } from '../ratingMedia';
import type { RatingAttachment } from '../ratingMedia';
import { availabilityKeys } from '@features/availability';
import type {
  BookingCreateResponse,
  BookingDetailDto,
  BookingSummaryDto,
  CancellationPreviewDto,
  ExtensionQuoteDto,
  QuoteResponse,
  RatingResultDto,
  MyRatingMediaDto,
  RefundDto,
  TipOrderDto,
  RescheduleOptionsDto,
  TrackingDto,
} from './schemas';

/**
 * Booking queries and mutations.
 *
 * ## Invalidation, not optimism
 *
 * No mutation here writes a predicted result into the cache. A cancellation does not set the
 * status to `cancelled`, and an extension does not move `expectedEnd`. Both invalidate and
 * refetch, because the server decides the resulting state and the refund, and a client that
 * guessed would show a number the customer was not actually charged.
 *
 * ## Polling
 *
 * The active booking and tracking refetch on an interval while a booking is live. That is the
 * only "push" this app has until notifications land, and it is deliberately modest: the designed
 * screens show minute-granularity ETAs, so a 30-second poll is already finer than the display.
 */

const LIVE_POLL_MS = 30_000;

export function useBookingDetail(
  bookingId: string | null,
  options: { poll?: boolean } = {},
): ScreenQuery<BookingDetailDto> {
  const { api } = useRuntime();
  const bookings = createBookingApi(api);

  return useApiQuery<BookingDetailDto>({
    queryKey: bookingKeys.detail(bookingId ?? 'none'),
    queryFn: async ({ signal }) => {
      const response = await bookings.detail(bookingId ?? '', signal);
      // Measured HERE, against the device clock read at the moment the response landed. Doing it
      // any later folds render delay into the offset (§29). Consumers keep receiving the booking
      // alone — the skew is device-wide state, not a field of this booking.
      observeServerTime(response.serverTime);
      return response.booking;
    },
    enabled: bookingId !== null,
    staleTime: 10_000,
    refetchInterval: options.poll === true ? LIVE_POLL_MS : false,
  });
}

/**
 * `useBookingDetail`'s plural sibling — one detail per id, for the Home booking carousel, where
 * the number of active bookings varies per customer. Built on `useApiQueries` rather than calling
 * `useBookingDetail` in a loop, since hooks cannot be called a variable number of times.
 *
 * Shares `bookingKeys.detail` with `useBookingDetail`, deliberately, for the same reason that
 * hook already shares it with `useBookingConfirmation`: it is the SAME booking, so a customer who
 * has this id open elsewhere (a detail screen, a confirmation screen) reads the same cache entry
 * rather than a second, possibly older one.
 */
export function useBookingDetails(
  bookingIds: readonly string[],
  options: { poll?: boolean } = {},
): readonly ScreenQuery<BookingDetailDto>[] {
  const { api } = useRuntime();
  const bookings = createBookingApi(api);

  return useApiQueries<BookingDetailDto>(
    bookingIds.map((bookingId) => ({
      queryKey: bookingKeys.detail(bookingId),
      queryFn: async ({ signal }) => {
        const response = await bookings.detail(bookingId, signal);
        observeServerTime(response.serverTime);
        return response.booking;
      },
      staleTime: 10_000,
      refetchInterval: options.poll === true ? LIVE_POLL_MS : false,
    })),
  );
}

/**
 * How often `433:2290` asks whether the booking has been confirmed.
 *
 * Much tighter than `LIVE_POLL_MS` because the customer is WATCHING this one: they have paid, and
 * every second of the wait is spent on a screen with nothing else on it. It stops the moment the
 * booking settles, so the rate applies to a handful of seconds, not to a session.
 */
const CONFIRMATION_POLL_MS = 2_000;

/**
 * `433:2290` — the read that decides when Page 21 is over.
 *
 * Shares `bookingKeys.detail` with `useBookingDetail`, deliberately: it is the SAME booking, and
 * one cache entry means the lifecycle screen the customer lands on has the payload this screen
 * already fetched rather than a second, possibly older one.
 *
 * The interval is a function of the data, so polling STOPS by itself the moment the server reports
 * anything other than `created`. Nothing here interprets that transition — see
 * `isAwaitingConfirmation`, and see the route for what is done about it.
 */
export function useBookingConfirmation(bookingId: string | null): ScreenQuery<BookingDetailDto> {
  const { api } = useRuntime();
  const bookings = createBookingApi(api);

  return useApiQuery<BookingDetailDto>({
    queryKey: bookingKeys.detail(bookingId ?? 'none'),
    queryFn: async ({ signal }) => {
      const response = await bookings.detail(bookingId ?? '', signal);
      observeServerTime(response.serverTime);
      return response.booking;
    },
    enabled: bookingId !== null,
    // No staleness window: this screen exists because the answer is expected to change.
    staleTime: 0,
    refetchInterval: (booking) =>
      booking === undefined || isAwaitingConfirmation(booking.status)
        ? CONFIRMATION_POLL_MS
        : false,
  });
}

export function useActiveBookings(
  options: { enabled?: boolean; poll?: boolean } = {},
): ScreenQuery<readonly BookingSummaryDto[]> {
  const { api } = useRuntime();
  const bookings = createBookingApi(api);

  return useApiQuery<readonly BookingSummaryDto[]>({
    queryKey: bookingKeys.active(),
    // Home reads only the first page: the carousel and banner are drawn from the leading rows,
    // which is where the server's ordering puts what is happening now.
    queryFn: async ({ signal }) => (await bookings.active(null, signal)).bookings,
    enabled: options.enabled ?? true,
    staleTime: 10_000,
    refetchInterval: options.poll === false ? false : LIVE_POLL_MS,
  });
}

const activeBookingsOf = (page: BookingActivePage) => page.bookings;
const nextActiveCursor = (page: BookingActivePage) => page.nextCursor;

/**
 * The in-flight list a page at a time — `GET /v1/me/bookings/active`, the Upcoming tab.
 *
 * Its own cache entry, not `useActiveBookings`': that one is the first page alone, flat, for Home,
 * and the two must not share a key because one holds pages and the other holds rows. Every booking
 * mutation invalidates `bookingKeys.all()`, which covers both. It polls like its sibling, which
 * re-reads only the pages the customer has scrolled through.
 */
export function useActiveBookingPages(): PagedScreenQuery<readonly BookingSummaryDto[]> {
  const { api } = useRuntime();
  const bookings = createBookingApi(api);

  return useApiInfiniteQuery<BookingActivePage, BookingSummaryDto>({
    queryKey: bookingKeys.activePages(),
    fetchPage: ({ cursor, signal }) => bookings.active(cursor, signal),
    getNextCursor: nextActiveCursor,
    getItems: activeBookingsOf,
    staleTime: 10_000,
    refetchInterval: LIVE_POLL_MS,
  });
}

const bookingsOf = (page: BookingHistoryPage) => page.bookings;
const nextHistoryCursor = (page: BookingHistoryPage) => page.nextCursor;

/**
 * Past bookings, a page at a time — `GET /v1/me/bookings`, newest first.
 *
 * `state` is the rows loaded so far; `loadMore` fetches the next page and `hasMore` says whether
 * there is one. A customer with more than 50 past bookings reaches the rest by scrolling.
 */
export function useBookingHistoryPages(): PagedScreenQuery<readonly BookingSummaryDto[]> {
  const { api } = useRuntime();
  const bookings = createBookingApi(api);

  return useApiInfiniteQuery<BookingHistoryPage, BookingSummaryDto>({
    queryKey: bookingKeys.history(),
    fetchPage: ({ cursor, signal }) => bookings.history(cursor, signal),
    getNextCursor: nextHistoryCursor,
    getItems: bookingsOf,
  });
}

/**
 * The past bookings loaded so far, as a flat list with no paging controls.
 *
 * For callers that only need to LOOK at history (Home asks whether any booking ever completed).
 * It shares `useBookingHistoryPages`' query, so mounting both costs one request, not two.
 */
export function useBookingHistory(): ScreenQuery<readonly BookingSummaryDto[]> {
  const { state, refetch } = useBookingHistoryPages();
  return useMemo(() => ({ state, refetch }), [state, refetch]);
}

/**
 * `GET /v1/bookings/:id/refunds` — one booking's refunds.
 *
 * Read ONLY where a surface names a refund figure. Today that is the auto-cancelled screen
 * (`201:278`), which is why the caller passes `null` for every other lifecycle state rather than
 * adding a request to every booking screen for a number none of them draws.
 */
export function useBookingRefunds(bookingId: string | null): ScreenQuery<readonly RefundDto[]> {
  const { api } = useRuntime();
  const bookings = createBookingApi(api);

  // An empty string is not a booking id: `GET /v1/bookings//refunds` 400s every time. Checked
  // here, not only by callers, so a caller that forgets the guard cannot reintroduce the request.
  const validId = bookingId !== null && bookingId !== '' ? bookingId : null;

  return useApiQuery<readonly RefundDto[]>({
    queryKey: bookingKeys.bookingRefunds(validId ?? 'none'),
    queryFn: ({ signal }) => bookings.bookingRefunds(validId ?? '', signal),
    enabled: validId !== null,
  });
}

/**
 * The customer's own voice note, photos and video on their rating of this booking — what a
 * reopened visit's submitted rate card plays and opens. Only fetched once the booking is rated.
 * The links last about ten minutes, so they are fresh for five and fetched again after that.
 */
export function useMyRatingMedia(bookingId: string | null): ScreenQuery<MyRatingMediaDto> {
  const { api } = useRuntime();
  const service = createServiceApi(api);
  const validId = bookingId !== null && bookingId !== '' ? bookingId : null;

  return useApiQuery<MyRatingMediaDto>({
    queryKey: bookingKeys.myRatingMedia(validId ?? 'none'),
    queryFn: ({ signal }) => service.myRatingMedia(validId ?? '', signal),
    enabled: validId !== null,
    staleTime: 5 * 60_000,
  });
}

const refundsOf = (page: RefundHistoryPage) => page.refunds;
const nextRefundCursor = (page: RefundHistoryPage) => page.nextCursor;

/** `GET /v1/me/refunds` — the customer-level list, so no N+1 over bookings. Paged like history. */
export function useRefunds(): PagedScreenQuery<readonly RefundDto[]> {
  const { api } = useRuntime();
  const bookings = createBookingApi(api);

  return useApiInfiniteQuery<RefundHistoryPage, RefundDto>({
    queryKey: bookingKeys.refunds(),
    fetchPage: ({ cursor, signal }) => bookings.refunds(cursor, signal),
    getNextCursor: nextRefundCursor,
    getItems: refundsOf,
  });
}

export function useCancellationPreview(
  bookingId: string | null,
): ScreenQuery<CancellationPreviewDto> {
  const { api } = useRuntime();
  const bookings = createBookingApi(api);

  return useApiQuery<CancellationPreviewDto>({
    queryKey: bookingKeys.cancellationPreview(bookingId ?? 'none'),
    queryFn: ({ signal }) => bookings.cancellationPreview(bookingId ?? '', signal),
    enabled: bookingId !== null,
    // The band depends on minutes-to-start, so a stale preview can show the wrong refund.
    staleTime: 0,
  });
}

export function useRescheduleOptions(bookingId: string | null): ScreenQuery<RescheduleOptionsDto> {
  const { api } = useRuntime();
  const bookings = createBookingApi(api);

  return useApiQuery<RescheduleOptionsDto>({
    queryKey: bookingKeys.rescheduleOptions(bookingId ?? 'none'),
    queryFn: ({ signal }) => bookings.rescheduleOptions(bookingId ?? '', signal),
    enabled: bookingId !== null,
  });
}

export function useTracking(
  bookingId: string | null,
  options: { poll?: boolean } = {},
): ScreenQuery<TrackingDto> {
  const { api } = useRuntime();
  const service = createServiceApi(api);

  return useApiQuery<TrackingDto>({
    queryKey: bookingKeys.tracking(bookingId ?? 'none'),
    queryFn: ({ signal }) => service.tracking(bookingId ?? '', signal),
    enabled: bookingId !== null,
    staleTime: 10_000,
    // The server publishes `refreshAfterSeconds`; polling cadence is its call, not ours.
    // `LIVE_POLL_MS` only covers the first fetch, before any response exists.
    refetchInterval:
      options.poll === false
        ? false
        : (data) =>
            data?.refreshAfterSeconds === undefined || data.refreshAfterSeconds === null
              ? LIVE_POLL_MS
              : data.refreshAfterSeconds * 1000,
  });
}

/**
 * `useTracking`'s plural sibling, for the same reason `useBookingDetails` exists: the Home
 * carousel needs tracking for however many of its bookings are currently `cook_en_route`, which
 * is a variable count. Ids for a booking NOT currently being tracked are simply omitted by the
 * caller — this hook fetches tracking for exactly the ids it is given.
 */
export function useTrackings(
  bookingIds: readonly string[],
  options: { poll?: boolean } = {},
): readonly ScreenQuery<TrackingDto>[] {
  const { api } = useRuntime();
  const service = createServiceApi(api);

  return useApiQueries<TrackingDto>(
    bookingIds.map((bookingId) => ({
      queryKey: bookingKeys.tracking(bookingId),
      queryFn: ({ signal }) => service.tracking(bookingId, signal),
      staleTime: 10_000,
      refetchInterval:
        options.poll === false
          ? false
          : (data) =>
              data?.refreshAfterSeconds === undefined || data.refreshAfterSeconds === null
                ? LIVE_POLL_MS
                : data.refreshAfterSeconds * 1000,
    })),
  );
}

export function useExtensionOptions(bookingId: string | null) {
  const { api } = useRuntime();
  const service = createServiceApi(api);

  return useApiQuery({
    queryKey: bookingKeys.extensionOptions(bookingId ?? 'none'),
    queryFn: ({ signal }) => service.extensionOptions(bookingId ?? '', signal),
    enabled: bookingId !== null,
  });
}

/**
 * `POST /v1/bookings/quote` as a READ.
 *
 * A quote creates nothing — it asks the server what a booking would cost — so a selection can
 * fire it, and the answer can be cached against that selection. It is a mutation only in HTTP
 * method. The response carries its own `validUntil`; nothing here extends it, and no price on
 * the screen is ever assembled from the catalogue when a quote exists.
 *
 * Disabled until the selection is complete, so an incomplete draft asks for nothing.
 */
export function useQuote(
  input: {
    readonly addressId: string | null;
    readonly slotType: 'instant' | 'scheduled';
    readonly durationMinutes: number | null;
    readonly scheduledStart?: string | null;
  },
  options: { enabled?: boolean } = {},
): ScreenQuery<QuoteResponse> {
  const { api } = useRuntime();
  const bookings = createBookingApi(api);

  const complete =
    input.addressId !== null &&
    input.durationMinutes !== null &&
    // A scheduled quote without a start is not a quote for anything.
    (input.slotType === 'instant' || (input.scheduledStart ?? null) !== null);

  return useApiQuery<QuoteResponse>({
    queryKey: bookingKeys.quote({
      addressId: input.addressId ?? 'none',
      slotType: input.slotType,
      durationMinutes: input.durationMinutes ?? 0,
      scheduledStart: input.scheduledStart ?? null,
    }),
    queryFn: ({ signal }) =>
      bookings.quote(
        {
          addressId: input.addressId ?? '',
          slotType: input.slotType,
          durationMinutes: input.durationMinutes ?? 0,
          ...(input.scheduledStart === undefined || input.scheduledStart === null
            ? {}
            : { scheduledStart: input.scheduledStart }),
        },
        signal,
      ),
    enabled: complete && options.enabled !== false,
  });
}

/** `POST /v1/bookings/quote`. A quote creates nothing, so it is safe to fire on selection. */
export function useBookingQuote() {
  const { api } = useRuntime();
  const bookings = createBookingApi(api);

  return useMutation<QuoteResponse, Error, BookingRequestInput>({
    mutationFn: (input) => bookings.quote(input),
  });
}

/**
 * `POST /v1/bookings`.
 *
 * The scope names the DRAFT so a retry after an ambiguous failure cannot create two bookings.
 * It is released only on success — the point at which the intent is genuinely spent.
 */
export function useCreateBooking() {
  const { api } = useRuntime();
  const queryClient = useQueryClient();
  const bookings = createBookingApi(api);

  return useMutation<BookingCreateResponse, Error, { input: BookingRequestInput; scope: string }>({
    mutationFn: ({ input, scope }) => bookings.create(input, scope),
    onSuccess(_result, variables) {
      idempotency.release(variables.scope);
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all() });
    },
  });
}

export function useCancelBooking() {
  const { api } = useRuntime();
  const queryClient = useQueryClient();
  const bookings = createBookingApi(api);

  return useMutation<
    unknown,
    Error,
    { bookingId: string; reasonCode: string; reasonDetail?: string; scope: string }
  >({
    mutationFn: ({ bookingId, reasonCode, reasonDetail, scope }) =>
      bookings.cancel(
        bookingId,
        { reasonCode, ...(reasonDetail === undefined ? {} : { reasonDetail }) },
        scope,
      ),
    onSuccess(_result, variables) {
      idempotency.release(variables.scope);
      // The refund and the final state are the server's. Refetch everything a cancel touches.
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all() });
      void queryClient.invalidateQueries({ queryKey: availabilityKeys.all() });
    },
  });
}

export function useRescheduleBooking() {
  const { api } = useRuntime();
  const queryClient = useQueryClient();
  const bookings = createBookingApi(api);

  return useMutation<unknown, Error, { bookingId: string; scheduledStart: string; scope: string }>({
    mutationFn: ({ bookingId, scheduledStart, scope }) =>
      bookings.reschedule(bookingId, scheduledStart, scope),
    onSuccess(_result, variables) {
      idempotency.release(variables.scope);
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all() });
      void queryClient.invalidateQueries({ queryKey: availabilityKeys.all() });
    },
  });
}

/**
 * Extend a live booking, and PAY for it.
 *
 * ## Why this is one mutation and not three
 *
 * The same reason `usePayForBooking` is: the steps are not independently meaningful. An
 * extension without a checkout is capacity reserved in `payment_pending` that nobody ever pays
 * for, and a checkout without a verify is a payment the backend has not accepted. Modelling them
 * as one operation makes "we always try to verify what we opened" structural rather than a rule
 * someone has to remember. The previous version stopped after the first step, which is exactly
 * the dangling state that shape prevents.
 *
 * ## The amount is the server's, always
 *
 * `totalAmountPaise` comes back on the quote and is what checkout opens against. Nothing here
 * multiplies a per-minute rate or adds tax: an unpriced length fails closed on the server rather
 * than being priced by inference, and the 10 PM cutoff and feasibility are decided there too.
 *
 * ## What it does NOT do
 *
 * It does not add minutes to a clock. `onSettled` re-reads the booking and its tracking, and the
 * In-service view re-renders from the server's answer — including when verification FAILED, both
 * because a failed verify can still have moved the booking (the Razorpay webhook arrives
 * independently) and because a customer who closed checkout must not be left looking at a timer
 * the backend never extended.
 *
 * ## `keyId`
 *
 * Checkout needs the public Razorpay key, and the backend now publishes it on this reply exactly
 * as it does for a booking order and a tip. The refusal below is kept anyway and fails CLOSED:
 * opening Razorpay against a fabricated or app-embedded key would either be rejected downstream
 * or take a real payment against the wrong merchant, so an environment that somehow answers
 * without a key must stop here rather than improvise one. The quote is still returned to the
 * caller, so a `processing` order and a missing key stay distinguishable from a transport error.
 */
export function useCreateExtension(launcher: CheckoutLauncher = unavailableCheckoutLauncher) {
  const { api } = useRuntime();
  const queryClient = useQueryClient();
  const service = createServiceApi(api);

  return useMutation<
    ExtensionQuoteDto,
    Error,
    {
      bookingId: string;
      minutes: number;
      scope: string;
      description?: string;
      /** Checkout has returned and the backend is now verifying the payment. */
      onVerifying?: () => void;
    }
  >({
    async mutationFn({ bookingId, minutes, scope, description, onVerifying }) {
      const quote = await service.createExtension(bookingId, minutes, scope);

      // Not ready to pay for: the provider order is still being created upstream. Returned rather
      // than thrown, so the caller can retry the SAME idempotent intent instead of extending
      // twice. The scope is deliberately NOT released here.
      if (quote.providerOrderId === null) return quote;

      const keyId = quote.keyId ?? null;
      if (keyId === null) {
        throw new Error(
          'No Razorpay publishable key was returned with the extension quote, so checkout ' +
            'cannot be opened. The deployed backend is not configured with RAZORPAY_KEY_ID.',
        );
      }

      const result = await launcher.open({
        keyId,
        providerOrderId: quote.providerOrderId,
        amountPaise: quote.totalAmountPaise,
        currency: quote.currency,
        description: description ?? `Extend booking by ${minutes} minutes`,
      });

      // The backend checks the signature. Until this resolves, nothing is paid and the extension
      // stays `payment_pending`.
      onVerifying?.();
      await service.verifyExtensionPayment(bookingId, quote.extensionId, result);
      idempotency.release(scope);

      return quote;
    },
    onSettled(_data, _error, variables) {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all() });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.detail(variables.bookingId) });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.tracking(variables.bookingId) });
      void queryClient.invalidateQueries({
        queryKey: bookingKeys.extensionOptions(variables.bookingId),
      });
    },
  });
}

/**
 * The idempotency scope for a rating submission — and why writing gets its own.
 *
 * Rating and writing arrive as SEPARATE calls from separate screens. Home rates a booking with
 * no feedback at all; the completion screen's Submit is disabled without words. A customer who
 * does both makes two calls against one booking.
 *
 * The scope store is in memory, so within a single app session one scope hands back one key --
 * and the backend rejects a key reused with a DIFFERENT body: 409 IDEMPOTENCY_CONFLICT, raised
 * before the rating logic runs. Under a single scope the second call never landed, and the
 * customer was told nothing. (Across a restart the store is empty and a fresh key is minted, so
 * the same flow worked or failed depending on whether the app had been killed -- which is worse
 * than failing outright.)
 *
 * Splitting on whether words are attached separates the two intents exactly, because that is
 * precisely how the two entry points differ. A genuine RETRY of either repeats its own key,
 * which is the replay protection the store exists for.
 *
 * The scope is a CLIENT-side name, never the wire value: `idempotencyHeader` mints a random
 * `[a-z0-9-]` key per scope, so the `:` here never reaches the `Idempotency-Key` header.
 */
export function ratingScopeFor(bookingId: string, feedback: string | undefined): string {
  const words = feedback?.trim() ?? '';
  return words === '' ? `booking.rate:${bookingId}` : `booking.rate:${bookingId}:words`;
}

/**
 * The scope for a rate-card submission (Figma "Ratings" `1603:50`): one per distinct submission.
 *
 * The card sends stars, chips, a note, the different-cook answer and media in one call, and the
 * customer can change any of them after a failed send. Keyed on the content, a genuine retry
 * repeats its key (and, with the upload cache below, its media ids) and replays; a changed
 * submission gets a key of its own instead of an IDEMPOTENCY_CONFLICT.
 */
export function ratingSubmissionScope(
  bookingId: string,
  request: {
    readonly stars: number;
    readonly exceptional?: boolean;
    readonly feedback?: string;
    readonly chips?: readonly string[];
    readonly avoidCook?: boolean;
    readonly attachments?: readonly RatingAttachment[];
  },
): string {
  const content = JSON.stringify([
    request.stars,
    request.exceptional === true,
    request.feedback?.trim() ?? '',
    request.chips ?? [],
    request.avoidCook === true,
    (request.attachments ?? []).map((attachment) => attachment.uri),
  ]);
  return `booking.rate:${bookingId}:${digest(content)}`;
}

/** A short, stable fingerprint (FNV-1a) — a scope name, not a security boundary. */
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Media already uploaded for a booking, by local file — so a retry after a failed rating call
 * reuses what landed rather than uploading it again under a new id.
 */
const uploadedRatingMedia = new Map<string, string>();

export function useRateBooking() {
  const { api } = useRuntime();
  const queryClient = useQueryClient();
  const service = createServiceApi(api);

  return useMutation<
    RatingResultDto,
    Error,
    {
      bookingId: string;
      stars: number;
      exceptional?: boolean;
      feedback?: string;
      chips?: readonly string[];
      avoidCook?: boolean;
      /** Uploaded first, each to its own signed URL; the rating then names them. */
      attachments?: readonly RatingAttachment[];
      scope: string;
    }
  >({
    mutationFn: async ({
      bookingId,
      stars,
      exceptional,
      feedback,
      chips,
      avoidCook,
      attachments,
      scope,
    }) => {
      const mediaIds =
        attachments === undefined || attachments.length === 0
          ? []
          : await uploadRatingAttachments(service, bookingId, attachments, undefined, {
              get: (uri) => uploadedRatingMedia.get(`${bookingId}|${uri}`),
              set: (uri, mediaId) => uploadedRatingMedia.set(`${bookingId}|${uri}`, mediaId),
            });
      return service.rate(
        bookingId,
        {
          stars,
          ...(exceptional === undefined ? {} : { exceptional }),
          ...(feedback === undefined ? {} : { feedback }),
          ...(chips === undefined ? {} : { chips }),
          ...(avoidCook === undefined ? {} : { avoidCook }),
          ...(mediaIds.length === 0 ? {} : { mediaIds }),
        },
        scope,
      );
    },
    onSuccess(_result, variables) {
      idempotency.release(variables.scope);
      // A rating changes the booking's own state (`allowedActions.canRate` flips) and Home
      // selects its banner from the ACTIVE LIST, so both are re-read rather than patched here.
      void queryClient.invalidateQueries({ queryKey: bookingKeys.detail(variables.bookingId) });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all() });
    },
  });
}

/**
 * Tip the cook, and actually take the payment.
 *
 * Same three-steps-as-one shape as `usePayForBooking` and for the same reason: the tip order the
 * backend creates is a real Razorpay order, and one that is never opened or never verified is a
 * tip the cook does not receive. This used to stop after `POST /tips` and discard the reply,
 * which looked like success and moved no money.
 *
 * The amount, the order and the key are ALL the server's. `catalogue.tips.suggestedAmountsPaise`
 * decides only what the sheet offers; the order is created backend-side from the amount sent, and
 * verification re-reads the provider's amount and refuses a mismatch. Nothing here computes a
 * total.
 *
 * `status: 'processing'` (the 202) or a null `providerOrderId` means the upstream order is not
 * ready. Checkout cannot open against an order id that does not exist, so the quote is returned
 * unopened and the caller retries the same idempotent intent — the scope is not released.
 *
 * Success is never announced from here. `onSettled` re-reads the booking, whose `tip` field is
 * the authority on what was actually captured, and the completed screen renders from that.
 */
export function useTipCook(launcher: CheckoutLauncher = unavailableCheckoutLauncher) {
  const { api } = useRuntime();
  const queryClient = useQueryClient();
  const service = createServiceApi(api);

  return useMutation<
    TipOrderDto,
    Error,
    {
      bookingId: string;
      amountPaise: number;
      scope: string;
      description?: string;
      /** Checkout has returned and the backend is now verifying the payment. */
      onVerifying?: () => void;
    }
  >({
    async mutationFn({ bookingId, amountPaise, scope, description, onVerifying }) {
      const order = await service.tip(bookingId, amountPaise, scope);

      if (order.status === 'processing' || order.providerOrderId === null) return order;
      if (order.keyId === null) {
        throw new Error('No Razorpay publishable key is configured for this environment.');
      }

      const result = await launcher.open({
        keyId: order.keyId,
        providerOrderId: order.providerOrderId,
        amountPaise: order.amountPaise,
        currency: order.currency,
        description: description ?? 'Tip for your cook',
      });
      onVerifying?.();

      /**
       * Derived from the ATTEMPT's scope, not fixed per booking.
       *
       * It used to be `booking.tip.verify:<bookingId>` and was never released, so a customer's
       * SECOND tip verified under the first tip's key with a different Razorpay payload -- a
       * request-hash mismatch, which the backend answers 409 unconditionally. The payment was
       * captured and the client could never verify it. Tips are not capped per booking, so this
       * was reachable by anyone who tipped twice.
       */
      await service.verifyTip(bookingId, result, `${scope}.verify`);

      return order;
    },
    onSettled(_data, _error, variables) {
      /**
       * Released on EVERY outcome, not just success.
       *
       * A key held past a failure is a key the next attempt reuses, and the backend's claim row
       * commits as `processing` BEFORE it calls Razorpay: a reused key whose first attempt is
       * still in flight does not replay and does not 409 -- it falls through and creates a second
       * tip, a second payment and a second Razorpay order, returning 201. Silent duplication.
       * Dropping the key here means the next attempt is a new intent, which is what it is.
       */
      idempotency.release(variables.scope);
      idempotency.release(`${variables.scope}.verify`);

      // Refetched regardless of outcome: the webhook can finalize a tip the client never got to
      // verify, so the server's view is re-read either way rather than inferred from the error.
      void queryClient.invalidateQueries({ queryKey: bookingKeys.detail(variables.bookingId) });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all() });
    },
  });
}
