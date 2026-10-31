import { serviceWindowOf } from './serviceWindow';

/** The times a visit shows: the booked slot, then the start OTP's, then the end OTP's. */
describe('serviceWindowOf', () => {
  const booked = { bookedStart: '2026-10-14T03:30:00.000Z', durationMinutes: 60 };

  it('shows the booked slot until the start OTP', () => {
    expect(serviceWindowOf(booked)).toEqual({
      start: '2026-10-14T03:30:00.000Z',
      end: '2026-10-14T04:30:00.000Z',
      phase: 'booked',
    });
    expect(
      serviceWindowOf({
        ...booked,
        timing: { actualStart: null, expectedEnd: null, actualEnd: null },
      }).phase,
    ).toBe('booked');
  });

  it('shows the start OTP time and the end it runs to, extensions included', () => {
    // Started 8 minutes early; a 30-minute extension moved the end.
    expect(
      serviceWindowOf({
        ...booked,
        timing: {
          actualStart: '2026-10-14T03:22:00.000Z',
          expectedEnd: '2026-10-14T04:52:00.000Z',
          actualEnd: null,
        },
      }),
    ).toEqual({
      start: '2026-10-14T03:22:00.000Z',
      end: '2026-10-14T04:52:00.000Z',
      phase: 'started',
    });
  });

  it('shows the start and end OTP times once it has ended', () => {
    expect(
      serviceWindowOf({
        ...booked,
        timing: {
          actualStart: '2026-10-14T03:40:00.000Z',
          expectedEnd: '2026-10-14T04:40:00.000Z',
          actualEnd: '2026-10-14T04:38:00.000Z',
        },
      }),
    ).toEqual({
      start: '2026-10-14T03:40:00.000Z',
      end: '2026-10-14T04:38:00.000Z',
      phase: 'ended',
    });
  });

  it('has no time for an Instant visit until it starts', () => {
    expect(serviceWindowOf({ bookedStart: null, durationMinutes: 60 })).toEqual({
      start: null,
      end: null,
      phase: 'booked',
    });
  });
});
