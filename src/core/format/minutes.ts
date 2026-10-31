/**
 * A count of minutes as the app writes it: "1 min", otherwise "N mins" ("0 mins", "4 mins").
 *
 * For figures the app counts itself against a server instant (an arrival estimate, time left,
 * time over), so the number, and with it the word, changes from one minute to the next. Before
 * 31 Oct 2026 these were written "N mins" flat, which read "1 mins".
 */
export function formatMinutes(minutes: number): string {
  return `${String(minutes)} ${minutes === 1 ? 'min' : 'mins'}`;
}
