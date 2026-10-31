import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ExplainerPlayer } from './components/ExplainerPlayer';
import { RecurringLandingScreen } from './screens/RecurringLandingScreen';

/**
 * The explainer with a real video (`expo-video`, faked here by a player that records what the
 * sheet asks of it and lets the test send it the events the real one would). What a transport
 * button does to a playhead is `playback.test.ts`; this is what the sheet does with a VIDEO's
 * position, length, end and failure — and that a build without the native module still opens.
 */
jest.mock('react-native-worklets', () =>
  jest.requireActual('react-native-worklets/lib/module/mock'),
);
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));

type Listener = (payload: Record<string, unknown>) => void;

class FakePlayer {
  duration = 0;
  playing = false;
  currentTime = 0;
  timeUpdateEventInterval = 0;
  readonly play = jest.fn(() => {
    this.playing = true;
    this.emit('playingChange', { isPlaying: true });
  });
  readonly pause = jest.fn(() => {
    this.playing = false;
    this.emit('playingChange', { isPlaying: false });
  });
  private listeners = new Map<string, Set<Listener>>();

  addListener(event: string, listener: Listener) {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
    return { remove: () => set.delete(listener) };
  }

  emit(event: string, payload: Record<string, unknown> = {}) {
    act(() => {
      this.listeners.get(event)?.forEach((listener) => listener(payload));
    });
  }
}

let mockPlayer: FakePlayer;
let mockSources: unknown[];
let mockModuleAvailable = true;

jest.mock('./expoVideo', () => {
  const { View } = jest.requireActual('react-native');
  return {
    loadExpoVideo: () =>
      mockModuleAvailable
        ? {
            useVideoPlayer: (
              source: unknown,
              setup?: (instance: FakePlayer) => void,
            ): FakePlayer => {
              if (!mockSources.includes(source)) {
                mockSources.push(source);
                setup?.(mockPlayer);
              }
              return mockPlayer;
            },
            VideoView: (props: Record<string, unknown>) => (
              <View testID="fake-video-view" {...props} />
            ),
          }
        : null,
  };
});

const SOURCE = { uri: 'https://videos.example.com/recurring.mp4' };

function renderPlayer(props: Partial<Parameters<typeof RecurringLandingScreen>[0]> = {}) {
  const handlers = { onBack: jest.fn(), onSchedule: jest.fn(), onMakeCookPool: jest.fn() };
  render(
    <RecurringLandingScreen {...handlers} videoSource={SOURCE} initialPlayerAt={0} {...props} />,
  );
  return handlers;
}

const elapsed = () => screen.getByTestId('recurring-landing-player-elapsed').props.children;
const total = () => screen.getByTestId('recurring-landing-player-total').props.children;

beforeEach(() => {
  jest.useFakeTimers();
  mockPlayer = new FakePlayer();
  mockSources = [];
  mockModuleAvailable = true;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Explainer with a video', () => {
  it('plays the URL it is given, from the start, with no native controls', () => {
    renderPlayer();

    expect(mockSources).toEqual([SOURCE.uri]);
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    expect(mockPlayer.timeUpdateEventInterval).toBeGreaterThan(0);
    const view = screen.getByTestId('fake-video-view');
    expect(view.props.nativeControls).toBe(false);
    expect(view.props.contentFit).toBe('contain');
  });

  it('starts where a preview asks', () => {
    renderPlayer({ initialPlayerAt: 112 });

    expect(mockPlayer.currentTime).toBe(112);
    expect(elapsed()).toBe('1:52');
  });

  it('follows the video: its position, and its length once it has loaded', () => {
    renderPlayer();
    // Until it loads, the length is the one the page was given (3:45).
    expect(total()).toBe('3:45');

    mockPlayer.emit('sourceLoad', { duration: 130 });
    expect(total()).toBe('2:10');

    mockPlayer.emit('timeUpdate', { currentTime: 47.6 });
    expect(elapsed()).toBe('0:47');
  });

  it('pauses and plays the video, and shows which it is doing', () => {
    renderPlayer();
    expect(screen.getByLabelText('Pause')).toBeTruthy();

    fireEvent.press(screen.getByTestId('recurring-landing-player-toggle'));
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Play')).toBeTruthy();

    fireEvent.press(screen.getByTestId('recurring-landing-player-toggle'));
    expect(mockPlayer.play).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Pause')).toBeTruthy();
  });

  it('seeks the video 10 s each way, and stops at the ends', () => {
    renderPlayer();
    mockPlayer.emit('sourceLoad', { duration: 100 });
    mockPlayer.emit('timeUpdate', { currentTime: 30 });

    fireEvent.press(screen.getByTestId('recurring-landing-player-forward'));
    expect(mockPlayer.currentTime).toBe(40);
    expect(elapsed()).toBe('0:40');

    fireEvent.press(screen.getByTestId('recurring-landing-player-back'));
    fireEvent.press(screen.getByTestId('recurring-landing-player-back'));
    fireEvent.press(screen.getByTestId('recurring-landing-player-back'));
    fireEvent.press(screen.getByTestId('recurring-landing-player-back'));
    expect(mockPlayer.currentTime).toBe(0);
  });

  it('seeks the video from a touch on the scrubber', () => {
    renderPlayer();
    mockPlayer.emit('sourceLoad', { duration: 200 });
    const scrubber = screen.getByTestId('recurring-landing-player-scrubber');
    fireEvent(scrubber, 'layout', { nativeEvent: { layout: { width: 300, height: 4 } } });

    fireEvent(scrubber, 'responderGrant', { nativeEvent: { locationX: 150 } });

    expect(mockPlayer.currentTime).toBe(100);
    expect(elapsed()).toBe('1:40');
  });

  it('is watched when the video plays to its end, and the page says so', () => {
    renderPlayer();
    expect(screen.queryByText('Watched · Swipe to rewatch')).toBeNull();

    mockPlayer.emit('playToEnd');
    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(screen.getByText('Watched · Swipe to rewatch')).toBeTruthy();
  });

  it('is watched when the playhead is scrubbed to the end, too', () => {
    renderPlayer();
    mockPlayer.emit('sourceLoad', { duration: 200 });
    const scrubber = screen.getByTestId('recurring-landing-player-scrubber');
    fireEvent(scrubber, 'layout', { nativeEvent: { layout: { width: 300, height: 4 } } });

    fireEvent(scrubber, 'responderGrant', { nativeEvent: { locationX: 300 } });
    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(screen.getByText('Watched · Swipe to rewatch')).toBeTruthy();
  });

  it('starts again from the top when play is pressed at the end', () => {
    // On its own: the page closes the player once the video is watched.
    render(<ExplainerPlayer source={SOURCE} onEnded={jest.fn()} onClose={jest.fn()} />);
    mockPlayer.emit('sourceLoad', { duration: 100 });
    mockPlayer.emit('playToEnd');

    fireEvent.press(screen.getByTestId('explainer-player-toggle'));

    expect(mockPlayer.currentTime).toBe(0);
    expect(mockPlayer.play).toHaveBeenCalledTimes(2);
  });

  it('says so when the video will not load, and does not call it watched', () => {
    renderPlayer();
    expect(screen.queryByText(/couldn.t load the video/)).toBeNull();

    mockPlayer.emit('statusChange', { status: 'error' });

    expect(screen.getByText(/couldn.t load the video/)).toBeTruthy();
    expect(screen.queryByText('Watched · Swipe to rewatch')).toBeNull();

    mockPlayer.emit('statusChange', { status: 'readyToPlay' });
    expect(screen.queryByText(/couldn.t load the video/)).toBeNull();
  });
});

describe('Explainer without the native module', () => {
  it('still opens: the placeholder plays a clock instead of a video', () => {
    mockModuleAvailable = false;
    renderPlayer();

    expect(screen.queryByTestId('fake-video-view')).toBeNull();
    expect(screen.getByTestId('explainer-player-surface')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(elapsed()).toBe('0:03');
  });
});
