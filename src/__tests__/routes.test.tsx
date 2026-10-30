import { fireEvent, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import {
  DEFAULT_API_STUBS as ROUTE_STUBS,
  createStubApi,
  createTestRuntime,
  renderWithRuntime,
} from '@/test/renderWithRuntime';

/**
 * Route smoke tests — every implemented route mounts and renders its screen.
 *
 * expo-router's navigation hooks are mocked so each route can be rendered in isolation; the
 * routes themselves are thin wrappers that wire data hooks to a feature screen.
 *
 * Rendering goes through `renderWithRuntime`, which supplies the query client and the
 * composition root every route now reaches. Its stub API rejects unhandled calls, so these stay
 * MOUNT tests: they prove a route renders its designed screen, and no route is allowed to reach
 * a real endpoint to do it.
 *
 * NOTE: this file lives outside `src/app/` on purpose — expo-router's `require.context` would
 * otherwise pull it, and its test-only imports, into the production bundle.
 */

import AddressDetailsRoute from '@/app/(app)/address/details';
import SavedAddressesRoute from '@/app/(app)/address/index';
import AddressLocationRoute from '@/app/(app)/address/location';
import BookingRoute from '@/app/(app)/booking/[id]';
import HistoryRoute from '@/app/(app)/history';
import HomeRoute from '@/app/(app)/home';
import LegalDocumentRoute from '@/app/legal/[doc]';
import MealBriefRoute from '@/app/(app)/meal-brief';
import ProfileRoute from '@/app/(app)/profile';
import ProfileDetailsRoute from '@/app/(app)/profile/details';
import RefundsRoute from '@/app/(app)/refunds';
import RescheduleRoute from '@/app/(app)/reschedule/[id]';
import ScheduledRoute from '@/app/(app)/scheduled';
import LoginRoute from '@/app/(auth)/login';
import OtpRoute from '@/app/(auth)/otp';
import NotFoundRoute from '@/app/+not-found';
import RecurringBookingRoute from '@/app/(app)/recurring/[bookingId]';

/**
 * Home reads the Cook Pool, whose module carries the swipe deck. Reanimated and worklets are
 * native runtimes with no headless implementation, so they run against their own jest mocks, as
 * the Cook Pool's own tests do.
 */
jest.mock('react-native-worklets', () =>
  jest.requireActual('react-native-worklets/lib/module/mock'),
);
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));

/**
 * Mutable so a test can drive a route's params. Reset in `beforeEach` so one test's params
 * cannot leak into the next.
 */
let mockSearchParams: Record<string, string> = { id: 'enRoute' };

/**
 * The router every route now reaches.
 *
 * `canGoBack` and `canDismiss` are part of it because back is no longer a bare `router.back()`:
 * `useSafeBack` asks whether there is a history before popping, and falls back to a deterministic
 * route when there is not. A mock without them would throw on the first back control.
 */
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    dismissTo: jest.fn(),
    dismissAll: jest.fn(),
    canGoBack: jest.fn(() => true),
    canDismiss: jest.fn(() => true),
  }),
  useLocalSearchParams: () => mockSearchParams,
  useFocusEffect: (effect: () => void | (() => void)) => {
    // The real hook runs the effect while the screen is focused. Every route in these tests is
    // rendered in isolation and therefore focused, so running it once is the faithful behaviour —
    // and it is what exercises the `BackHandler` subscriptions the routes now register.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(effect, [effect]);
  },
  Redirect: () => null,
  Stack: Object.assign(() => null, { Screen: () => null }),
}));

/**
 * The reads the wired routes perform on mount.
 *
 * Supplying them keeps these as READY-state tests: a route that renders its designed screen only
 * once data arrives is proved to reach that state, not merely to survive an error. Anything a
 * route asks for that is NOT listed here still fails loudly through the stub.
 */
function render(ui: Parameters<typeof renderWithRuntime>[0]) {
  return renderWithRuntime(ui, {
    runtime: createTestRuntime({ api: createStubApi(ROUTE_STUBS) }),
  });
}

describe('routes render', () => {
  beforeEach(() => {
    mockSearchParams = { id: 'enRoute' };
  });

  it.each([
    ['home', HomeRoute, 'home-redesign-screen'],
    ['scheduled', ScheduledRoute, 'schedule-later'],
    ['reschedule/[id]', RescheduleRoute, 'schedule-screen'],
    ['meal-brief', MealBriefRoute, 'meal-brief-screen'],
    ['booking/[id]', BookingRoute, 'booking-detail-screen'],
    ['profile', ProfileRoute, 'profile-screen'],
    // `338:4508`, V8. Mounted in the EDIT context; the first-run context is covered end to end in
    // `features/profile/profileOnboarding.test.tsx`.
    ['profile/details', ProfileDetailsRoute, 'taste-profile'],
    ['history', HistoryRoute, 'history-screen'],
    ['refunds', RefundsRoute, 'refunds-screen'],
    ['address', SavedAddressesRoute, 'saved-addresses'],
    ['address/location', AddressLocationRoute, 'address-map-screen'],
    ['address/details', AddressDetailsRoute, 'address-details'],
  ])('%s', async (_name, Route, testID) => {
    render(<Route />);
    // `find*` rather than `get*`: the wired routes resolve their reads asynchronously, so the
    // designed screen appears on the next tick rather than in the first synchronous render.
    expect(await screen.findByTestId(testID)).toBeTruthy();
  });

  /**
   * `53:31` is the FIRST screen after OTP for a new account, so nothing on it may look like an
   * address the app already has.
   *
   * The resolved row used to fall back to `DEMO_ADDRESS_LOCATION`'s transcribed sample — "Street
   * Name" over "Area 124, subarea 2 xyz, city efg" — whenever there was no point. The global
   * expo-location mock denies the permission, which is exactly that state, and it is the state a
   * real first-time customer who declines the prompt lands in: they were shown a saved-looking
   * address they had never entered.
   */
  it('shows no fixture address on the map step when there is no point', async () => {
    render(<AddressLocationRoute />);
    await screen.findByTestId('address-map-screen');

    expect(screen.queryByText('Area 124, subarea 2 xyz, city efg')).toBeNull();
    expect(screen.queryByText('Street Name')).toBeNull();
    // The map opens on the fallback point (dev note `2075:11925`) and the hint says why — the
    // denied permission — and names the way forward.
    expect(await screen.findByText('Allow location, or search above')).toBeTruthy();
  });

  /** Same rule, one screen later: the Area row of the form that SAVES the address. */
  it('shows no fixture address in the address form before a point is pinned', async () => {
    render(<AddressDetailsRoute />);
    await screen.findByTestId('address-details');

    expect(screen.queryByText('Street name, Area 124, subarea xyz, city')).toBeNull();
  });

  /**
   * The arrival PROMISE is stated TWICE on Home and both readings are the catalogue's.
   *
   * The header headline was already patched from `instant.arrivalPromiseMinutes`; the Instant
   * tile's emphasised run was not, so it rendered the fixture's transcribed " 18 mins" while the
   * Instant sheet — reading the same policy value — said 30. One screen, two numbers, and the
   * tile's came from a Figma frame rather than from the server.
   *
   * The stub catalogue publishes 30, so both surfaces have to say 30.
   */
  /**
   * The redesigned Home (`941:4884`) states the arrival in the Book section header — "Arriving in
   * x mins" — and the minutes come from the SERVER: the per-address estimate when it has one,
   * else the published promise. With no cook dispatchable the caption reads
   * "Instant · Unavailable" (`1303:1333`) instead of a promise nobody can keep.
   */
  it('states the arrival estimate the server computed for this address', async () => {
    renderWithRuntime(<HomeRoute />, {
      runtime: createTestRuntime({
        api: createStubApi({
          ...ROUTE_STUBS,
          'GET /v1/availability/instant': () => ({
            available: true,
            arrivalTargetMinutes: 30,
            projectedArrival: { etaMinutes: 14 },
            validUntil: '2026-08-18T09:00:30.000Z',
          }),
        }),
      }),
    });

    expect(await screen.findByText('14 mins')).toBeTruthy();
    expect(screen.getByText('Arriving in')).toBeTruthy();
  });

  it('falls back to the published promise when the server estimated nothing', async () => {
    renderWithRuntime(<HomeRoute />, {
      runtime: createTestRuntime({
        api: createStubApi({
          ...ROUTE_STUBS,
          'GET /v1/availability/instant': () => ({
            available: true,
            arrivalTargetMinutes: 30,
            validUntil: '2026-08-18T09:00:30.000Z',
          }),
        }),
      }),
    });

    expect(await screen.findByText('Arriving in')).toBeTruthy();
    expect(screen.getAllByText('30 mins').length).toBeGreaterThan(0);
  });

  it('drops the arrival promise while no cook can be dispatched', async () => {
    renderWithRuntime(<HomeRoute />, {
      runtime: createTestRuntime({
        api: createStubApi({
          ...ROUTE_STUBS,
          'GET /v1/availability/instant': () => ({
            available: false,
            arrivalTargetMinutes: 30,
            reason: 'NO_PRESENT_COOK',
            validUntil: '2026-08-18T09:00:30.000Z',
          }),
        }),
      }),
    });

    expect(await screen.findByText('Instant · Unavailable')).toBeTruthy();
    expect(screen.queryByText('Arriving in')).toBeNull();
    // Now cannot book, so the section moves to Later's Schedule CTA (an effect, one render on).
    expect(await screen.findByRole('button', { name: 'Book for later' })).toBeTruthy();
  });

  // The old Home's "keeps a live tracking ETA" case went with its active-bookings carousel: the
  // redesign has no such section, so no in-flight booking is drawn on Home any more.

  /** Both legal documents open IN the app, each under its own title. */
  it.each([
    ['terms', 'Customer Terms of Service'],
    ['privacy', 'Customer Privacy Policy'],
  ])('legal/%s', async (doc, title) => {
    mockSearchParams = { doc };
    render(<LegalDocumentRoute />);

    expect(await screen.findByTestId('legal-document-screen')).toBeTruthy();
    expect(screen.getByText(title)).toBeTruthy();
  });

  /**
   * Task §20 — a deep link must never dead-end. A legal document is either published or it is
   * not, so an unknown one redirects to somewhere real rather than drawing an empty viewer.
   */
  it('redirects an unknown legal document instead of rendering an empty viewer', () => {
    mockSearchParams = { doc: 'cookies' };
    render(<LegalDocumentRoute />);

    expect(screen.queryByTestId('legal-document-screen')).toBeNull();
  });

  it('renders the redesigned Login (1923:1139) — badges, field, Get OTP and legal footer', () => {
    render(<LoginRoute />);

    expect(screen.getByTestId('login-screen')).toBeTruthy();
    expect(screen.getByTestId('login-screen-phone')).toBeTruthy();
    expect(screen.getByTestId('login-screen-cta')).toBeTruthy();
    expect(screen.getByText('Home cooks for all your needs')).toBeTruthy();
    expect(screen.getByText('Get OTP')).toBeTruthy();
    expect(screen.getByText('Terms of use')).toBeTruthy();
    expect(screen.getByText('Privacy policy')).toBeTruthy();
  });

  it('does not embed the development menu inside Login', () => {
    // Regression guard. The menu is content-sized; as a sibling of the `flex: 1` login screen it
    // collapsed the frame to a few pixels, so `spoon://login` rendered the menu, not the design.
    // It now lives at `spoon://menu`; only a zero-footprint dev tap target remains here.
    render(<LoginRoute />);

    expect(screen.queryByTestId('dev-route-menu')).toBeNull();
    expect(screen.getByTestId('login-dev-menu-handle')).toBeTruthy();
  });

  it('keeps the Login CTA inert until the full number is entered', () => {
    render(<LoginRoute />);

    const cta = screen.getByTestId('login-screen-cta');
    expect(cta.props.accessibilityState.disabled).toBe(true);

    // A number that is not a mobile (must start 6–9) keeps it inert too.
    fireEvent.changeText(screen.getByTestId('login-screen-phone'), '5876543210');
    expect(screen.getByTestId('login-screen-cta').props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(screen.getByTestId('login-screen-phone'), '9876543210');
    expect(screen.getByTestId('login-screen-cta').props.accessibilityState.disabled).toBe(false);
  });

  it('renders the redesigned OTP screen (1934:1080) with no Verify button', () => {
    mockSearchParams = { phone: '+919876543210', retryAfter: '30' };
    render(<OtpRoute />);

    expect(screen.getByTestId('login-otp-screen')).toBeTruthy();
    expect(screen.getByText('Enter your')).toBeTruthy();
    expect(screen.getByText('+91 98765 43210')).toBeTruthy();
    // The 6th digit submits; nothing in the frames is a submit control.
    expect(screen.queryByText('Verify & Proceed')).toBeNull();
  });

  it('shows Resend via SMS when no server cooldown was carried in (1934:1358)', () => {
    // `useLocalSearchParams` is mocked without `retryAfter` — the cooldown has already elapsed.
    render(<OtpRoute />);

    expect(screen.getByText('Resend via SMS')).toBeTruthy();
  });

  it("counts down from the SERVER's cooldown, not a client constant (1934:1352)", () => {
    mockSearchParams = { phone: '+919876543210', retryAfter: '26' };
    render(<OtpRoute />);

    // 26 is `otp/send`'s `retryAfterSeconds`; the pill formats it as m:ss.
    expect(screen.getByText('Resend in 0:26')).toBeTruthy();
  });

  /**
   * The Live booking tab on a real booking: Home's "Recurring · Live" opens it. It draws the
   * booking's own Up next, progress and dates, and the parts still on fixture data (Manage plans)
   * say "coming soon" rather than opening the static screens.
   */
  it('renders a live Recurring booking from the backend, not the fixture', async () => {
    mockSearchParams = { bookingId: 'rb-1' };
    const cook = {
      cookId: 'cook-1',
      displayName: 'Cook Meera',
      profileImageUrl: null,
      rating: { average: 4.8, count: 3 },
    };
    const visit = {
      visitId: 'visit-1',
      planNumber: 1,
      visitNumber: 1,
      date: '2026-10-14',
      timeOfDay: 'morning',
      startTime: '09:00',
      start: '2026-10-14T03:30:00.000Z',
      durationMinutes: 60,
      status: 'charged',
      displayState: 'cook_assigned',
      cookConfirmBy: '2026-10-14T00:30:00.000Z',
      cook,
      bookingId: 'b-1',
      totalPaise: 13545,
      cancelledBy: null,
    };
    renderWithRuntime(<RecurringBookingRoute />, {
      runtime: createTestRuntime({
        api: createStubApi({
          ...ROUTE_STUBS,
          'GET /v1/me/recurring-bookings/rb-1': () => ({
            recurringBookingId: 'rb-1',
            status: 'active',
            addressId: 'addr-1',
            window: { startDate: '2026-10-10', endDate: '2026-10-30' },
            policyVersion: 'recurring-v2-spec-1',
            mandate: null,
            banner: null,
            counts: { done: 2, cancelled: 0, toGo: 3 },
            plans: [],
            days: [{ date: '2026-10-14', group: 'upcoming', visits: [visit] }],
            upNext: visit,
            chargeRange: { minPaise: 13545, maxPaise: 13545 },
            support: { whatsappUrl: null },
            createdAt: '2026-10-07T06:00:00.000Z',
            cancelledAt: null,
            cancelledBy: null,
          }),
        }),
      }),
    });

    expect(await screen.findByTestId('recurring-live-screen')).toBeTruthy();
    expect(screen.getByText('2 done · 0 cancelled · 3 to go')).toBeTruthy();
    // No Up-next card (`1746:3304`): the progress line comes straight after the tabs.
    expect(screen.queryByText('1st Visit, 9:00 AM')).toBeNull();
    // The fixture's Cook Meera / "3 done · 1 cancelled" never appear.
    expect(screen.queryByText(/Meera/)).toBeNull();

    // Manage plans opens on the same booking — no "Coming soon", no fixture plans.
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    fireEvent.press(screen.getByTestId('recurring-live-screen-header-plans'));
    expect(await screen.findByTestId('recurring-plans-screen')).toBeTruthy();
    expect(alert).not.toHaveBeenCalledWith('Coming soon', expect.any(String));
    expect(screen.queryByText(/Meera/)).toBeNull();
    alert.mockRestore();
  });

  /**
   * Task §20 — an unknown `spoon://` link must never dead-end. It used to render a development
   * scaffold ("FOUNDATION PLACEHOLDER · Not found") with no control on it; it now redirects to a
   * safe root chosen off the session machine, which the mocked `Redirect` renders as nothing.
   */
  it('redirects an unknown deep link instead of rendering a dead scaffold', () => {
    render(<NotFoundRoute />);

    expect(screen.queryByTestId('route-scaffold-Not found')).toBeNull();
    expect(screen.queryByText('FOUNDATION PLACEHOLDER')).toBeNull();
  });
});
