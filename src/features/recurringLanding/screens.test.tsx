import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { RecurringLandingScreen } from './screens/RecurringLandingScreen';

/**
 * Reanimated and worklets are native runtimes with no headless implementation, so the page's
 * slide and scroll handler run against their own jest mocks. What the footer's rule does with a
 * scroll position is `stickyFooter.test.ts`; here it is what the page does with the footer.
 */
jest.mock('react-native-worklets', () =>
  jest.requireActual('react-native-worklets/lib/module/mock'),
);
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));

/** The parked footer is hidden from screen readers, and the queries skip what they cannot reach. */
const HIDDEN = { includeHiddenElements: true };

/** Opens the page and scrolls it to the end, as a preview does: the footer is then in. */
function renderScrolledLanding() {
  const handlers = renderLanding({ initialScroll: 'end' });
  fireEvent(screen.getByTestId('recurring-landing-scroll'), 'contentSizeChange', 402, 1600);
  return handlers;
}

function renderLanding(props: Partial<Parameters<typeof RecurringLandingScreen>[0]> = {}) {
  const handlers = { onBack: jest.fn(), onSchedule: jest.fn(), onMakeCookPool: jest.fn() };
  render(<RecurringLandingScreen {...handlers} {...props} />);
  return handlers;
}

describe('Recurring landing', () => {
  it('draws the page, top to bottom', () => {
    renderLanding();
    expect(screen.getByText('Recurring')).toBeTruthy();
    expect(screen.getByText('Book for multiple days at once!')).toBeTruthy();
    expect(screen.getByText(/Effortless · Reliable/)).toBeTruthy();
    expect(screen.getByText('Book Recurring')).toBeTruthy();
    expect(screen.getByText('Unlock by creating your Cook Pool')).toBeTruthy();
    expect(screen.getByText('10:00 AM')).toBeTruthy();
    expect(screen.getByText('7:00 PM')).toBeTruthy();
    expect(screen.getByText('11:00 AM')).toBeTruthy();
    expect(screen.getByText('One time planning, familiar cooks')).toBeTruthy();
    for (const title of ['Schedule', 'Pay as you go', 'On the go flexibility', 'No surprises']) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getByText('Plans, Visits, Cook Pool & more')).toBeTruthy();
    expect(screen.getByText('Understand Recurring')).toBeTruthy();
    expect(screen.getByText('Tap to watch!')).toBeTruthy();
    // The footer is on the page, parked out of sight and out of reach.
    expect(screen.getAllByText('Book Recurring', HIDDEN)).toHaveLength(2);
  });

  it('describes paying and changing plans as the design does', () => {
    renderLanding();
    expect(
      screen.getByText(
        'No upfront payment. Charged 3 hours before your first visit of the day through UPI AutoPay',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Change of plans while Recurring is live? Cancel and book a ‘one-time’ service anytime',
      ),
    ).toBeTruthy();
  });

  it('offers to make the Cook Pool while it is empty, and to check it once it has a cook', () => {
    renderLanding();
    expect(screen.getByText('Make your Cook Pool')).toBeTruthy();
    expect(screen.queryByText('Check your Cook Pool')).toBeNull();
    screen.rerender(
      <RecurringLandingScreen
        onBack={jest.fn()}
        onSchedule={jest.fn()}
        onMakeCookPool={jest.fn()}
        hasCookPool
      />,
    );
    expect(screen.getByText('Check your Cook Pool')).toBeTruthy();
    expect(screen.queryByText('Make your Cook Pool')).toBeNull();
  });

  it('goes back', () => {
    const { onBack } = renderLanding();
    fireEvent.press(screen.getByTestId('recurring-landing-header-back'));
    expect(onBack).toHaveBeenCalled();
  });

  it('opens the plan flow from the tag and from the footer: the same flow', () => {
    const { onSchedule, onMakeCookPool } = renderScrolledLanding();
    fireEvent.press(screen.getByTestId('recurring-landing-tag'));
    fireEvent.press(screen.getByTestId('recurring-landing-footer-cta'));
    expect(onSchedule).toHaveBeenCalledTimes(2);
    expect(onMakeCookPool).not.toHaveBeenCalled();
  });

  it('keeps both Book Recurring buttons disabled while the Cook Pool is below the unlock', () => {
    const handlers = { onBack: jest.fn(), onSchedule: jest.fn(), onMakeCookPool: jest.fn() };
    render(<RecurringLandingScreen {...handlers} cta="locked" initialScroll="end" />);
    fireEvent(screen.getByTestId('recurring-landing-scroll'), 'contentSizeChange', 402, 1600);
    const tag = screen.getByTestId('recurring-landing-tag');
    const footer = screen.getByTestId('recurring-landing-footer-cta');
    expect(tag).toBeDisabled();
    expect(footer).toBeDisabled();
    expect(screen.getAllByText('Book Recurring')).toHaveLength(2);
    fireEvent.press(tag);
    fireEvent.press(footer);
    expect(handlers.onSchedule).not.toHaveBeenCalled();
  });

  it('reads "Recurring · Live" on both buttons with a live booking, and opens it', () => {
    const onOpenLive = jest.fn();
    const { onSchedule } = renderLanding({ cta: 'live', onOpenLive, initialScroll: 'end' });
    fireEvent(screen.getByTestId('recurring-landing-scroll'), 'contentSizeChange', 402, 1600);
    expect(screen.getAllByText('Recurring · Live')).toHaveLength(2);
    expect(screen.queryByText('Book Recurring')).toBeNull();
    fireEvent.press(screen.getByTestId('recurring-landing-tag'));
    fireEvent.press(screen.getByTestId('recurring-landing-footer-cta'));
    expect(onOpenLive).toHaveBeenCalledTimes(2);
    expect(onSchedule).not.toHaveBeenCalled();
  });

  it('offers Book Recurring when live but given no booking to open', () => {
    const { onSchedule } = renderLanding({ cta: 'live' });
    expect(screen.queryByText('Recurring · Live')).toBeNull();
    fireEvent.press(screen.getByTestId('recurring-landing-tag'));
    expect(onSchedule).toHaveBeenCalledTimes(1);
  });

  it('opens the Cook Pool from "Make your Cook Pool", and only that', () => {
    const { onSchedule, onMakeCookPool } = renderLanding();
    fireEvent.press(screen.getByTestId('recurring-landing-cook-pool'));
    expect(onMakeCookPool).toHaveBeenCalledTimes(1);
    expect(onSchedule).not.toHaveBeenCalled();
  });

  it('parks the sticky footer out of reach until the tag has scrolled away', () => {
    renderLanding();
    const footer = screen.getByTestId('recurring-landing-footer', HIDDEN);
    expect(footer.props.pointerEvents).toBe('none');
    expect(footer.props.accessibilityElementsHidden).toBe(true);
  });

  it('opens with the footer in when it opens scrolled to the end', () => {
    renderScrolledLanding();
    const footer = screen.getByTestId('recurring-landing-footer');
    expect(footer.props.pointerEvents).toBe('auto');
    expect(footer.props.accessibilityElementsHidden).toBe(false);
  });
});

describe('the explainer video', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('opens the player from the card, playing from the start', () => {
    renderLanding();
    expect(screen.queryByTestId('recurring-landing-player')).toBeNull();
    fireEvent.press(screen.getByTestId('recurring-landing-explainer'));
    expect(screen.getByTestId('recurring-landing-player')).toBeTruthy();
    expect(screen.getByTestId('recurring-landing-player-elapsed').props.children).toBe('0:00');
    expect(screen.getByTestId('recurring-landing-player-total').props.children).toBe('1:17');
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.getByTestId('recurring-landing-player-elapsed').props.children).toBe('0:03');
  });

  it('opens at 0:38 when a preview asks, playing', () => {
    renderLanding({ initialPlayerAt: 38 });
    expect(screen.getByTestId('recurring-landing-player-elapsed').props.children).toBe('0:38');
    expect(screen.getByLabelText('Pause')).toBeTruthy();
  });

  it('pauses, plays, and skips 10 s each way', () => {
    renderLanding({ initialPlayerAt: 38 });
    fireEvent.press(screen.getByTestId('recurring-landing-player-toggle'));
    expect(screen.getByLabelText('Play')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByTestId('recurring-landing-player-elapsed').props.children).toBe('0:38');

    fireEvent.press(screen.getByTestId('recurring-landing-player-forward'));
    expect(screen.getByTestId('recurring-landing-player-elapsed').props.children).toBe('0:48');
    fireEvent.press(screen.getByTestId('recurring-landing-player-back'));
    fireEvent.press(screen.getByTestId('recurring-landing-player-back'));
    expect(screen.getByTestId('recurring-landing-player-elapsed').props.children).toBe('0:28');
  });

  it('seeks from a touch on the scrubber', () => {
    renderLanding({ initialPlayerAt: 0 });
    const scrubber = screen.getByTestId('recurring-landing-player-scrubber');
    fireEvent(scrubber, 'layout', { nativeEvent: { layout: { width: 300, height: 4 } } });
    fireEvent(scrubber, 'responderGrant', { nativeEvent: { locationX: 150 } });
    // Halfway along a 1:17 video.
    expect(screen.getByTestId('recurring-landing-player-elapsed').props.children).toBe('0:38');
  });

  it('is watched when the playhead reaches the end, and the page says so', () => {
    renderLanding({ initialPlayerAt: 72 });
    expect(screen.getByText('Plans, Visits, Cook Pool & more')).toBeTruthy();
    expect(screen.queryByText('Watched · Swipe to rewatch')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(6000);
    });

    // The player is gone, the card now reads that it was watched.
    expect(screen.queryByTestId('recurring-landing-player')).toBeNull();
    expect(screen.getByText('Plans, visits and more')).toBeTruthy();
    expect(screen.queryByText('Plans, Visits, Cook Pool & more')).toBeNull();
    expect(screen.getByText('Watched · Swipe to rewatch')).toBeTruthy();
    expect(
      screen.getByText('Under 2 mins · Covers Plans, Visits, Cook Pool and more!'),
    ).toBeTruthy();
  });

  it('is watched when it is scrubbed to the end', () => {
    renderLanding({ initialPlayerAt: 0 });
    const scrubber = screen.getByTestId('recurring-landing-player-scrubber');
    fireEvent(scrubber, 'layout', { nativeEvent: { layout: { width: 300, height: 4 } } });
    fireEvent(scrubber, 'responderGrant', { nativeEvent: { locationX: 300 } });
    expect(screen.getByText('Watched · Swipe to rewatch')).toBeTruthy();
  });

  it('is not watched when it is closed part-way', () => {
    renderLanding({ initialPlayerAt: 60 });
    fireEvent.press(screen.getByTestId('recurring-landing-player-handle'));
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(screen.queryByTestId('recurring-landing-player')).toBeNull();
    expect(screen.getByText('Tap to watch!')).toBeTruthy();
  });

  it('can be replayed once watched, from the start', () => {
    renderLanding({ initialWatched: true });
    expect(screen.getByText('Watched · Swipe to rewatch')).toBeTruthy();
    fireEvent.press(screen.getByTestId('recurring-landing-explainer'));
    expect(screen.getByTestId('recurring-landing-player-elapsed').props.children).toBe('0:00');
  });
});
