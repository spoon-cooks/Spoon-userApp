import { closedMessageFor, openingTimeLabel } from './data';

/**
 * R-INST-13: which Instant refusals mean "the hub is closed now", and the opening time stated.
 * Times are IST; the hub opens 06:00 and closes 21:00.
 */
const HUB = { timeZone: 'Asia/Kolkata', openLocalMinute: 360, closeLocalMinute: 1260 };

function istMs(hour: number, minute = 0): number {
  return Date.UTC(2026, 9, 29, hour, minute) - 330 * 60_000;
}

describe('closedMessageFor', () => {
  it('states today before opening', () => {
    expect(closedMessageFor('NO_PRESENT_COOK', HUB, istMs(5, 10))).toBe('Slots open at 6 AM today');
  });

  it('states tomorrow after closing', () => {
    expect(closedMessageFor('NO_PRESENT_COOK', HUB, istMs(22, 0))).toBe(
      'Slots open at 6 AM tomorrow',
    );
  });

  it('treats OUTSIDE_OPERATING_HOURS inside the window as tomorrow (the job cannot fit today)', () => {
    expect(closedMessageFor('OUTSIDE_OPERATING_HOURS', HUB, istMs(20, 30))).toBe(
      'Slots open at 6 AM tomorrow',
    );
  });

  it('does not call NO_PRESENT_COOK closed while the hub is open', () => {
    expect(closedMessageFor('NO_PRESENT_COOK', HUB, istMs(12, 0))).toBeNull();
  });

  it('never invents a time without the hub hours, and ignores other reasons', () => {
    expect(closedMessageFor('OUTSIDE_OPERATING_HOURS', null, istMs(5, 0))).toBeNull();
    expect(closedMessageFor('CAPACITY_EXHAUSTED', HUB, istMs(5, 0))).toBeNull();
    expect(closedMessageFor(undefined, HUB, istMs(5, 0))).toBeNull();
  });
});

describe('openingTimeLabel', () => {
  it('formats whole and part hours', () => {
    expect(openingTimeLabel(360)).toBe('6 AM');
    expect(openingTimeLabel(390)).toBe('6:30 AM');
    expect(openingTimeLabel(720)).toBe('12 PM');
    expect(openingTimeLabel(0)).toBe('12 AM');
  });
});
