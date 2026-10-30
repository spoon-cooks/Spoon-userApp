import { screen, within } from '@testing-library/react-native';

import {
  DEFAULT_API_STUBS,
  createStubApi,
  createTestRuntime,
  renderWithRuntime,
} from '@/test/renderWithRuntime';
import type { StubHandlers } from '@/test/renderWithRuntime';

import { BookingDetailScreen } from './screens/BookingDetailScreen';

/**
 * The booking lifecycle, driven by REAL `GET /v1/bookings/:id` payloads.
 *
 * ## Why this file exists
 *
 * Every other lifecycle test renders a fixture view model directly. That proves the presentation
 * is right and proves nothing at all about the pipeline in front of it — which is exactly where
 * the defect was. `DEV_BASE_FOR_STATUS` was keyed by VIEW names (`enRoute`, `arrived`,
 * `completion`) and indexed by BACKEND statuses (`cook_en_route`, `cook_arrived`, `completed`),
 * so every lookup missed, every real booking fell back to the confirmation copy, and the host
 * then rendered its generic "This booking is being updated" fallback because that copy carries
 * none of the sub-models the live views need.
 *
 * A presentational test cannot see any of that. So these mount the REAL screen over the REAL
 * hooks and a stub transport, and assert on what a customer would see for each backend status.
 *
 * The payloads below are the contract's shape — `bookingDetailSchema` parses every one of them,
 * so a field renamed server-side fails here rather than silently rendering an empty screen.
 */

const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const COOK_ID = '22222222-2222-4222-8222-222222222222';

const PRICE = {
  amountPaise: 13545,
  durationMinutes: 60,
  serviceAmountPaise: 12900,
  taxRateBps: 500,
  taxAmountPaise: 645,
  totalAmountPaise: 13545,
  currency: 'INR' as const,
  pricingVersion: 'pricing-policy-v0',
};

const ADDRESS = {
  label: 'Home',
  latitude: 12.902429,
  longitude: 77.649321,
  flat: 'E102',
  tower: null,
  society: 'Purva Skydale',
  street: 'Silver County Road',
  pincode: '560102',
  city: 'Bengaluru',
  state: 'Karnataka',
  hubName: 'Bengaluru Hub',
  receiverName: null,
  receiverPhone: null,
};

const ALLOWED = {
  canCancel: false,
  canReschedule: false,
  canExtend: false,
  canRate: false,
  canTip: false,
  canCallCook: false,
};

function bookingDto(overrides: {
  status: string;
  cook?: unknown;
  timing?: Record<string, unknown>;
  allowedActions?: Partial<typeof ALLOWED>;
  reassignment?: unknown;
  recovery?: unknown;
  cancellation?: unknown;
  /** What the booking already carries — see `bookingRatingSchema`. */
  ratingStars?: number;
  ratingExceptional?: boolean;
  ratingFeedback?: string;
}): Record<string, unknown> {
  return {
    id: BOOKING_ID,
    status: overrides.status,
    slotType: 'scheduled',
    scheduledStart: '2026-08-20T06:30:00.000Z',
    durationMinutes: 60,
    price: PRICE,
    holdExpiresAt: null,
    ...(overrides.ratingStars === undefined ? {} : { ratingStars: overrides.ratingStars }),
    ...(overrides.ratingExceptional === undefined
      ? {}
      : { ratingExceptional: overrides.ratingExceptional }),
    ...(overrides.ratingFeedback === undefined ? {} : { ratingFeedback: overrides.ratingFeedback }),
    address: ADDRESS,
    mealNotes: null,
    referenceUrl: null,
    mealBrief: null,
    cook:
      overrides.cook === undefined
        ? { id: COOK_ID, name: 'Meera', phone: null, rating: null, photoUrl: null }
        : overrides.cook,
    timing: {
      arrivedAt: null,
      actualStart: null,
      expectedEnd: null,
      actualEnd: null,
      ...overrides.timing,
    },
    reassignment: overrides.reassignment ?? {
      occurred: false,
      sequence: 0,
      reassignedAt: null,
    },
    recovery: overrides.recovery,
    cancellation: overrides.cancellation ?? null,
    allowedActions: { ...ALLOWED, ...overrides.allowedActions },
  };
}

function trackingDto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    bookingId: BOOKING_ID,
    status: 'cook_en_route',
    /**
     * RELATIVE, not the captured instant. The travelling banners count the ETA down now, so a
     * cook who is still en route has to have an ETA that is still ahead — a frozen 2026-08-20
     * instant is in the past on every later run, and the banner correctly degrades to
     * "arrival time is not available yet", taking the on-time/late copy with it.
     */
    eta: {
      estimatedArrivalAt: new Date(Date.now() + 16 * 60_000).toISOString(),
      updatedAt: new Date(Date.now() - 60_000).toISOString(),
    },
    movement: {
      status: 'progress_observed',
      lastEvidenceAt: '2026-08-20T06:10:00.000Z',
      etaConfidence: 'usable',
    },
    arrivedAt: null,
    reassignment: { occurred: false, sequence: 0, reassignedAt: null },
    timingVerdict: 'ON_TIME',
    serviceOtp: { start: null, end: null },
    refreshAfterSeconds: 30,
    ...overrides,
  };
}

function renderBooking(handlers: StubHandlers) {
  return renderWithRuntime(<BookingDetailScreen bookingId={BOOKING_ID} onBack={jest.fn()} />, {
    runtime: createTestRuntime({
      api: createStubApi({
        ...DEFAULT_API_STUBS,
        [`GET /v1/bookings/${BOOKING_ID}`]: () => ({ booking: bookingDto({ status: 'created' }) }),
        ...handlers,
      }),
    }),
  });
}

/** The stub resolves on a microtask and React Query notifies on a zero-delay timer. */
async function settle(): Promise<void> {
  for (let pass = 0; pass < 6; pass += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('booking lifecycle from real DTOs', () => {
  it('renders 8a Confirmation for a created booking', async () => {
    renderBooking({
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({ booking: bookingDto({ status: 'created' }) }),
    });
    await settle();

    expect(screen.getByTestId('confirmation-banner')).toBeTruthy();
    expect(screen.queryByTestId('booking-unknown-view')).toBeNull();
  });

  it('renders 8a Confirmation for an assigned booking', async () => {
    renderBooking({
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({ booking: bookingDto({ status: 'assigned' }) }),
    });
    await settle();

    expect(screen.getByTestId('confirmation-banner')).toBeTruthy();
  });

  it('renders a support handoff as attention, not Confirmed', async () => {
    renderBooking({
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({
        booking: bookingDto({
          status: 'assigned',
          recovery: { state: 'support_handoff', openedAt: '2026-08-20T10:00:00.000Z' },
        }),
      }),
    });
    await settle();

    expect(screen.getByText('This booking needs attention')).toBeTruthy();
    expect(screen.queryByText('Booking confirmed!')).toBeNull();
  });

  /**
   * 8b `289:6607` — a reassignment BEFORE departure keeps the confirmation screen and adds the
   * `292:201` notice. Resolving it to the `reassigned` (en-route) view sent a booking with no
   * ETA to `TrackingBody`, which then had no sub-model to render and fell through to the
   * unknown-view fallback.
   */
  it('renders 8b Confirm reassign — confirmation plus the notice, not the en-route screen', async () => {
    renderBooking({
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({
        booking: bookingDto({
          status: 'assigned',
          reassignment: { occurred: true, sequence: 1, reassignedAt: '2026-08-20T05:00:00.000Z' },
        }),
      }),
    });
    await settle();

    expect(screen.getByTestId('confirmation-banner')).toBeTruthy();
    expect(screen.getByText('Apologies, we have assigned you another cook')).toBeTruthy();
    expect(screen.queryByTestId('booking-unknown-view')).toBeNull();
  });

  /** And the notice is DROPPED when the server reports no reassignment. */
  it('draws no reassignment notice for an ordinary confirmed booking', async () => {
    renderBooking({
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({ booking: bookingDto({ status: 'assigned' }) }),
    });
    await settle();

    expect(screen.queryByText('Apologies, we have assigned you another cook')).toBeNull();
  });

  it('renders 9a En route with the SERVER cook and the SERVER ETA', async () => {
    renderBooking({
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({
        booking: bookingDto({ status: 'cook_en_route' }),
      }),
      [`GET /v1/bookings/${BOOKING_ID}/tracking`]: () => trackingDto(),
    });
    await settle();

    expect(screen.getByTestId('tracking-banner')).toBeTruthy();
    expect(screen.queryByTestId('booking-unknown-view')).toBeNull();
    // The banner names the booking's OWN cook, not the frame's "Asha".
    expect(screen.getByText('Cook Meera is arriving in')).toBeTruthy();
  });

  /**
   * 9b `99:1413` — the LATE variant is selected by the backend's `timingVerdict`, never by
   * comparing an ETA to the device clock (the contract forbids exactly that).
   */
  it('switches to the late en-route copy on the backend timing verdict', async () => {
    renderBooking({
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({
        booking: bookingDto({ status: 'cook_en_route' }),
      }),
      [`GET /v1/bookings/${BOOKING_ID}/tracking`]: () => trackingDto({ timingVerdict: 'LATE' }),
    });
    await settle();

    expect(screen.getByText("We're sorry for the delay, the cook is running late")).toBeTruthy();
  });

  it('renders 10a Reassigned for an en-route booking whose assignment changed', async () => {
    renderBooking({
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({
        booking: bookingDto({
          status: 'cook_en_route',
          reassignment: { occurred: true, sequence: 1, reassignedAt: '2026-08-20T06:00:00.000Z' },
        }),
      }),
      [`GET /v1/bookings/${BOOKING_ID}/tracking`]: () =>
        trackingDto({
          reassignment: { occurred: true, sequence: 1, reassignedAt: '2026-08-20T06:00:00.000Z' },
        }),
    });
    await settle();

    expect(screen.getByTestId('tracking-banner')).toBeTruthy();
    expect(screen.getByText('Apologies, we have assigned you another cook')).toBeTruthy();
    expect(screen.queryByTestId('booking-unknown-view')).toBeNull();
  });

  /**
   * 11 `3:1658` — Arrived, with the persisted `timing.arrivedAt` and the server's Start OTP.
   *
   * The OTP assertions are the point: `111` is the frame's transcription and must never reach a
   * customer, because they read it out to a stranger at their door.
   */
  it('renders 11 Arrived from arrivedAt and shows the SERVER Start OTP', async () => {
    renderBooking({
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({
        booking: bookingDto({
          status: 'cook_arrived',
          timing: { arrivedAt: '2026-08-20T06:25:00.000Z' },
        }),
      }),
      [`GET /v1/bookings/${BOOKING_ID}/tracking`]: () =>
        trackingDto({
          status: 'cook_arrived',
          arrivedAt: '2026-08-20T06:25:00.000Z',
          eta: { estimatedArrivalAt: null, updatedAt: null },
          serviceOtp: { start: '482', end: null },
        }),
    });
    await settle();

    expect(screen.getByTestId('tracking-banner')).toBeTruthy();
    expect(screen.getByText('Cook has arrived at your location')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.queryByText('1')).toBeNull();
  });

  it('shows an EMPTY Start OTP panel when the server withholds the code', async () => {
    renderBooking({
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({
        booking: bookingDto({
          status: 'cook_arrived',
          timing: { arrivedAt: '2026-08-20T06:25:00.000Z' },
        }),
      }),
      [`GET /v1/bookings/${BOOKING_ID}/tracking`]: () =>
        trackingDto({
          status: 'cook_arrived',
          arrivedAt: '2026-08-20T06:25:00.000Z',
          eta: { estimatedArrivalAt: null, updatedAt: null },
          serviceOtp: { start: null, end: null },
        }),
    });
    await settle();

    // The designed panel is still drawn — title, caption, geometry — with no digits in it.
    expect(screen.getByTestId('arrived-handover-otp')).toBeTruthy();
    expect(screen.getByText('Start OTP')).toBeTruthy();
    // Never the fixture's `111`.
    expect(screen.queryByText('1')).toBeNull();
  });

  /**
   * 12a `101:1812` — the countdown target is `timing.expectedEnd` and nothing else.
   *
   * `scheduledStart + durationMinutes` is deliberately WRONG here: the booking below started
   * late, so the two differ by fifteen minutes and only one of them is the answer.
   */
  it('renders 12a In service and counts down to timing.expectedEnd', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-20T06:50:00.000Z'));

    renderBooking({
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({
        booking: bookingDto({
          status: 'cooking',
          timing: {
            arrivedAt: '2026-08-20T06:40:00.000Z',
            actualStart: '2026-08-20T06:45:00.000Z',
            // A LATE start: scheduledStart + 60 min would be 07:30, this is 07:45.
            expectedEnd: '2026-08-20T07:45:00.000Z',
          },
          allowedActions: { canExtend: true },
        }),
      }),
      [`GET /v1/bookings/${BOOKING_ID}/tracking`]: () =>
        trackingDto({
          status: 'cooking',
          eta: { estimatedArrivalAt: null, updatedAt: null },
          serviceOtp: { start: null, end: '907' },
        }),
    });

    await jest.advanceTimersByTimeAsync(50);

    expect(screen.getByTestId('in-service-body')).toBeTruthy();
    // 06:50 -> 07:45 is 55 minutes. Not 40, which is what `scheduledStart + duration` would give.
    expect(screen.getByText('55 mins')).toBeTruthy();
    expect(screen.getByText('9')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();

    jest.useRealTimers();
  });

  /**
   * 12a past its end — the state a customer sits in when nobody has ended the service.
   *
   * The countdown floored at zero, so this screen read "Time left to service end / 0 mins" for as
   * long as the session stayed open, identically at one minute over and at four hours over. Found
   * on a booking that had been `cooking` for hours; the extension it had bought was applied
   * correctly and the countdown still said nothing.
   */
  it('counts up past timing.expectedEnd rather than sitting on 0 mins', async () => {
    jest.useFakeTimers();
    // 3h 50m after the end below.
    jest.setSystemTime(new Date('2026-08-20T11:35:00.000Z'));

    renderBooking({
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({
        booking: bookingDto({
          status: 'cooking',
          timing: {
            arrivedAt: '2026-08-20T06:40:00.000Z',
            actualStart: '2026-08-20T06:45:00.000Z',
            expectedEnd: '2026-08-20T07:45:00.000Z',
          },
          allowedActions: { canExtend: true },
        }),
      }),
      [`GET /v1/bookings/${BOOKING_ID}/tracking`]: () =>
        trackingDto({
          status: 'cooking',
          eta: { estimatedArrivalAt: null, updatedAt: null },
          serviceOtp: { start: null, end: '907' },
        }),
    });

    await jest.advanceTimersByTimeAsync(50);

    expect(screen.getByTestId('in-service-body')).toBeTruthy();
    expect(screen.getByText('3h 50m')).toBeTruthy();
    expect(screen.getByText('Service time complete')).toBeTruthy();
    expect(screen.getByText('Running over by')).toBeTruthy();
    // The promise it can no longer keep is gone.
    expect(screen.queryByText('Time left to service end')).toBeNull();
    expect(screen.queryByText('0 mins')).toBeNull();

    jest.useRealTimers();
  });

  /**
   * The extension read is a question only a LIVE booking can answer.
   *
   * `allowedActions.canExtend` was parsed and read by nothing, so this screen asked for extension
   * options on mount for every booking it drew. A booking that is over cannot be extended, and the
   * server said so -- 409 `INVALID_BOOKING_STATE` on a completed one, 404 on one with no session.
   * Nothing broke, because the sheet falls back to the catalogue's published options, so the only
   * cost was a doomed round trip on every past booking and a log full of expected failures for a
   * real one to hide behind. Seen on a device, twice, in one session.
   */
  describe('extension options are asked for only where they can exist', () => {
    it('does not ask about extending a booking the server says cannot be extended', async () => {
      const asked = jest.fn(() => ({ options: [] }));

      renderBooking({
        [`GET /v1/bookings/${BOOKING_ID}`]: () => ({
          booking: bookingDto({ status: 'completed', allowedActions: { canExtend: false } }),
        }),
        [`GET /v1/bookings/${BOOKING_ID}/extension-options`]: asked,
      });

      await settle();

      expect(screen.getByTestId('completion-body')).toBeTruthy();
      expect(asked).not.toHaveBeenCalled();
    });

    it('still asks while the booking is live and the server allows it', async () => {
      const asked = jest.fn(() => ({ options: [] }));

      renderBooking({
        [`GET /v1/bookings/${BOOKING_ID}`]: () => ({
          booking: bookingDto({
            status: 'cooking',
            timing: {
              arrivedAt: '2026-08-20T06:40:00.000Z',
              actualStart: '2026-08-20T06:45:00.000Z',
              expectedEnd: '2026-08-20T07:45:00.000Z',
            },
            allowedActions: { canExtend: true },
          }),
        }),
        [`GET /v1/bookings/${BOOKING_ID}/extension-options`]: asked,
      });

      await settle();

      expect(asked).toHaveBeenCalled();
    });
  });

  it('renders 14a Completion, and 14b once the server says it may no longer be rated', async () => {
    const { unmount } = renderBooking({
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({
        booking: bookingDto({
          status: 'completed',
          timing: {
            actualStart: '2026-08-20T06:30:00.000Z',
            expectedEnd: '2026-08-20T07:30:00.000Z',
            actualEnd: '2026-08-20T07:28:00.000Z',
          },
          allowedActions: { canRate: true, canTip: true },
        }),
      }),
    });
    await settle();

    expect(screen.getByTestId('completion-body')).toBeTruthy();
    expect(screen.queryByTestId('booking-unknown-view')).toBeNull();
    // The headline names THIS booking, not the frame's "12th April • 1:15 PM • 1 hr".
    expect(screen.queryByText('12th April • 1:15 PM • 1 hr')).toBeNull();
    unmount();

    const { unmount: unmountRated } = renderBooking({
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({
        booking: bookingDto({
          status: 'completed',
          timing: {
            actualStart: '2026-08-20T06:30:00.000Z',
            expectedEnd: '2026-08-20T07:30:00.000Z',
            actualEnd: '2026-08-20T07:28:00.000Z',
          },
          allowedActions: { canRate: false, canTip: true },
        }),
      }),
    });
    await settle();

    /*
     * `canRate: false` means a RATING exists. It does not mean anything was written, and this
     * payload carries no feedback -- so the textarea is still offered and nobody is thanked for
     * words they never wrote. That untruth is what this assertion used to pin.
     */
    expect(screen.getByTestId('completion-feedback')).toBeTruthy();
    expect(screen.queryByText('Thanks for sharing your feedback!')).toBeNull();
    unmountRated();
  });

  /** The acknowledgement follows the server's OWN record of the words, nothing else. */
  it('acknowledges feedback only when the payload carries some', async () => {
    renderBooking({
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({
        booking: bookingDto({
          status: 'completed',
          timing: {
            actualStart: '2026-08-20T06:30:00.000Z',
            expectedEnd: '2026-08-20T07:30:00.000Z',
            actualEnd: '2026-08-20T07:28:00.000Z',
          },
          allowedActions: { canRate: false, canTip: true },
          ratingStars: 4.5,
          ratingFeedback: 'The dal was perfect.',
        }),
      }),
    });
    await settle();

    expect(screen.getByText('Thanks for sharing your feedback!')).toBeTruthy();
    /*
     * The thanks is the line ABOVE the box, and the box holds the words alone.
     *
     * Both lines used to be on screen together -- "We appreciate any feedback that helps us
     * improve!" as the heading, with "Thanks for sharing your feedback!" inside the box above the
     * sentence it was thanking them for. The card asked for feedback and acknowledged it at the
     * same time, about the same words.
     */
    expect(screen.queryByText('We appreciate any feedback that helps us improve!')).toBeNull();
    expect(screen.getByTestId('completion-feedback-text').props.children).toBe(
      'The dal was perfect.',
    );
    // And the rating drawn is the one recorded, not the `5+` chip.
    expect(screen.getByTestId('completion-rating-4.5')).toBeTruthy();
    expect(screen.queryByTestId('completion-rating-prompt')).toBeNull();
  });

  /** The other half: with nothing written, the card INVITES feedback and thanks nobody. */
  it('asks for feedback, and does not thank anyone, when none was written', async () => {
    renderBooking({
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({
        booking: bookingDto({
          status: 'completed',
          timing: {
            actualStart: '2026-08-20T06:30:00.000Z',
            expectedEnd: '2026-08-20T07:30:00.000Z',
            actualEnd: '2026-08-20T07:28:00.000Z',
          },
          allowedActions: { canRate: false, canTip: true },
          ratingStars: 4.5,
        }),
      }),
    });
    await settle();

    expect(screen.getByText('We appreciate any feedback that helps us improve!')).toBeTruthy();
    expect(screen.queryByText('Thanks for sharing your feedback!')).toBeNull();
    // The box is the writable one, so a customer who rated can still come back and say something.
    expect(screen.getByTestId('completion-feedback')).toBeTruthy();
  });

  /**
   * 8e `201:278` — the auto-cancelled surface, with the refund the SERVER recorded.
   *
   * `GET /v1/bookings/:id/refunds` is the only source of that figure: the booking detail's
   * `cancellation` block carries who cancelled and why, and no amount at all. The frame's ₹135
   * must not survive.
   */
  it('renders 8e Auto cancelled with the backend refund amount', async () => {
    renderBooking({
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({
        booking: bookingDto({
          status: 'cancelled',
          cancellation: {
            cancelledAt: '2026-08-20T05:00:00.000Z',
            cancelledBy: 'system',
            reasonCode: 'NO_COOK_AVAILABLE',
            reasonDetail: null,
          },
        }),
      }),
      [`GET /v1/bookings/${BOOKING_ID}/refunds`]: () => ({
        refunds: [
          {
            refundId: '33333333-3333-4333-8333-333333333333',
            bookingId: BOOKING_ID,
            reason: 'service_failure',
            amountPaise: 13545,
            currency: 'INR',
            state: 'provider_pending',
            requestedAt: '2026-08-20T05:00:05.000Z',
            completedAt: null,
          },
        ],
      }),
    });
    await settle();

    expect(screen.getByTestId('auto-cancelled-body')).toBeTruthy();
    expect(screen.getByText('₹135.45')).toBeTruthy();
    expect(screen.queryByText('₹135')).toBeNull();
  });

  /**
   * A CUSTOMER cancellation — `606:4895`, not `201:278`. That frame apologises for a
   * cancellation Spoon made; this one does not apologise for a decision the customer made
   * themselves, and names the refund the same way `201:278` does, from the SAME endpoint.
   */
  it('renders 8d Customer cancelled with the backend refund amount, no apology', async () => {
    renderBooking({
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({
        booking: bookingDto({
          status: 'cancelled',
          cancellation: {
            cancelledAt: '2026-08-20T05:00:00.000Z',
            cancelledBy: 'customer',
            reasonCode: 'URGENT_CHANGE',
            reasonDetail: null,
          },
        }),
      }),
      [`GET /v1/bookings/${BOOKING_ID}/refunds`]: () => ({
        refunds: [
          {
            refundId: '44444444-4444-4444-8444-444444444444',
            bookingId: BOOKING_ID,
            reason: 'customer_cancelled',
            amountPaise: 13545,
            currency: 'INR',
            state: 'provider_pending',
            requestedAt: '2026-08-20T05:00:05.000Z',
            completedAt: null,
          },
        ],
      }),
    });
    await settle();

    expect(screen.getByTestId('customer-cancelled-body')).toBeTruthy();
    expect(screen.getByText('₹135.45')).toBeTruthy();
    expect(screen.queryByText('We sincerely apologize for cancelling this booking')).toBeNull();
  });

  /**
   * An unpublished refund shows the em dash, exactly as `201:278` does — never a figure nobody
   * has stated, and never a frame-transcribed sample.
   */
  it('shows an em dash when the customer-cancellation refund has not been published yet', async () => {
    renderBooking({
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({
        booking: bookingDto({
          status: 'cancelled',
          cancellation: {
            cancelledAt: '2026-08-20T05:00:00.000Z',
            cancelledBy: 'customer',
            reasonCode: 'URGENT_CHANGE',
            reasonDetail: null,
          },
        }),
      }),
      [`GET /v1/bookings/${BOOKING_ID}/refunds`]: () => ({ refunds: [] }),
    });
    await settle();

    expect(screen.getByTestId('customer-cancelled-body')).toBeTruthy();
    // Scoped to the refund card specifically: a cancelled-before-start booking's End Time row
    // also shows "—", for its own, unrelated reason.
    expect(within(screen.getByTestId('customer-cancelled-refund')).getByText('—')).toBeTruthy();
  });

  /**
   * The polling contract: the SAME mounted screen follows the booking as the server moves it.
   *
   * `useBookingDetail(..., { poll: true })` is what makes the customer's screen advance from
   * "arriving" to "arrived" without them reopening the booking, and it is why the detail read is
   * polled at all.
   */
  it('transitions a mounted screen from en route to arrived on the next poll', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-20T06:20:00.000Z'));

    let arrived = false;
    renderBooking({
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({
        booking: arrived
          ? bookingDto({
              status: 'cook_arrived',
              timing: { arrivedAt: '2026-08-20T06:25:00.000Z' },
            })
          : bookingDto({ status: 'cook_en_route' }),
      }),
      [`GET /v1/bookings/${BOOKING_ID}/tracking`]: () =>
        arrived
          ? trackingDto({
              status: 'cook_arrived',
              arrivedAt: '2026-08-20T06:25:00.000Z',
              eta: { estimatedArrivalAt: null, updatedAt: null },
              serviceOtp: { start: '551', end: null },
            })
          : trackingDto(),
    });

    await jest.advanceTimersByTimeAsync(50);
    expect(screen.getByText('Cook Meera is arriving in')).toBeTruthy();

    arrived = true;
    // `LIVE_POLL_MS` is 30s for the detail; tracking follows the server's `refreshAfterSeconds`.
    await jest.advanceTimersByTimeAsync(31_000);
    await jest.advanceTimersByTimeAsync(31_000);

    expect(screen.getByText('Cook has arrived at your location')).toBeTruthy();
    expect(screen.queryByTestId('booking-unknown-view')).toBeNull();

    jest.useRealTimers();
  });
});
