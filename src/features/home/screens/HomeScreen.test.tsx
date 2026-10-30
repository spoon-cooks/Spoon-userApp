import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { ready } from '@core/data';

import { DEMO_HOME_ACTIVE_BOOKING, DEMO_HOME_PRE_BOOKING } from '@/demo/fixtures/home';
import { homeFrom } from '../adapters';
import { HomeView } from './HomeScreen';

/** Collects `testID`s in render order so section ORDER can be asserted without a snapshot. */
function testIdOrder(node: unknown, found: string[] = []): string[] {
  if (node === null || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    for (const child of node) testIdOrder(child, found);
    return found;
  }
  const element = node as { props?: Record<string, unknown>; children?: unknown };
  const testID = element.props?.['testID'];
  if (typeof testID === 'string') found.push(testID);
  testIdOrder(element.children, found);
  return found;
}

const actions = {
  onPressInstant: jest.fn(),
  onPressSchedule: jest.fn(),
  onPressAddress: jest.fn(),
  onPressProfile: jest.fn(),
  onOpenActiveBooking: jest.fn(),
};

describe('Home — pre-booking variant (Page 3a, 1:455)', () => {
  it('renders every Page 3a section in frame order', () => {
    render(<HomeView state={ready(DEMO_HOME_PRE_BOOKING)} {...actions} />);

    for (const id of [
      'home-header',
      'home-promo',
      'home-tile-instant',
      'home-tile-scheduled',
      'home-marketing',
      'home-cuisines',
      'home-reasons',
      'home-duration-guide',
      'home-exclusions',
      'home-promise',
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
  });

  it('renders the Instant subtitle as two runs — `1:585` is one paragraph in two styles', () => {
    render(<HomeView state={ready(DEMO_HOME_PRE_BOOKING)} {...actions} />);

    // One paragraph, so the tree flattens to the joined string...
    expect(screen.getByText('Get a cook in 18 mins')).toBeTruthy();
    // ...but the emphasised run is its own node, carrying its own (larger, bolder) type style.
    const emphasis = screen.getByTestId('home-tile-instant-emphasis');
    expect(emphasis.props.children).toBe(' 18 mins');
  });

  it('shows no active-booking carousel', () => {
    render(<HomeView state={ready(DEMO_HOME_PRE_BOOKING)} {...actions} />);

    expect(screen.queryByTestId('home-booking-carousel')).toBeNull();
  });
});

describe('Home — active-booking variant (`381:511`, Home WITH a banner)', () => {
  /** One booking in the fixture, so the carousel draws exactly one card, at track position 0. */
  const CARD = 'home-booking-carousel-card-0';

  it('renders the active-booking card with the server copy', () => {
    render(<HomeView state={ready(DEMO_HOME_ACTIVE_BOOKING)} {...actions} />);

    const card = within(screen.getByTestId(CARD));
    // `337:4284` — the title and the caption come from ONE variant. The fixture is `arriving`,
    // so the title is "Arriving"; asserting "Live booking" here alongside "Arriving in" asked
    // for a card `homeBannerFor` can never build, since `live` draws the "Time left" caption.
    expect(card.getByText('Arriving')).toBeTruthy();
    expect(card.getByText('Tomorrow, Aug 5')).toBeTruthy();
    expect(card.getByText('1:15 PM • 1 hr')).toBeTruthy();
    expect(card.getByText('Cook Asha')).toBeTruthy();
    expect(card.getByText('Arriving in')).toBeTruthy();
    expect(card.getByText('12 mins')).toBeTruthy();
  });

  it('KEEPS every Page 3a section — Page 3b is Page 3a PLUS the card, never instead of it', () => {
    render(<HomeView state={ready(DEMO_HOME_ACTIVE_BOOKING)} {...actions} />);

    // `381:511` is `1:455` PLUS the banner: inserting the card removes no Home content.
    for (const id of [
      'home-header',
      'home-promo',
      'home-tile-instant',
      'home-tile-scheduled',
      'home-marketing',
      'home-cuisines',
      'home-reasons',
      'home-duration-guide',
      'home-exclusions',
      'home-promise',
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
  });

  it('inserts the carousel BELOW the booking tiles, where `333:3835` puts it', () => {
    const tree = render(<HomeView state={ready(DEMO_HOME_ACTIVE_BOOKING)} {...actions} />);

    // `333:3835` orders the body: tiles (y 16) → active banner (y 186) → mosaic (y 356).
    const order = testIdOrder(tree.toJSON());
    expect(order.indexOf('home-promo')).toBeLessThan(order.indexOf('home-tiles'));
    expect(order.indexOf('home-tiles')).toBeLessThan(order.indexOf('home-booking-carousel'));
    expect(order.indexOf('home-booking-carousel')).toBeLessThan(order.indexOf('home-cuisines'));
  });

  it('opens the active booking by pressing the card itself', () => {
    render(<HomeView state={ready(DEMO_HOME_ACTIVE_BOOKING)} {...actions} />);

    fireEvent.press(screen.getByTestId(CARD));
    expect(actions.onOpenActiveBooking).toHaveBeenCalledTimes(1);
  });

  it('selects the variant from the payload alone, never from a client guess', () => {
    const { rerender } = render(<HomeView state={ready(DEMO_HOME_ACTIVE_BOOKING)} {...actions} />);
    expect(screen.getByTestId(CARD)).toBeTruthy();

    rerender(<HomeView state={ready(DEMO_HOME_PRE_BOOKING)} {...actions} />);
    expect(screen.queryByTestId('home-booking-carousel')).toBeNull();
  });
});

describe('Home — navigation and states', () => {
  it('routes from both booking tiles', () => {
    render(<HomeView state={ready(DEMO_HOME_PRE_BOOKING)} {...actions} />);

    fireEvent.press(screen.getByTestId('home-tile-instant'));
    fireEvent.press(screen.getByTestId('home-tile-scheduled'));

    expect(actions.onPressInstant).toHaveBeenCalledTimes(1);
    expect(actions.onPressSchedule).toHaveBeenCalledTimes(1);
  });

  it('renders a loading surface before data arrives', () => {
    render(<HomeView state={{ status: 'loading' }} {...actions} />);

    expect(screen.queryByTestId('home-header')).toBeNull();
    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it('renders an error surface with retry', () => {
    const onRetry = jest.fn();
    render(
      <HomeView
        state={{ status: 'error', error: { kind: 'network', message: 'offline' } }}
        onRetry={onRetry}
        {...actions}
      />,
    );

    fireEvent.press(screen.getByTestId('error-state-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

/**
 * FE-6 — a customer with no saved address must never be shown the fixture's address.
 *
 * Observed on a real device: a freshly created account with ZERO addresses in the database
 * rendered "Home / E102, Purva Skydale, Silver Count…" — the demo fixture's address — because
 * the composer only wrote the real values when it had them, leaving the STATIC screen
 * definition's value in place otherwise. These pin the fix at both ends: the composer emits
 * null, and the banner draws a prompt rather than someone else's address.
 */
describe('Home — no saved address (FE-6)', () => {
  it('composes a null address rather than inheriting the static definition', () => {
    const composed = homeFrom({
      base: DEMO_HOME_ACTIVE_BOOKING,
      addressLabel: null,
      addressLine: null,
    });

    expect(composed.header.addressLabel).toBeNull();
    expect(composed.header.addressLine).toBeNull();
  });

  it('never renders the fixture address for an account that has none', () => {
    render(
      <HomeView
        state={ready(
          homeFrom({ base: DEMO_HOME_ACTIVE_BOOKING, addressLabel: null, addressLine: null }),
        )}
        {...actions}
      />,
    );

    // Read off the fixture so the assertion tracks it: the point is that whatever the STATIC
    // screen definition carries must not reach a customer who has no address of their own.
    expect(screen.queryByText(String(DEMO_HOME_ACTIVE_BOOKING.header.addressLine))).toBeNull();
    expect(screen.queryByText(String(DEMO_HOME_ACTIVE_BOOKING.header.addressLabel))).toBeNull();
  });

  it('draws the address prompt in the same lockup, still opening the address flow', () => {
    render(
      <HomeView
        state={ready(
          homeFrom({ base: DEMO_HOME_ACTIVE_BOOKING, addressLabel: null, addressLine: null }),
        )}
        {...actions}
      />,
    );

    expect(screen.getByText('Add address')).toBeTruthy();
    expect(screen.getByText('Set your delivery location')).toBeTruthy();

    fireEvent.press(screen.getByTestId('home-address'));
    expect(actions.onPressAddress).toHaveBeenCalled();
  });

  it('still renders the real address when the customer has one', () => {
    render(
      <HomeView
        state={ready(
          homeFrom({
            base: DEMO_HOME_ACTIVE_BOOKING,
            addressLabel: 'Work',
            addressLine: '4th Floor, Prestige Tech Park',
          }),
        )}
        {...actions}
      />,
    );

    expect(screen.getByText('Work')).toBeTruthy();
    expect(screen.getByText('4th Floor, Prestige Tech Park')).toBeTruthy();
    expect(screen.queryByText('Add address')).toBeNull();
  });
});
