import { render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import { FullScreenLoadingHost, FullScreenLoadingProvider } from './FullScreenLoading';
import { LoadingState } from './LoadingState';

/** A screen's full-screen wait is drawn by the root host, over the whole window (31 Oct 2026). */
function App({ waiting }: { readonly waiting: boolean }) {
  return (
    <View>
      {/* A screen's padded frame, as `Screen` draws it. */}
      <View style={{ padding: 16 }}>
        {waiting ? <LoadingState variant="screen" testID="screen-wait" /> : null}
      </View>
      <FullScreenLoadingHost />
    </View>
  );
}

describe('the full-screen wait', () => {
  it('is drawn by the root host while a screen waits, and gone once it stops', () => {
    const { rerender } = render(<App waiting />);
    expect(screen.getByTestId('full-screen-loading')).toBeTruthy();
    // The screen only holds its place; the toss is not drawn inside its padded frame.
    expect(screen.getByTestId('screen-wait').props.children).toBeUndefined();

    rerender(<App waiting={false} />);
    expect(screen.queryByTestId('full-screen-loading')).toBeNull();
  });

  it('never draws the toss inside a screen, not even on the first render, under the provider', () => {
    // The host alone registers in an effect, after the screens' first render; the provider says
    // it is there from the start, so a launch wait never shows an inset toss for a frame.
    const Probe = () => <LoadingState variant="screen" testID="screen-wait" />;
    render(
      <FullScreenLoadingProvider>
        <View style={{ padding: 16 }}>
          <Probe />
        </View>
      </FullScreenLoadingProvider>,
    );
    expect(screen.getByTestId('full-screen-loading')).toBeTruthy();
    expect(screen.getByTestId('screen-wait').props.children).toBeUndefined();
    expect(screen.queryAllByLabelText(/Loading/).length).toBeLessThanOrEqual(1);
  });

  it('draws the toss in place when there is no host', () => {
    render(<LoadingState variant="screen" testID="screen-wait" />);
    expect(screen.queryByTestId('full-screen-loading')).toBeNull();
    expect(screen.getByTestId('screen-wait')).toBeTruthy();
  });
});
