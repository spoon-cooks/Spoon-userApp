import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import {
  DEFAULT_API_STUBS,
  createStubApi,
  createTestRuntime,
  renderWithRuntime,
} from '@/test/renderWithRuntime';

/**
 * The map step (`53:31`), as an interaction contract — task §26.
 *
 * ## The rule every test here defends
 *
 *   SELECTING a point is LOCAL.   CONFIRMING it is the only thing that asks the server.
 *
 * The screen used to run `POST /v1/serviceability/check` on every point it acquired — the device
 * fix on mount, a map tap, a moved pin, a chosen search result — and an `outside_service_area`
 * answer navigated the customer to `215:1472` from an effect. Two things fell out of that, and
 * both are asserted against below:
 *
 *   - exploring the map cost one request per gesture, so a customer comparing two sides of a road
 *     paid for it twice and the server was asked to rule on points nobody had chosen;
 *   - touching the wrong spot EJECTED them from the screen, which is why §5 opens with "that must
 *     stop".
 *
 * ## How a point is chosen now
 *
 * The pin is FIXED to the middle of the canvas and the customer drags the map beneath it, Rapido
 * style. So the coordinate comes from `onRegionChangeComplete` — the map coming to rest — and
 * never from a marker drop or from wherever a finger happened to land.
 *
 * The stub API rejects anything it was not given a handler for, so a serviceability call made at
 * the wrong moment fails the test loudly rather than passing silently.
 */

import AddressLocationRoute from '@/app/(app)/address/location';

let mockRouter: {
  push: jest.Mock;
  back: jest.Mock;
  replace: jest.Mock;
  dismissAll: jest.Mock;
  canGoBack: jest.Mock;
  canDismiss: jest.Mock;
};
let mockSearchParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockSearchParams,
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(effect, [effect]);
  },
  Redirect: () => null,
  Stack: () => null,
}));

/**
 * A granted permission with a real fix, so the map DRAWS.
 *
 * The global setup mocks `expo-location` to its "refused" answer, which is the honest state of a
 * test runner — but it means no point is ever acquired and no map is rendered. These tests are
 * about what happens ON the map, so this file grants it. Nothing else about the mock changes:
 * `reverseGeocodeAsync` still returns nothing, which exercises the fallback path.
 */
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  hasServicesEnabledAsync: jest.fn(async () => true),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 12.9027, longitude: 77.6488, accuracy: 12 },
  })),
  reverseGeocodeAsync: jest.fn(async () => []),
}));

/** Every serviceability POST this file's stub sees, so a call at the wrong moment is visible. */
let checks: unknown[] = [];
/** What the next check answers. Reassigned per test. */
let verdict: { status: string } | (() => never) = { status: 'serviceable' };

function render() {
  const api = createStubApi({
    ...DEFAULT_API_STUBS,
    'POST /v1/serviceability/check': (body) => {
      checks.push(body);
      if (typeof verdict === 'function') return verdict();
      return verdict;
    },
  });

  return renderWithRuntime(<AddressLocationRoute />, {
    runtime: createTestRuntime({ api }),
  });
}

beforeEach(() => {
  mockRouter = {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    dismissAll: jest.fn(),
    canGoBack: jest.fn(() => true),
    canDismiss: jest.fn(() => true),
  };
  mockSearchParams = {};
  checks = [];
  verdict = { status: 'serviceable' };
});

/** The map, once the device fix has produced a point to centre it on and its address resolved. */
async function pin() {
  await screen.findByTestId('address-map-canvas');
  await resolved();
  return screen.getByTestId('address-map-pin');
}

/**
 * Confirm waits for the address under the pin to resolve (dev note `2075:11925`), so a press is
 * only meaningful once the geocode for the latest settle has answered.
 */
async function resolved() {
  await waitFor(() => expect(screen.getByTestId('address-confirm')).not.toBeDisabled());
}

/**
 * The map coming to REST with `latitude` / `longitude` under the fixed pin — the one and only way
 * a coordinate is now taken off the map.
 */
function settleAt(latitude: number, longitude: number) {
  fireEvent(
    screen.getByTestId('address-map-canvas'),
    'regionChangeComplete',
    { latitude, longitude, latitudeDelta: 0.006, longitudeDelta: 0.006 },
    { isGesture: true },
  );
}

/** Where the device fix puts the customer in this file. */
const DEVICE_POINT = { latitude: 12.9027, longitude: 77.6488 };

describe('selecting a point is local', () => {
  /**
   * §6 — arriving at the screen acquires a fix, and that is ALL it does. The verdict belongs to a
   * point the customer has chosen, and on mount they have chosen nothing.
   */
  it('asks the server nothing while acquiring the device fix', async () => {
    render();
    await pin();

    expect(checks).toHaveLength(0);
  });

  /**
   * §4 — the map settling reports a coordinate, and nothing else happens.
   *
   * The pan itself is the SDK's: it moves the ground natively for the whole gesture, which is why
   * only the SETTLE is wired. What this asserts is the consequence — panning updates the selection
   * and does not spend a request, so dragging the map across a city is free.
   */
  it('the map settling moves the selection without a serviceability call', async () => {
    render();
    await pin();

    settleAt(12.95, 77.61);

    await waitFor(() => {
      expect(screen.getByTestId('address-map-pin')).toBeTruthy();
    });
    expect(checks).toHaveLength(0);
    // §5 — a selection that changed must not navigate anywhere, for any reason.
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  /** Ten pans in a row are still zero requests: the cost of exploring is not per gesture. */
  it('repeated settles never accumulate serviceability calls', async () => {
    render();
    await pin();

    for (let step = 0; step < 10; step += 1) {
      settleAt(12.9 + step / 100, 77.6);
    }

    expect(checks).toHaveLength(0);
  });

  /**
   * The defect this locks out: a tap used to drop the pin wherever the finger landed, so a customer
   * who touched the map to start a pan watched the pin jump somewhere they had not chosen.
   *
   * The map now carries no press handler at all, and the pin's overlay is transparent to touches so
   * a gesture that begins on it still reaches the map underneath. Confirm proves the consequence:
   * after a tap, the selected point is still the one the screen opened on.
   */
  it('a tap on the canvas cannot move the selection', async () => {
    render();
    await pin();

    expect(screen.getByTestId('address-map-pin').props.pointerEvents).toBe('none');
    expect(screen.getByTestId('address-map-canvas').props.onPress).toBeUndefined();

    fireEvent(screen.getByTestId('address-map-canvas'), 'press', {
      nativeEvent: { coordinate: { latitude: 12.88, longitude: 77.59 } },
    });

    expect(checks).toHaveLength(0);
    expect(mockRouter.push).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('address-confirm'));
    await waitFor(() => expect(checks).toHaveLength(1));
    expect(checks[0]).toEqual(DEVICE_POINT);
  });

  /** §6 — choosing a Places prediction is a selection like any other. */
  it('choosing a search result does not navigate or check serviceability', async () => {
    render();
    await pin();

    // No Maps key in the test build, so Places reports `unconfigured` — the designed state for a
    // build without one. What matters here is that typing costs no serviceability request.
    fireEvent.press(screen.getByTestId('address-map-screen-search'));
    fireEvent.changeText(
      await screen.findByTestId('address-map-screen-search-layer-input'),
      'Koramangala',
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(checks).toHaveLength(0);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});

describe('confirm is the only thing that asks the server', () => {
  it('calls serviceability ONCE and moves on when the point is serviceable', async () => {
    render();
    await pin();

    fireEvent.press(screen.getByTestId('address-confirm'));

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/address/details');
    });
    expect(checks).toHaveLength(1);
    // The coordinates sent are the ones the pin is on — never a remembered or defaulted point.
    expect(checks[0]).toEqual({ latitude: 12.9027, longitude: 77.6488 });
  });

  /**
   * An EDIT that walked back to the map and forward again is still the SAME address (task §5,
   * §28). `addressId` rides through both hops, so Save on `60:655` remains a `PUT` on the record
   * the customer opened rather than a `POST` that would leave them holding two.
   */
  it('carries an address id straight through to the form', async () => {
    mockSearchParams = { addressId: 'addr-1' };
    render();
    await pin();

    fireEvent.press(screen.getByTestId('address-confirm'));

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/address/details?addressId=addr-1');
    });
  });

  it('opens an Edit on the address’s saved pin, not wherever the phone is', async () => {
    mockSearchParams = { addressId: 'addr-1' };
    render();
    await pin();
    // addr-1 is saved at 12.902746, 77.648817; the device fix is 12.9027, 77.6488.
    await waitFor(() => {
      fireEvent.press(screen.getByTestId('address-confirm'));
      expect(checks.at(-1)).toEqual({ latitude: 12.902746, longitude: 77.648817 });
    });
  });

  /** The first-run flow carries its own context the same way, and ends at Home rather than 18. */
  it('carries the onboarding flag straight through to the form', async () => {
    mockSearchParams = { onboarding: '1' };
    render();
    await pin();

    fireEvent.press(screen.getByTestId('address-confirm'));

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/address/details?onboarding=1');
    });
  });

  /**
   * `68:214`'s own entry-point tag rides through the same way `addressId` and `onboarding` do, so
   * the form's eventual SAVE can still return the customer to the list's correct destination —
   * see "Saved addresses back target follows its entry point" in `navigation.test.tsx`.
   */
  it('carries the saved-address list entry point straight through to the form', async () => {
    mockSearchParams = { from: 'home' };
    render();
    await pin();

    fireEvent.press(screen.getByTestId('address-confirm'));

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/address/details?from=home');
    });
  });

  /**
   * `resume=1` marks this visit as a "Change area" digression from an already-open Details
   * screen (`address/details.tsx`), which is still sitting right underneath. Popping back to it
   * is what returns the customer to the exact screen — with whatever they had already typed —
   * that "Change area" was pressed from; pushing a second, blank Details would both lose that
   * and leave a stray screen behind it.
   */
  it('pops back to an open Details screen after a "Change area" digression, instead of pushing a new one', async () => {
    mockSearchParams = { resume: '1', addressId: 'addr-1' };
    render();
    await pin();

    fireEvent.press(screen.getByTestId('address-confirm'));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('sends the coordinate the map SETTLED on, not the one the screen opened on', async () => {
    render();
    await pin();

    settleAt(13.0101, 77.5502);
    await resolved();
    fireEvent.press(screen.getByTestId('address-confirm'));

    await waitFor(() => expect(checks).toHaveLength(1));
    expect(checks[0]).toEqual({ latitude: 13.0101, longitude: 77.5502 });
  });

  /**
   * The LAST settle wins, and a press before its address has resolved does nothing.
   *
   * `confirm` reads the point from a ref rather than from render state, and the route writes the
   * draft from the outcome rather than from its own closure — so the previous point can never be
   * checked or saved. Confirm itself waits for the new point's address (dev note `2075:11925`).
   */
  it('confirms the last point the map settled on, and not before it resolves', async () => {
    render();
    await pin();

    settleAt(12.95, 77.61);
    settleAt(13.0101, 77.5502);
    fireEvent.press(screen.getByTestId('address-confirm'));
    expect(checks).toHaveLength(0);

    await resolved();
    fireEvent.press(screen.getByTestId('address-confirm'));

    await waitFor(() => expect(checks).toHaveLength(1));
    expect(checks[0]).toEqual({ latitude: 13.0101, longitude: 77.5502 });
  });

  /** §7 — a double press must not become two bookings' worth of requests. */
  it('refuses a second press while the first check is in flight', async () => {
    render();
    await pin();

    const confirm = screen.getByTestId('address-confirm');
    fireEvent.press(confirm);
    fireEvent.press(confirm);
    fireEvent.press(confirm);

    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
    expect(checks).toHaveLength(1);
  });

  /**
   * §5 / §8 — `outside_service_area` is the ONLY verdict that opens `215:1472`, and it is PUSHED
   * so the map survives underneath and "Choose another location" returns to the same pin.
   */
  it('pushes the out-of-service screen when the server refuses the area', async () => {
    verdict = { status: 'outside_service_area' };
    render();
    await pin();

    fireEvent.press(screen.getByTestId('address-confirm'));

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/address/out-of-service');
    });
    // Replacing would unmount the map, so returning would re-locate from scratch and lose the pin.
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(checks).toHaveLength(1);
  });

  it('carries the onboarding flag onto the out-of-service screen', async () => {
    verdict = { status: 'outside_service_area' };
    mockSearchParams = { onboarding: '1' };
    render();
    await pin();

    fireEvent.press(screen.getByTestId('address-confirm'));

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/address/out-of-service?onboarding=1');
    });
  });

  it('carries the saved-address list entry point onto the out-of-service screen', async () => {
    verdict = { status: 'outside_service_area' };
    mockSearchParams = { from: 'home' };
    render();
    await pin();

    fireEvent.press(screen.getByTestId('address-confirm'));

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/address/out-of-service?from=home');
    });
  });

  /**
   * "Not right now" is not "not here". A temporary outage stays INLINE — sending it to a
   * coming-soon screen would tell the customer something false about where they live.
   */
  it('keeps a temporary refusal on the map, with no navigation', async () => {
    verdict = { status: 'temporarily_unavailable' };
    render();
    await pin();

    fireEvent.press(screen.getByTestId('address-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('address-message')).toBeTruthy();
    });
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  /**
   * §7 — a network failure is not a verdict. The customer keeps their map, their pin and their
   * resolved row, and gets a message that names the only useful next action.
   */
  it('stays on the map when the check fails, and offers a retry', async () => {
    verdict = () => {
      throw new Error('offline');
    };
    render();
    await pin();

    fireEvent.press(screen.getByTestId('address-confirm'));

    await waitFor(() => {
      expect(screen.getByText(/try again/i)).toBeTruthy();
    });
    expect(mockRouter.push).not.toHaveBeenCalled();
    // Everything being confirmed is still on screen; nothing was blanked for the round trip.
    expect(screen.getByTestId('address-map-canvas')).toBeTruthy();
    expect(screen.getByTestId('address-map-pin')).toBeTruthy();
  });

  /**
   * §8 — after a refusal the CTA must come back for the NEXT point. A button that stays dead is
   * the dead end the whole out-of-service flow exists to avoid.
   */
  it('re-arms Confirm after a refusal, and re-checks the new point', async () => {
    verdict = { status: 'outside_service_area' };
    render();
    await pin();

    fireEvent.press(screen.getByTestId('address-confirm'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());

    // The customer comes back from `215:1472` and pans one street over.
    verdict = { status: 'serviceable' };
    settleAt(12.8888, 77.6001);

    // A new point clears the refusal: it described a point that is no longer selected.
    await waitFor(() => {
      expect(screen.queryByTestId('address-serviceability')).toBeNull();
    });
    expect(screen.getByTestId('address-confirm').props.accessibilityState.disabled).toBe(false);

    fireEvent.press(screen.getByTestId('address-confirm'));

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/address/details');
    });
    expect(checks).toHaveLength(2);
    expect(checks[1]).toEqual({ latitude: 12.8888, longitude: 77.6001 });
  });
});
