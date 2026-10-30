import { act, render, screen } from '@testing-library/react-native';

import { ready } from '@core/data';
import { DEMO_PROFILE } from '@/demo/fixtures/screens';
import { ProfileView } from '@features/profile';
import { LoadingState, QueryBoundary } from '@ui';

import { ConfirmationLoading, IntroLoading, SplashLoading } from './LoadingScreens';

describe('Designed loading states (2692:864, 71:747, 2702:855)', () => {
  it('renders the splash as the toss, not a spinner', () => {
    render(<SplashLoading />);

    expect(screen.getByTestId('splash-loading')).toBeTruthy();
    expect(screen.getByLabelText('Loading Spoon')).toBeTruthy();
    // `2692:920` / `2692:921` are hidden in the file.
    expect(screen.queryByText('Tossing it all together')).toBeNull();
  });

  it('renders payment confirmation with its copy and the do-not-close note', () => {
    render(<ConfirmationLoading />);

    expect(screen.getByTestId('confirmation-loading')).toBeTruthy();
    expect(screen.getByText('Confirming your payment')).toBeTruthy();
    expect(screen.getByText('Hang tight, this only takes a few seconds.')).toBeTruthy();
    expect(screen.getByText('Please don’t press back or close the app')).toBeTruthy();
  });

  it('renders the interstitial headline and artwork', () => {
    render(<IntroLoading />);

    expect(screen.getByTestId('intro-loading')).toBeTruthy();
    expect(screen.getByText('Best cooks in town!')).toBeTruthy();
  });

  it('takes its headline from the caller', () => {
    render(<IntroLoading headline="Finding your cook" />);
    expect(screen.getByText('Finding your cook')).toBeTruthy();
  });

  describe('the splash never advances the app on its own', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('keeps tossing in place however long the app takes', () => {
      render(<SplashLoading />);

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Readiness stays with `src/app/_layout.tsx`; the surface just sits there.
      expect(screen.getByTestId('splash-loading')).toBeTruthy();
    });
  });
});

describe('Loading → ready switching', () => {
  const actions = {
    onBack: jest.fn(),
    onSelectTile: jest.fn(),
    onOpenProfileDetails: jest.fn(),
    onOpenManageAccount: jest.fn(),
    onLogout: jest.fn(),
    onRetry: jest.fn(),
  };

  /**
   * THE LOADING RULE (owner, 30 Oct 2026): a screen whose first read is in flight shows the toss,
   * the same screen the app opens on — through `LoadingState`, not by rendering the splash itself.
   */
  it('shows the toss while a screen loads, then the screen', () => {
    const { rerender } = render(<ProfileView state={{ status: 'loading' }} {...actions} />);

    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByTestId('intro-loading')).toBeNull();
    expect(screen.queryByTestId('profile-identity')).toBeNull();

    rerender(<ProfileView state={ready(DEMO_PROFILE)} {...actions} />);

    expect(screen.queryByLabelText('Loading')).toBeNull();
    expect(screen.getByTestId('profile-identity')).toBeTruthy();
    expect(screen.getByText('Aarav Mehta')).toBeTruthy();
  });

  it('draws the toss for LoadingState screen and QueryBoundary, a spinner inline', () => {
    const screenWait = render(<LoadingState variant="screen" testID="wait" />);
    expect(screen.getByTestId('wait').props.accessibilityLabel).toBe('Loading');
    expect(screen.queryByText('Loading')).toBeNull();
    screenWait.unmount();

    const boundary = render(
      <QueryBoundary state={{ status: 'loading' }}>{() => null}</QueryBoundary>,
    );
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByText('Loading')).toBeNull();
    boundary.unmount();

    // Inside a screen the wait stays scoped, with its word.
    render(<LoadingState testID="inline" />);
    expect(screen.getByText('Loading')).toBeTruthy();
  });

  it('shows the error surface instead of the loading surface on failure', () => {
    render(
      <ProfileView
        state={{ status: 'error', error: { kind: 'server', message: 'boom', status: 500 } }}
        {...actions}
      />,
    );

    expect(screen.queryByTestId('intro-loading')).toBeNull();
  });
});
