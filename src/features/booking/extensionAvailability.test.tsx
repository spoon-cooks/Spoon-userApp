import { Text } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import {
  DEFAULT_API_STUBS,
  createStubApi,
  createTestRuntime,
  renderWithRuntime,
} from '@/test/renderWithRuntime';
import type { StubHandlers } from '@/test/renderWithRuntime';

import { DEMO_EXTENSION } from '@/demo/fixtures/booking';

import { ExtensionSheet } from './components/ExtensionSheet';
import { useExtensionData } from './data';
import type { ExtensionViewModel } from './types';

/**
 * An unavailable extension length is DRAWN, not dropped.
 *
 * `useExtensionData` used to take `(live ?? published)` — the per-booking read INSTEAD of the
 * catalogue's ladder. That read omits every length the assigned cook's schedule cannot absorb, so
 * a length that was merely unavailable right now disappeared from the sheet: a customer who could
 * buy 10 and 20 saw two tiles and no sign that 30 exists, and a service with no room at all lost
 * the whole row to the fallback block.
 *
 * `275:4265` draws a third tile state for this and `PriceTile` has always rendered it. These tests
 * pin the data half, because that is the half that was withholding the tiles.
 */

const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const COOK_ID = '22222222-2222-4222-8222-222222222222';

/** The published ladder — three lengths, whatever this particular cook can absorb. */
const LADDER = [
  { minutes: 10, pricePaise: 1500, taxAmountPaise: 75, totalAmountPaise: 1575 },
  { minutes: 20, pricePaise: 3500, taxAmountPaise: 175, totalAmountPaise: 3675 },
  { minutes: 30, pricePaise: 6900, taxAmountPaise: 345, totalAmountPaise: 7245 },
];

/** One entry of `GET /v1/bookings/:id/extension-options` — feasibility, priced for THIS service. */
function liveOption(minutes: number, pricePaise: number, totalAmountPaise: number) {
  return {
    minutes,
    pricePaise,
    taxAmountPaise: totalAmountPaise - pricePaise,
    taxRateBps: 500,
    totalAmountPaise,
    currency: 'INR' as const,
    pricingVersion: 'extension-pricing-owner-skus-v1',
    newExpectedEnd: '2026-08-20T08:00:00.000Z',
  };
}

function bookingDto(canExtend: boolean): Record<string, unknown> {
  return {
    id: BOOKING_ID,
    status: 'cooking',
    slotType: 'scheduled',
    scheduledStart: '2026-08-20T06:30:00.000Z',
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
    holdExpiresAt: null,
    address: {
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
    },
    mealNotes: null,
    referenceUrl: null,
    mealBrief: null,
    cook: { id: COOK_ID, name: 'Meera', phone: null, rating: null, photoUrl: null },
    timing: {
      arrivedAt: null,
      actualStart: '2026-08-20T06:32:00.000Z',
      expectedEnd: '2026-08-20T07:32:00.000Z',
      actualEnd: null,
    },
    reassignment: { occurred: false, sequence: 0, reassignedAt: null },
    recovery: undefined,
    cancellation: null,
    allowedActions: {
      canCancel: false,
      canReschedule: false,
      canExtend,
      canRate: false,
      canTip: false,
      canCallCook: false,
    },
  };
}

function catalogueWithLadder() {
  const base = DEFAULT_API_STUBS['GET /v1/catalogue']?.(undefined) as Record<string, unknown>;
  return {
    ...base,
    extension: {
      currency: 'INR',
      pricingVersion: 'extension-pricing-owner-skus-v1',
      taxRateBps: 500,
      options: LADDER,
    },
  };
}

/** Renders the hook's answer as one flat line, so a test asserts on what the sheet would draw. */
function Probe() {
  const { state } = useExtensionData({ bookingId: BOOKING_ID });
  if (state.status !== 'ready') return <Text testID="pending">pending</Text>;
  return (
    <>
      <Text testID="tiles">
        {state.data.options
          .map((option) => `${option.label}${option.disabled === true ? '[off]' : '[on]'}`)
          .join(' ')}
      </Text>
      <Text testID="default">{state.data.defaultOptionId ?? 'none'}</Text>
      <Text testID="cta">{state.data.ctaLabel}</Text>
    </>
  );
}

function renderWith(stubs: StubHandlers) {
  return renderWithRuntime(<Probe />, {
    runtime: createTestRuntime({
      api: createStubApi({ ...DEFAULT_API_STUBS, ...stubs }),
    }),
  });
}

describe('extension lengths the cook cannot absorb', () => {
  it('draws an unavailable length greyed rather than dropping it', async () => {
    renderWith({
      'GET /v1/catalogue': () => catalogueWithLadder(),
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({ booking: bookingDto(true) }),
      // The cook can absorb 10 and 20. 30 is the one that used to vanish.
      [`GET /v1/bookings/${BOOKING_ID}/extension-options`]: () => ({
        options: [liveOption(10, 1500, 1575), liveOption(20, 3500, 3675)],
      }),
    });

    await waitFor(() => {
      expect(screen.getByTestId('tiles')).toHaveTextContent('10 mins[on] 20 mins[on] 30 mins[off]');
    });
  });

  it('greys the WHOLE ladder when nothing is feasible, instead of losing the row', async () => {
    renderWith({
      'GET /v1/catalogue': () => catalogueWithLadder(),
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({ booking: bookingDto(true) }),
      // The server answered, and the answer was none.
      [`GET /v1/bookings/${BOOKING_ID}/extension-options`]: () => ({
        options: [],
        unavailableReason: 'COOK_UNAVAILABLE',
      }),
    });

    await waitFor(() => {
      expect(screen.getByTestId('tiles')).toHaveTextContent(
        '10 mins[off] 20 mins[off] 30 mins[off]',
      );
    });

    // Nothing is selectable, so the bar carries no figure and the CTA cannot fire.
    expect(screen.getByTestId('default')).toHaveTextContent('none');
    expect(screen.getByTestId('cta')).toHaveTextContent('Extend');
  });

  it('greys nothing while feasibility is UNKNOWN', async () => {
    renderWith({
      'GET /v1/catalogue': () => catalogueWithLadder(),
      // `canExtend: false` means the per-booking read never runs, so the client has been told
      // nothing about feasibility. Unknown is not "unavailable" and must not be drawn as it.
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({ booking: bookingDto(false) }),
    });

    await waitFor(() => {
      expect(screen.getByTestId('tiles')).toHaveTextContent('10 mins[on] 20 mins[on] 30 mins[on]');
    });
  });

  it('opens on a length that can actually be bought, not the drawn default', async () => {
    renderWith({
      'GET /v1/catalogue': () => catalogueWithLadder(),
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({ booking: bookingDto(true) }),
      // `143:381` draws 10 preselected, and 10 is exactly what this cook cannot absorb.
      [`GET /v1/bookings/${BOOKING_ID}/extension-options`]: () => ({
        options: [liveOption(20, 3500, 3675), liveOption(30, 6900, 7245)],
      }),
    });

    await waitFor(() => {
      expect(screen.getByTestId('tiles')).toHaveTextContent('10 mins[off] 20 mins[on] 30 mins[on]');
    });

    // Preselecting the disabled 10 would put a price on the bar for a length the server has
    // already refused, one tap from a `POST /extensions` it would reject.
    expect(screen.getByTestId('default')).toHaveTextContent('ext-20');
    expect(screen.getByTestId('cta')).toHaveTextContent('Extend • ₹36.75');
  });

  it('prices a tile from the per-booking read where it has one', async () => {
    renderWith({
      'GET /v1/catalogue': () => catalogueWithLadder(),
      [`GET /v1/bookings/${BOOKING_ID}`]: () => ({ booking: bookingDto(true) }),
      // This service is priced differently from the published ladder's 1500.
      [`GET /v1/bookings/${BOOKING_ID}/extension-options`]: () => ({
        options: [liveOption(10, 1900, 1995)],
      }),
    });

    await waitFor(() => {
      expect(screen.getByTestId('cta')).toHaveTextContent('Extend • ₹19.95');
    });
  });
});

/**
 * The sheet itself needed no change — `PriceTile` has always drawn the third state and refused
 * the press. These pin that, so the greying cannot regress into a decorative fill that is still
 * tappable, which would put a length the server refused one tap from `POST /extensions`.
 */
describe('the sheet draws an unavailable length as unbuyable', () => {
  const MODEL: ExtensionViewModel = {
    ...DEMO_EXTENSION,
    options: [
      { id: 'ext-10', label: '10 mins', price: '₹15' },
      { id: 'ext-20', label: '20 mins', price: '₹35' },
      { id: 'ext-30', label: '30 mins', price: '₹69', disabled: true },
    ],
  };

  const actions = { onSelectOption: jest.fn(), onClose: jest.fn(), onBookAnother: jest.fn() };

  it('marks the unavailable tile disabled and refuses the press', () => {
    render(
      <ExtensionSheet
        visible
        extension={MODEL}
        selectedOptionId="ext-10"
        {...actions}
        onExtend={jest.fn()}
      />,
    );

    const unavailable = screen.getByTestId('extension-option-ext-30');
    expect(unavailable.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(unavailable);
    expect(actions.onSelectOption).not.toHaveBeenCalled();

    // The buyable ones are untouched.
    fireEvent.press(screen.getByTestId('extension-option-ext-20'));
    expect(actions.onSelectOption).toHaveBeenCalledWith('ext-20');
  });

  it('leaves the pay button inert when nothing is selected', () => {
    render(
      <ExtensionSheet
        visible
        extension={MODEL}
        selectedOptionId={null}
        {...actions}
        onExtend={jest.fn()}
      />,
    );

    expect(screen.getByTestId('extension-submit').props.accessibilityState.disabled).toBe(true);
  });
});
