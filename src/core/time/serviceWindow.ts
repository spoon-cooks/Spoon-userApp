/**
 * The start and end a visit's screens show (owner, 31 Oct 2026).
 *
 * A cook may start a visit up to 15 minutes early or 10 late against the booked slot, so once she
 * has started, the booked times are no longer when the visit happens. Every screen that shows a
 * visit's time reads it here:
 *
 *   before the start OTP   the booked slot: its start, and that plus the booked duration
 *   after the start OTP    when the start OTP was entered, and the end the session runs to
 *                          (`expectedEnd`: that plus the duration and any extension)
 *   after the end OTP      when the start OTP was entered, and when the end OTP was entered
 *
 * The times come from the server (`timing`); nothing here is measured on the phone. Rules that are
 * about the slot the customer booked — cancellation fee windows, reschedule eligibility, the
 * cook's arrival promise, ordering lists — keep reading the booked start, not this.
 */

export interface ServiceTiming {
  readonly actualStart: string | null;
  readonly expectedEnd: string | null;
  readonly actualEnd: string | null;
}

export interface ServiceWindow {
  /** ISO instant, or null for an Instant visit not started yet (it has no booked time). */
  readonly start: string | null;
  readonly end: string | null;
  /** Which of the three the times are. */
  readonly phase: 'booked' | 'started' | 'ended';
}

export function serviceWindowOf(input: {
  /** The booked slot's start; null for an Instant visit. */
  readonly bookedStart: string | null;
  readonly durationMinutes: number;
  /** Absent or null from a server that does not send it: the booked slot is shown. */
  readonly timing?: ServiceTiming | null | undefined;
}): ServiceWindow {
  const timing = input.timing ?? null;
  if (timing !== null && timing.actualStart !== null) {
    const end =
      timing.actualEnd ??
      timing.expectedEnd ??
      plusMinutes(timing.actualStart, input.durationMinutes);
    return {
      start: timing.actualStart,
      end,
      phase: timing.actualEnd === null ? 'started' : 'ended',
    };
  }
  return {
    start: input.bookedStart,
    end: input.bookedStart === null ? null : plusMinutes(input.bookedStart, input.durationMinutes),
    phase: 'booked',
  };
}

function plusMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}
