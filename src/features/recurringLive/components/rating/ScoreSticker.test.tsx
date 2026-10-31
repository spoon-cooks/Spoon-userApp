import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ScoreSticker } from './ScoreSticker';

/** The numeral sits centred across its blob, not the 96pt sticker (device test, 31 Oct 2026). */
const numeralCentreX = () => {
  const style = StyleSheet.flatten(screen.getByTestId('sticker-numeral').props.style) as {
    left: number;
    width: number;
  };
  return style.left + style.width / 2;
};

describe('ScoreSticker', () => {
  it.each([
    ['veryPoor', 1, 39],
    ['veryPoor', 1.5, 39],
    ['disappointing', 2.5, 44],
    ['belowPar', 3, 43.5],
  ] as const)('centres %s %s on its blob', (tier, value, blobCentreX) => {
    render(<ScoreSticker tier={tier} value={value} testID="sticker" />);
    expect(numeralCentreX()).toBe(blobCentreX);
  });

  it('keeps a score without a blob centred on the sticker', () => {
    render(<ScoreSticker tier="loved" value={4.5} testID="sticker" />);
    expect(numeralCentreX()).toBe(48);
  });
});
