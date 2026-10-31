import { formatMinutes } from './minutes';

describe('formatMinutes', () => {
  it('says "min" for one minute and "mins" otherwise', () => {
    expect(formatMinutes(1)).toBe('1 min');
    expect(formatMinutes(0)).toBe('0 mins');
    expect(formatMinutes(4)).toBe('4 mins');
    expect(formatMinutes(95)).toBe('95 mins');
  });
});
