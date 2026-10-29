import { Text } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';

import {
  DEFAULT_API_STUBS,
  createStubApi,
  createTestRuntime,
  renderWithRuntime,
} from '@/test/renderWithRuntime';
import type { StubHandlers } from '@/test/renderWithRuntime';

import { useBookingSubmission, useInstantData } from './data';

/**
 * Quote -> create, through the real hooks and the real transport boundary.
 *
 * What is asserted here is the CONTRACT, not the copy: which endpoint is called, with what body,
 * under what key, and — most of all — what the client refuses to do on its own. The stub API
 * rejects any request it was not given a handler for, so an accidental extra call fails the test
 * rather than passing silently.
 */

function quoteFor(totalAmountPaise: number) {
  return {
    quote: {
      amountPaise: totalAmountPaise,
      durationMinutes: 60,
      serviceAmountPaise: 12900,
      taxRateBps: 500,
      taxAmountPaise: 645,
      totalAmountPaise,
      currency: 'INR',
      pricingVersion: 'pricing-policy-v0',
      validUntil: '2026-08-18T12:00:00.000Z',
    },
    slotType: 'instant',
    scheduledStart: null,
    durationMinutes: 60,
  };
}

/** Records every call the hooks make, so the test can assert on bodies and headers. */
function recordingApi(handlers: StubHandlers) {
  const calls: { key: string; body: unknown; headers: Record<string, string> | undefined }[] = [];
  const stub = createStubApi(handlers);

  return {
    calls,
    api: {
      async request(path: string, options: Parameters<typeof stub.request>[1]) {
        calls.push({
          key: `${options.method ?? 'GET'} ${path}`,
          body: options.body,
          headers: options.headers as Record<string, string> | undefined,
        });
        return stub.request(path, options);
      },
    } as typeof stub,
  };
}

function Harness({ durationId }: { durationId: string | null }) {
  const submission = useBookingSubmission({ slotType: 'instant', durationId });
  return (
    <>
      <Text testID="can-submit">{String(submission.canSubmit)}</Text>
      <Text testID="quote-status">{submission.quote.state.status}</Text>
    </>
  );
}

/**
 * `useBookingSubmission` releases an abandoned hold when the screen loses focus, so it reaches
 * for navigation. These tests render the hook directly, with no navigator above it — the mock
 * runs the effect and its cleanup on unmount, which is the moment being asserted.
 */
jest.mock('expo-router', () => ({
  __esModule: true,
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(effect, [effect]);
  },
}));

describe('useBookingSubmission', () => {
  it('asks for no quote until a duration is selected', async () => {
    const { calls, api } = recordingApi({
      'GET /v1/me/addresses': DEFAULT_API_STUBS['GET /v1/me/addresses']!,
    });
    const { getByTestId } = renderWithRuntime(<Harness durationId={null} />, {
      runtime: createTestRuntime({ api }),
    });

    await waitFor(() => expect(getByTestId('can-submit')).toHaveTextContent('false'));
    // An incomplete selection is not a cheap quote — it is not a quote at all.
    expect(calls.some((call) => call.key === 'POST /v1/bookings/quote')).toBe(false);
  });

  it('quotes the selected duration against the default address', async () => {
    const { calls, api } = recordingApi({
      'GET /v1/me/addresses': DEFAULT_API_STUBS['GET /v1/me/addresses']!,
      'POST /v1/bookings/quote': () => quoteFor(13545),
    });
    const { getByTestId } = renderWithRuntime(<Harness durationId="dur-60" />, {
      runtime: createTestRuntime({ api }),
    });

    await waitFor(() => expect(getByTestId('quote-status')).toHaveTextContent('ready'));
    expect(getByTestId('can-submit')).toHaveTextContent('true');

    const quote = calls.find((call) => call.key === 'POST /v1/bookings/quote');
    expect(quote?.body).toEqual({
      addressId: 'addr-1',
      slotType: 'instant',
      durationMinutes: 60,
    });
  });
});

function SubmitHarness({
  durationId,
  slotType,
  scheduledStart,
  onCreated,
}: {
  durationId: string | null;
  slotType: 'instant' | 'scheduled';
  scheduledStart?: string | null;
  onCreated?: (id: string) => void;
}) {
  const submission = useBookingSubmission({
    slotType,
    durationId,
    ...(scheduledStart === undefined ? {} : { scheduledStart }),
  });

  return (
    <>
      <Text testID="can-submit">{String(submission.canSubmit)}</Text>
      <Text
        testID="submit"
        onPress={() => {
          void submission.submit().then((created) => onCreated?.(created.booking.booking.id));
        }}
      >
        submit
      </Text>
    </>
  );
}

const CREATED = {
  booking: {
    id: 'booking-1',
    status: 'created',
    slotType: 'instant',
    scheduledStart: null,
    durationMinutes: 60,
    price: {
      amountPaise: 13545,
      durationMinutes: 60,
      serviceAmountPaise: 12900,
      taxRateBps: 500,
      taxAmountPaise: 645,
      totalAmountPaise: 13545,
      currency: 'INR',
      pricingVersion: 'pricing-policy-v0',
    },
    holdExpiresAt: '2026-08-18T12:10:00.000Z',
  },
};

describe('useBookingSubmission — create', () => {
  it('sends an Idempotency-Key scoped to the selection', async () => {
    const { calls, api } = recordingApi({
      'GET /v1/me/addresses': DEFAULT_API_STUBS['GET /v1/me/addresses']!,
      'POST /v1/bookings/quote': () => quoteFor(13545),
      'POST /v1/bookings': () => CREATED,
    });

    const created: string[] = [];
    const { getByTestId } = renderWithRuntime(
      <SubmitHarness slotType="instant" durationId="dur-60" onCreated={(id) => created.push(id)} />,
      { runtime: createTestRuntime({ api }) },
    );

    await waitFor(() => expect(getByTestId('can-submit')).toHaveTextContent('true'));
    fireEvent.press(getByTestId('submit'));
    await waitFor(() => expect(created).toEqual(['booking-1']));

    const create = calls.find((call) => call.key === 'POST /v1/bookings');
    expect(create?.body).toEqual({
      addressId: 'addr-1',
      slotType: 'instant',
      durationMinutes: 60,
    });
    // A booking that is retried must not become two bookings.
    expect(create?.headers?.['Idempotency-Key']).toEqual(expect.any(String));
  });

  it('sends the server-supplied start for a scheduled booking', async () => {
    // The slot id IS the instant the server offered. It is echoed back verbatim — the client
    // does not re-derive, re-parse or round-trip it through a local timezone.
    const start = '2026-08-19T07:30:00.000Z';
    const { calls, api } = recordingApi({
      'GET /v1/me/addresses': DEFAULT_API_STUBS['GET /v1/me/addresses']!,
      'POST /v1/bookings/quote': () => ({
        ...quoteFor(13545),
        slotType: 'scheduled',
        scheduledStart: start,
      }),
      'POST /v1/bookings': () => CREATED,
    });

    const created: string[] = [];
    const { getByTestId } = renderWithRuntime(
      <SubmitHarness
        slotType="scheduled"
        durationId="dur-60"
        scheduledStart={start}
        onCreated={(id) => created.push(id)}
      />,
      { runtime: createTestRuntime({ api }) },
    );

    await waitFor(() => expect(getByTestId('can-submit')).toHaveTextContent('true'));
    fireEvent.press(getByTestId('submit'));
    await waitFor(() => expect(created).toEqual(['booking-1']));

    expect(calls.find((call) => call.key === 'POST /v1/bookings')?.body).toEqual({
      addressId: 'addr-1',
      slotType: 'scheduled',
      durationMinutes: 60,
      scheduledStart: start,
    });
  });

  it('refuses to submit a scheduled booking with no chosen start', async () => {
    // Fail closed: without a server-offered start there is nothing to book, and the client will
    // not pick an instant on the customer's behalf.
    const { api } = recordingApi({
      'GET /v1/me/addresses': DEFAULT_API_STUBS['GET /v1/me/addresses']!,
    });

    const { getByTestId } = renderWithRuntime(
      <SubmitHarness slotType="scheduled" durationId="dur-60" scheduledStart={null} />,
      { runtime: createTestRuntime({ api }) },
    );

    await waitFor(() => expect(getByTestId('can-submit')).toHaveTextContent('false'));
  });
});

describe('useInstantData', () => {
  function InstantHarness({ durationId }: { durationId: string | null }) {
    const instant = useInstantData({ durationId });
    if (instant.state.status !== 'ready') return <Text testID="cta">pending</Text>;
    const view = instant.state.data;
    return (
      <>
        <Text testID="cta">{view.ctaLabel}</Text>
        <Text testID="eta">{view.etaLabel}</Text>
        <Text testID="blocked">{view.unavailable?.icon ?? 'none'}</Text>
        <Text testID="blocked-message">{view.unavailable?.message ?? ''}</Text>
      </>
    );
  }

  const BASE_STUBS: StubHandlers = {
    'GET /v1/catalogue': DEFAULT_API_STUBS['GET /v1/catalogue']!,
    'GET /v1/me/addresses': DEFAULT_API_STUBS['GET /v1/me/addresses']!,
  };

  it('takes the CTA amount from the quote total, never from the catalogue', async () => {
    const { api } = recordingApi({
      ...BASE_STUBS,
      'GET /v1/availability/instant': () => ({
        available: true,
        arrivalTargetMinutes: 22,
        validUntil: '2026-08-18T12:00:00.000Z',
      }),
      // A total that is deliberately NOT service + 5%: if the client recomputed the tax it would
      // render 135.45 and this assertion would catch it.
      'POST /v1/bookings/quote': () => quoteFor(19900),
    });

    const { getByTestId } = renderWithRuntime(<InstantHarness durationId="dur-60" />, {
      runtime: createTestRuntime({ api }),
    });

    await waitFor(() => expect(getByTestId('cta')).toHaveTextContent('Book NOW • ₹199'));
    // With no candidate to estimate from, the promise is the fallback and the row still shows it.
    expect(getByTestId('eta')).toHaveTextContent('22 mins');
  });

  it('prices the Instant tiles from the Instant price when the catalogue sends one', async () => {
    function TileHarness() {
      const instant = useInstantData({ durationId: null });
      if (instant.state.status !== 'ready') return <Text testID="tiles">pending</Text>;
      return (
        <Text testID="tiles">
          {instant.state.data.durations.map((tile) => `${tile.id}=${tile.price}`).join(',')}
        </Text>
      );
    }
    const { api } = recordingApi({
      ...BASE_STUBS,
      'GET /v1/catalogue': (request) => {
        const published = DEFAULT_API_STUBS['GET /v1/catalogue']!(request) as {
          durations: { durationMinutes: number }[];
        };
        return {
          ...published,
          durations: published.durations.map((duration) =>
            duration.durationMinutes === 60
              ? {
                  ...duration,
                  bySlotType: {
                    instant: {
                      serviceAmountPaise: 14900,
                      taxAmountPaise: 745,
                      totalAmountPaise: 15645,
                    },
                    scheduled: {
                      serviceAmountPaise: 9900,
                      taxAmountPaise: 495,
                      totalAmountPaise: 10395,
                    },
                  },
                }
              : duration,
          ),
        };
      },
      'GET /v1/availability/instant': () => ({
        available: true,
        arrivalTargetMinutes: 22,
        validUntil: '2026-08-18T12:00:00.000Z',
      }),
    });

    const { getByTestId } = renderWithRuntime(<TileHarness />, {
      runtime: createTestRuntime({ api }),
    });

    // 60 min is ₹149 for Instant (not the ₹99 Scheduled price); 30 min has no per-type price and
    // keeps the published ₹69.
    await waitFor(() => expect(getByTestId('tiles')).toHaveTextContent('dur-30=₹69,dur-60=₹149'));
  });

  /**
   * The sheet states the REAL estimate, the same source Home reads.
   *
   * It read `arrivalTargetMinutes` -- the operating promise, which the backend locks to one figure
   * for every customer and every address -- so the row showed a fixed number beside a price and a
   * duration that are both specific to the booking being made. `projectedArrival.etaMinutes` is
   * the server's per-address estimate, and it was being dropped because nothing declared it.
   *
   * The stubs disagree deliberately: estimate 15, promise 30.
   */
  it('states the arrival estimate the server computed, not the fixed promise', async () => {
    const { api } = recordingApi({
      ...BASE_STUBS,
      'GET /v1/availability/instant': () => ({
        available: true,
        arrivalTargetMinutes: 30,
        projectedArrival: { etaMinutes: 15 },
        validUntil: '2026-08-18T12:00:00.000Z',
      }),
      'POST /v1/bookings/quote': () => quoteFor(13545),
    });

    const { getByTestId } = renderWithRuntime(<InstantHarness durationId="dur-60" />, {
      runtime: createTestRuntime({ api }),
    });

    await waitFor(() => expect(getByTestId('eta')).toHaveTextContent('15 mins'));
  });

  it('shows the out-of-shift state, with the hub opening time, for OUTSIDE_OPERATING_HOURS', async () => {
    // R-INST-13: Instant's own code. The hub's hours come from the catalogue read for the address.
    const { calls, api } = recordingApi({
      ...BASE_STUBS,
      'GET /v1/availability/instant': () => ({
        available: false,
        arrivalTargetMinutes: 30,
        reason: 'OUTSIDE_OPERATING_HOURS',
        validUntil: '2026-08-18T12:00:00.000Z',
      }),
      'POST /v1/bookings/quote': () => quoteFor(13545),
    });

    const { getByTestId } = renderWithRuntime(<InstantHarness durationId="dur-60" />, {
      runtime: createTestRuntime({ api }),
    });

    await waitFor(() => expect(getByTestId('blocked')).toHaveTextContent('moon'));
    expect(getByTestId('blocked-message')).toHaveTextContent(
      /^Slots open at 5 AM (today|tomorrow)$/,
    );
    expect(calls.some((call) => call.key.startsWith('GET /v1/catalogue?addressId='))).toBe(true);
  });

  it('no longer treats OUTSIDE_OPERATING_WINDOW, which Instant never sends, as closed', async () => {
    const { api } = recordingApi({
      ...BASE_STUBS,
      'GET /v1/availability/instant': () => ({
        available: false,
        arrivalTargetMinutes: 30,
        reason: 'OUTSIDE_OPERATING_WINDOW',
        validUntil: '2026-08-18T12:00:00.000Z',
      }),
      'POST /v1/bookings/quote': () => quoteFor(13545),
    });

    const { getByTestId } = renderWithRuntime(<InstantHarness durationId="dur-60" />, {
      runtime: createTestRuntime({ api }),
    });

    await waitFor(() => expect(getByTestId('blocked')).toHaveTextContent('calendar'));
  });

  it('falls back to the no-slots state for any other refusal', async () => {
    // The reason vocabulary is open. An unseen reason must degrade to a designed state, never
    // crash and never be re-interpreted as "available".
    const { api } = recordingApi({
      ...BASE_STUBS,
      'GET /v1/availability/instant': () => ({
        available: false,
        arrivalTargetMinutes: 30,
        reason: 'SOME_REASON_SHIPPED_AFTER_THIS_RELEASE',
        validUntil: '2026-08-18T12:00:00.000Z',
      }),
      'POST /v1/bookings/quote': () => quoteFor(13545),
    });

    const { getByTestId } = renderWithRuntime(<InstantHarness durationId="dur-60" />, {
      runtime: createTestRuntime({ api }),
    });

    await waitFor(() => expect(getByTestId('blocked')).toHaveTextContent('calendar'));
  });

  it('does not claim availability before the server has answered', async () => {
    // No duration selected -> no availability question -> the sheet must not render a blocked
    // state OR assert that a cook is available.
    const { calls, api } = recordingApi(BASE_STUBS);

    const { getByTestId } = renderWithRuntime(<InstantHarness durationId={null} />, {
      runtime: createTestRuntime({ api }),
    });

    await waitFor(() => expect(getByTestId('blocked')).toHaveTextContent('none'));
    expect(calls.some((call) => call.key === 'GET /v1/availability/instant')).toBe(false);
  });
});
