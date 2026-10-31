import {
  SKIP_SECONDS,
  VIDEO_DURATION_SECONDS,
  advance,
  clampPosition,
  formatClock,
  hasEnded,
  positionAt,
  progressOf,
  skipBy,
} from './playback';

describe('formatClock', () => {
  it('draws m:ss with the minutes unpadded', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(60)).toBe('1:00');
    expect(formatClock(112)).toBe('1:52');
    expect(formatClock(VIDEO_DURATION_SECONDS)).toBe('1:17');
  });

  it('drops a fraction of a second and never goes negative', () => {
    expect(formatClock(112.9)).toBe('1:52');
    expect(formatClock(-5)).toBe('0:00');
    expect(formatClock(Number.NaN)).toBe('0:00');
  });
});

describe('the playhead', () => {
  it('stays inside the video', () => {
    expect(clampPosition(-3, 225)).toBe(0);
    expect(clampPosition(300, 225)).toBe(225);
    expect(clampPosition(Number.NaN, 225)).toBe(0);
  });

  it('skips 10 s either way and stops at the ends', () => {
    expect(SKIP_SECONDS).toBe(10);
    expect(skipBy(112, SKIP_SECONDS, 225)).toBe(122);
    expect(skipBy(112, -SKIP_SECONDS, 225)).toBe(102);
    expect(skipBy(4, -SKIP_SECONDS, 225)).toBe(0);
    expect(skipBy(220, SKIP_SECONDS, 225)).toBe(225);
  });

  it('plays forward by the time elapsed, to the end and no further', () => {
    expect(advance(10, 0.25, 225)).toBe(10.25);
    expect(advance(224.9, 5, 225)).toBe(225);
    expect(advance(10, -5, 225)).toBe(10);
  });

  it('reports its progress through the video', () => {
    expect(progressOf(0, 225)).toBe(0);
    expect(progressOf(112.5, 225)).toBe(0.5);
    expect(progressOf(400, 225)).toBe(1);
    expect(progressOf(10, 0)).toBe(0);
  });
});

describe('the scrubber', () => {
  it('turns a touch on the track into a position', () => {
    expect(positionAt(0, 300, 225)).toBe(0);
    expect(positionAt(150, 300, 225)).toBe(112.5);
    expect(positionAt(300, 300, 225)).toBe(225);
  });

  it('takes a touch past either end as that end', () => {
    expect(positionAt(-20, 300, 225)).toBe(0);
    expect(positionAt(340, 300, 225)).toBe(225);
  });

  it('has nowhere to seek before the track has a width', () => {
    expect(positionAt(100, 0, 225)).toBe(0);
  });
});

describe('watched', () => {
  it('is reached at the end, played there or scrubbed there, and not before', () => {
    expect(hasEnded(224.75, 225)).toBe(false);
    expect(hasEnded(225, 225)).toBe(true);
    expect(hasEnded(advance(224.9, 1, 225), 225)).toBe(true);
    expect(hasEnded(positionAt(300, 300, 225), 225)).toBe(true);
    expect(hasEnded(skipBy(220, SKIP_SECONDS, 225), 225)).toBe(true);
  });

  it('needs a video that has a length', () => {
    expect(hasEnded(0, 0)).toBe(false);
  });
});
