import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AppState } from 'react-native';

import {
  DEMO_HOME_ACTIVE,
  DEMO_HOME_ACTIVE_ONE,
  DEMO_HOME_FIRST_TIME,
  DEMO_HOME_PRICING_ERROR,
  DEMO_HOME_PRICING_LOADING,
  DEMO_HOME_SOME_UNAVAILABLE,
} from '@/demo/fixtures/homeRedesign';
import { HomeRedesignView } from './HomeRedesignScreen';
import type { HomeRedesignActions } from './HomeRedesignScreen';

function actions(): HomeRedesignActions {
  return {
    onPressAddress: jest.fn(),
    onPressProfile: jest.fn(),
    onBookNow: jest.fn(),
    onPickSlot: jest.fn(),
    onPressRecurring: jest.fn(),
    onPressCookPool: jest.fn(),
    onPressPoolCook: jest.fn(),
    onJoinWaitlist: jest.fn().mockResolvedValue(undefined),
    onDurationSelected: jest.fn(),
    onRefreshAvailability: jest.fn(),
  };
}

const tile = (label: RegExp) => screen.getByRole('radio', { name: label });

describe('Duration carousel', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('opens with 45 mins at the front and nothing selected', () => {
    const a = actions();
    render(<HomeRedesignView model={DEMO_HOME_FIRST_TIME} {...a} />);
    // "45 mins" is in front, but only a tap selects: the CTA waits, grey and inert.
    expect(
      screen.getByRole('button', { name: 'Show 45 minutes' }).props.accessibilityState,
    ).toMatchObject({
      selected: true,
    });
    for (const radio of screen.getAllByRole('radio', { name: /minutes|hour/ })) {
      expect(radio.props.accessibilityState).toMatchObject({ checked: false });
    }
    expect(a.onDurationSelected).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Book Now' })).toBeDisabled();
    expect(screen.queryByText('Check payment details')).toBeNull();
  });

  it('labels the CTA as Figma does: "Book Now  ·  1 hr · ₹total", "Book for later" on Later', () => {
    render(<HomeRedesignView model={DEMO_HOME_FIRST_TIME} {...actions()} />);
    fireEvent.press(tile(/^1 hour/));
    // `1222:23640` — the selected SKU, then the GST-inclusive total. (The accessible name collapses
    // the label's double spaces; the drawn text keeps them.)
    expect(screen.getByRole('button', { name: 'Book Now · 1 hr · ₹75' })).toBeEnabled();
    expect(screen.getByText('Select duration to book')).toBeTruthy();

    fireEvent.press(screen.getByRole('radio', { name: 'Later' }));
    // `1222:24666` — no SKU, no payment link.
    expect(screen.getByRole('button', { name: 'Book for later' })).toBeEnabled();
    expect(screen.queryByText('Check payment details')).toBeNull();
  });

  it('moves to Later when Instant turns out to be unavailable, until the customer picks a tab', () => {
    const { rerender } = render(<HomeRedesignView model={DEMO_HOME_FIRST_TIME} {...actions()} />);
    fireEvent.press(tile(/^1 hour/));
    expect(screen.getByRole('radio', { name: 'Now' }).props.accessibilityState).toMatchObject({
      checked: true,
    });

    // Instant's read lands after Home opened, and says no.
    const unavailable = {
      ...DEMO_HOME_FIRST_TIME,
      instant: { available: false, etaMins: null },
    };
    rerender(<HomeRedesignView model={unavailable} {...actions()} />);
    expect(screen.getByRole('radio', { name: 'Later' }).props.accessibilityState).toMatchObject({
      checked: true,
    });

    // `1303:1333` — choosing Now anyway: Instant · Unavailable, same SKUs, "Book for later".
    fireEvent.press(screen.getByRole('radio', { name: 'Now' }));
    expect(screen.getByRole('radio', { name: 'Now' }).props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(screen.getByText('Instant · Unavailable')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Book for later' })).toBeEnabled();
  });

  it('brings a tile to the front without selecting it, and keeps a tapped one selected', () => {
    const a = actions();
    render(<HomeRedesignView model={DEMO_HOME_FIRST_TIME} {...a} />);

    fireEvent.press(screen.getByRole('button', { name: 'Show 1.5 hours' }));
    expect(tile(/^1.5 hours/).props.accessibilityState).toMatchObject({ checked: false });
    expect(a.onDurationSelected).not.toHaveBeenCalled();

    fireEvent.press(tile(/^30 minutes/));
    fireEvent.press(screen.getByRole('button', { name: 'Show 2.5 hours' }));
    // Scrolling on leaves the tapped tile the selection.
    expect(tile(/^30 minutes/).props.accessibilityState).toMatchObject({ checked: true });
    expect(a.onDurationSelected).toHaveBeenCalledTimes(1);
  });

  it('loops: 30 mins follows 2.5 hrs, and 2.5 hrs comes before 30 mins', () => {
    render(<HomeRedesignView model={DEMO_HOME_FIRST_TIME} {...actions()} />);
    const carousel = screen.getByLabelText('Duration');
    const front = (label: string) =>
      screen.getByRole('button', { name: `Show ${label}` }).props.accessibilityState.selected;
    // Three sets of the six tiles, 112pt apart; the middle set starts at tile 6.
    // A swipe: the finger goes down, then the strip comes to rest.
    const settleAt = (tileIndex: number) => {
      fireEvent(carousel, 'scrollBeginDrag');
      fireEvent(carousel, 'momentumScrollEnd', {
        nativeEvent: { contentOffset: { x: tileIndex * 112, y: 0 } },
      });
    };

    settleAt(12); // one past the middle set's 2.5 hrs
    expect(front('30 minutes')).toBe(true);
    settleAt(5); // one before the middle set's 30 mins
    expect(front('2.5 hours')).toBe(true);
  });

  it('opens on 45 mins again when the app comes back, unless a tile is selected', () => {
    const listeners = new Set<(status: string) => void>();
    // React Native's AppState mock is itself a `jest.fn`; restoring a spy on it would strip its
    // implementation, so the original is put back by hand.
    const addEventListener = jest.mocked(AppState.addEventListener);
    const original = addEventListener.getMockImplementation();
    addEventListener.mockImplementation(((_type: string, handler: (status: string) => void) => {
      listeners.add(handler);
      return { remove: () => listeners.delete(handler) };
    }) as never);
    const reopen = () =>
      act(() => {
        [...listeners].forEach((listener) => listener('background'));
        [...listeners].forEach((listener) => listener('active'));
      });
    try {
      render(<HomeRedesignView model={DEMO_HOME_FIRST_TIME} {...actions()} />);
      const carousel = screen.getByLabelText('Duration');
      const front = (label: string) =>
        screen.getByRole('button', { name: `Show ${label}` }).props.accessibilityState.selected;

      fireEvent(carousel, 'scrollBeginDrag');
      fireEvent(carousel, 'momentumScrollEnd', {
        nativeEvent: { contentOffset: { x: 9 * 112, y: 0 } },
      });
      expect(front('1.5 hours')).toBe(true);
      reopen();
      expect(front('45 minutes')).toBe(true);

      // A selected tile is the customer's choice: coming back leaves it at the front.
      fireEvent.press(tile(/^1.5 hours/));
      reopen();
      expect(front('1.5 hours')).toBe(true);
    } finally {
      if (original !== undefined) addEventListener.mockImplementation(original);
    }
  });

  it('opens on the middle set once prices arrive, so the first swipe back still loops', () => {
    const { rerender } = render(
      <HomeRedesignView model={DEMO_HOME_PRICING_LOADING} {...actions()} />,
    );
    rerender(<HomeRedesignView model={DEMO_HOME_FIRST_TIME} {...actions()} />);
    // 45 mins in the middle set: tile 6 + 1, 112pt apart.
    expect(screen.getByLabelText('Duration').props.contentOffset).toEqual({ x: 7 * 112, y: 0 });
  });

  it('selects on tap, raises duration_selected and books the payable total', () => {
    const a = actions();
    render(<HomeRedesignView model={DEMO_HOME_FIRST_TIME} {...a} />);
    fireEvent.press(tile(/^1.5 hours/));
    expect(a.onDurationSelected).toHaveBeenCalledWith({
      durationMin: 90,
      pricePaise: 6900,
      source: 'tile',
    });
    fireEvent.press(screen.getByRole('button', { name: /^Book Now · / }));
    expect(a.onBookNow).toHaveBeenCalledWith(
      expect.objectContaining({ duration: expect.objectContaining({ minutes: 90 }) }),
    );
  });

  it('takes the selection back on a second tap of the selected tile', () => {
    const a = actions();
    render(<HomeRedesignView model={DEMO_HOME_FIRST_TIME} {...a} />);
    fireEvent.press(tile(/^1.5 hours/));
    expect(screen.getByRole('button', { name: /^Book Now · 1.5 hrs/ })).toBeEnabled();

    fireEvent.press(tile(/^1.5 hours/));
    expect(tile(/^1.5 hours/).props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByRole('button', { name: 'Book Now' })).toBeDisabled();
    expect(a.onDurationSelected).toHaveBeenCalledTimes(1);

    // And a third tap selects it again.
    fireEvent.press(tile(/^1.5 hours/));
    expect(tile(/^1.5 hours/).props.accessibilityState).toMatchObject({ checked: true });
    expect(a.onDurationSelected).toHaveBeenCalledTimes(2);
  });

  it('announces an unavailable tile, refuses it and shows a toast', () => {
    const a = actions();
    render(<HomeRedesignView model={DEMO_HOME_SOME_UNAVAILABLE} {...a} />);
    const twoHours = tile(/^2 hours/);
    expect(twoHours.props.accessibilityLabel).toMatch(/unavailable$/);
    fireEvent.press(twoHours);
    expect(a.onDurationSelected).not.toHaveBeenCalled();
    expect(screen.getByText('2 hrs isn’t available right now.')).toBeTruthy();
    act(() => jest.advanceTimersByTime(3000));
  });

  it('clears a selection Later cannot book, leaving the customer to pick again', () => {
    render(<HomeRedesignView model={DEMO_HOME_SOME_UNAVAILABLE} {...actions()} />);
    fireEvent.press(tile(/^30 minutes/));
    fireEvent.press(screen.getByRole('radio', { name: 'Later' }));
    expect(screen.getByText('30 mins is no longer available.')).toBeTruthy();
    expect(tile(/^30 minutes/).props.accessibilityState).toMatchObject({ checked: false });
    // Nothing takes its place: the CTA waits for the next tap.
    expect(screen.getByRole('button', { name: 'Book for later' })).toBeDisabled();
    fireEvent.press(tile(/^1 hour/));
    expect(screen.getByRole('button', { name: 'Book for later' })).toBeEnabled();
    act(() => jest.advanceTimersByTime(3000));
  });

  it('opens the dial on Complex, as `1625:11215` draws it', () => {
    render(<HomeRedesignView model={DEMO_HOME_FIRST_TIME} {...actions()} />);
    expect(
      screen.getByRole('button', { name: 'Complex (kofta, biryani)' }).props.accessibilityState,
    ).toMatchObject({ selected: true });
  });

  it('takes the recommended duration from the dial’s Select duration button', () => {
    const a = actions();
    render(<HomeRedesignView model={DEMO_HOME_FIRST_TIME} {...a} />);

    fireEvent.press(screen.getByRole('button', { name: 'Select duration' }));

    expect(a.onDurationSelected).toHaveBeenCalledWith(expect.objectContaining({ source: 'dial' }));
    expect(screen.getByRole('button', { name: /^Book Now · / })).toBeEnabled();
    expect(screen.getByText('Check payment details')).toBeTruthy();
  });

  it('shows six skeleton tiles while pricing loads', () => {
    render(<HomeRedesignView model={DEMO_HOME_PRICING_LOADING} {...actions()} />);
    expect(screen.getAllByTestId('duration-skeleton')).toHaveLength(6);
    expect(screen.getByRole('button', { name: /Book now/i })).toBeDisabled();
  });

  it('offers a retry when pricing fails', () => {
    const a = actions();
    render(<HomeRedesignView model={DEMO_HOME_PRICING_ERROR} {...a} />);
    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(a.onRefreshAvailability).toHaveBeenCalled();
  });
});

describe('Header', () => {
  it('shows the address label over its building and flat (`1625:11065`)', () => {
    render(<HomeRedesignView model={DEMO_HOME_FIRST_TIME} {...actions()} />);
    expect(screen.getByText('Label')).toBeTruthy();
    expect(screen.getByText('Building_name · Flat/House #')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Delivery address Label, Building_name · Flat/House #' }),
    ).toBeTruthy();
  });

  it('leaves the second line out when the address has no building or flat', () => {
    render(
      <HomeRedesignView
        model={{
          ...DEMO_HOME_FIRST_TIME,
          address: { ...DEMO_HOME_FIRST_TIME.address, detail: null },
        }}
        {...actions()}
      />,
    );
    expect(screen.queryByText('Building_name · Flat/House #')).toBeNull();
  });
});

describe('Active bookings', () => {
  it('hides the section when there is no active booking', () => {
    render(<HomeRedesignView model={DEMO_HOME_FIRST_TIME} {...actions()} />);
    expect(screen.queryByText('Active bookings')).toBeNull();
  });

  it('draws one booking as a single card — no count, no "View all"', () => {
    const onPressActiveBooking = jest.fn();
    render(
      <HomeRedesignView
        model={DEMO_HOME_ACTIVE_ONE}
        {...actions()}
        onPressActiveBooking={onPressActiveBooking}
      />,
    );
    expect(screen.getByText('Active bookings')).toBeTruthy();
    expect(screen.queryByText('View all')).toBeNull();
    expect(screen.getByText('RECURRING')).toBeTruthy();
    expect(screen.getByText('Upcoming')).toBeTruthy();

    fireEvent.press(screen.getByTestId('home-active-booking-booking:b-1'));
    expect(onPressActiveBooking).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 'b-1' }),
    );
  });

  it('adds the count and "View all" from two bookings on', () => {
    const onPressViewAllBookings = jest.fn();
    render(
      <HomeRedesignView
        model={DEMO_HOME_ACTIVE}
        {...actions()}
        onPressViewAllBookings={onPressViewAllBookings}
      />,
    );
    // Scoped to the section: the dial's dishes stepper opens on 3 too.
    expect(within(screen.getByTestId('home-active-bookings')).getByText('3')).toBeTruthy();
    expect(screen.getByText('In progress')).toBeTruthy();
    // The two upcoming cards sit further along the track, hidden from screen readers until the
    // carousel brings them on screen.
    expect(screen.queryByText('Upcoming')).toBeNull();
    expect(
      screen.getAllByText('Upcoming', { includeHiddenElements: true }).length,
    ).toBeGreaterThanOrEqual(2);
    fireEvent.press(screen.getByRole('link', { name: 'View all bookings' }));
    expect(onPressViewAllBookings).toHaveBeenCalled();
  });
});
