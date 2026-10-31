import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { RateVisitCard } from './RateVisitCard';
import type { RateVisitSubmission } from './RateVisitCard';

// An older build: none of the media modules are in it.
jest.mock('@core/native', () => ({
  loadExpoAudio: () => null,
  loadExpoCamera: () => null,
  loadExpoFileSystem: () => null,
  loadExpoImageManipulator: () => null,
  loadExpoImagePicker: () => null,
  loadExpoVideo: () => null,
  loadVideoCompressor: () => null,
}));

const VISIT = {
  title: 'Lunch with Cook Asha',
  meta: 'Sun, 12 Apr · 1:15 PM · 1 hr',
  cookName: 'Asha',
  photoUri: null,
};

/**
 * The rate card on the "Ratings" page (`1603:50`), on a build without the camera, microphone and
 * picker modules (mocked above): it offers words only, and must still work.
 */
describe('Rate card (Figma 1603:50)', () => {
  it('draws the Rated card with its feedback block and a plain Submit', () => {
    render(<RateVisitCard live visit={VISIT} initialRating={4.5} />);
    expect(screen.getByText('Loved it!')).toBeTruthy();
    expect(screen.getByText('Tell Asha what made it special')).toBeTruthy();
    expect(screen.getByText('A 10-sec voice note means more to her than stars')).toBeTruthy();
    expect(screen.getByText('Submit')).toBeTruthy();
    // Below 4 only.
    expect(screen.queryByTestId('rate-visit-card-support')).toBeNull();
  });

  it('reads "What made it amazing?" on 5+', () => {
    render(<RateVisitCard live visit={VISIT} initialRating="5+" />);
    expect(screen.getByText('Off the charts!')).toBeTruthy();
    expect(screen.getByText('What made it amazing?')).toBeTruthy();
  });

  it('hands up the poor band’s chips, the written note and "a different cook"', () => {
    const onSubmit = jest.fn<void, [RateVisitSubmission]>();
    render(<RateVisitCard live visit={VISIT} initialRating={2.5} onSubmit={onSubmit} />);
    expect(screen.getByText('We’re so sorry')).toBeTruthy();
    expect(screen.getByText('Show us what went wrong')).toBeTruthy();

    fireEvent.press(screen.getByTestId('rate-visit-card-chip-slow'));
    fireEvent.press(screen.getByTestId('rate-visit-card-support-toggle'));
    fireEvent.press(screen.getByTestId('rate-visit-card-feedback-write'));
    fireEvent.changeText(
      screen.getByTestId('rate-visit-card-feedback-input'),
      'Sabzi was a little salty',
    );
    fireEvent.press(screen.getByTestId('rate-visit-card-submit'));

    expect(onSubmit).toHaveBeenCalledWith({
      rating: 2.5,
      chips: ['slow'],
      avoidCook: true,
      feedback: { voice: null, media: [], text: 'Sabzi was a little salty' },
    });
  });

  it('flips "a different cook" from the toggle only, not its icon or copy', () => {
    render(<RateVisitCard live visit={VISIT} initialRating={1.5} />);
    const toggle = screen.getByTestId('rate-visit-card-support-toggle');
    fireEvent.press(screen.getByTestId('rate-visit-card-support'));
    fireEvent.press(screen.getByText('Prefer a different cook next time?'));
    expect(toggle.props.accessibilityState).toMatchObject({ checked: false });
    fireEvent.press(toggle);
    expect(
      screen.getByTestId('rate-visit-card-support-toggle').props.accessibilityState,
    ).toMatchObject({ checked: true });
  });

  it('fills a star’s first half on one tap and its second half on the next, however late', () => {
    jest.useFakeTimers();
    const onRatingChange = jest.fn();
    render(<RateVisitCard live visit={VISIT} onRatingChange={onRatingChange} />);
    fireEvent.press(screen.getByTestId('rate-visit-card-stars-star-4'));
    expect(onRatingChange).toHaveBeenLastCalledWith(3.5);
    // Long after any double-tap window, the same star still takes its second half.
    act(() => jest.advanceTimersByTime(5_000));
    fireEvent.press(screen.getByTestId('rate-visit-card-stars-star-4'));
    expect(onRatingChange).toHaveBeenLastCalledWith(4);
    // Again: back to half. Another star starts at its own first half.
    fireEvent.press(screen.getByTestId('rate-visit-card-stars-star-4'));
    expect(onRatingChange).toHaveBeenLastCalledWith(3.5);
    fireEvent.press(screen.getByTestId('rate-visit-card-stars-star-2'));
    expect(onRatingChange).toHaveBeenLastCalledWith(1.5);
    jest.useRealTimers();
  });

  it('stays in place read-only once sent: banner, picked chips, the note, no Submit (2306:929)', () => {
    const view = render(
      <RateVisitCard live visit={VISIT} initialRating={4.5} onSubmit={jest.fn()} />,
    );
    fireEvent.press(screen.getByTestId('rate-visit-card-chip-taste'));
    fireEvent.press(screen.getByTestId('rate-visit-card-feedback-write'));
    fireEvent.changeText(screen.getByTestId('rate-visit-card-feedback-input'), 'Roti was soft.');

    view.rerender(
      <RateVisitCard live visit={VISIT} initialRating={4.5} onSubmit={jest.fn()} submitted />,
    );

    expect(screen.getByText('Rating submitted')).toBeTruthy();
    expect(screen.getByText('Thanks for the feedback!')).toBeTruthy();
    expect(screen.getByText('Asha will see your rating and note after the visit.')).toBeTruthy();
    expect(screen.getByText('What stood out')).toBeTruthy();
    expect(screen.getByTestId('rate-visit-card-chip-taste')).toBeTruthy();
    expect(screen.queryByTestId('rate-visit-card-chip-onTime')).toBeNull();
    expect(screen.getByText('Your note to Asha')).toBeTruthy();
    expect(screen.getByText('Roti was soft.')).toBeTruthy();
    expect(screen.queryByTestId('rate-visit-card-submit')).toBeNull();
    expect(screen.queryByTestId('rate-visit-card-feedback-write')).toBeNull();
    // The stars take no taps.
    fireEvent.press(screen.getByTestId('rate-visit-card-stars-star-2'));
    expect(screen.getByText('4.5')).toBeTruthy();
  });

  it('reads back a low score to the Spoon team once sent (2513:1798 Mood=Bad)', () => {
    render(
      <RateVisitCard live visit={VISIT} initialRating={2} submitted initialChips={['slow']} />,
    );
    expect(screen.getByText('We’re so sorry')).toBeTruthy();
    expect(
      screen.getByText('Our team is looking into this and will get back to you.'),
    ).toBeTruthy();
    expect(screen.getByText('What went wrong')).toBeTruthy();
    expect(screen.getByTestId('rate-visit-card-chip-slow')).toBeTruthy();
    // Nothing left to answer: no "a different cook" toggle once sent.
    expect(screen.queryByTestId('rate-visit-card-support')).toBeNull();
  });

  it('draws no note block when nothing was added, and no chips label without chips', () => {
    render(<RateVisitCard live visit={VISIT} initialRating={4} submitted initialChips={[]} />);
    expect(screen.getByText('Rating submitted')).toBeTruthy();
    expect(screen.getByText('Thanks for the feedback!')).toBeTruthy();
    expect(screen.queryByText('What stood out')).toBeNull();
    expect(screen.queryByText('Your note to Asha')).toBeNull();
  });

  it('offers only Write on a build without the camera, microphone and picker', () => {
    render(<RateVisitCard live visit={VISIT} initialRating={4} />);
    expect(screen.getByTestId('rate-visit-card-feedback-write')).toBeTruthy();
    expect(screen.queryByTestId('rate-visit-card-feedback-voice')).toBeNull();
    expect(screen.queryByTestId('rate-visit-card-feedback-media')).toBeNull();
  });
});
