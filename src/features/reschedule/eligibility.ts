/**
 * Reschedule eligibility — ruling R-3.
 *
 * "Do not independently infer eligibility on the client if the backend exposes authoritative
 * action/eligibility state." The cap itself is the server's: up to 10 reschedules per booking
 * (DEC-112; it was once).
 *
 * This module exists to make that rule impossible to violate by accident. It is a rendering
 * policy, not business logic: it reads a value the server supplies and fails CLOSED.
 *
 * The client must never derive eligibility from a reschedule count, a booking timestamp, a
 * status string or anything else it can see.
 */

/**
 * @param serverEligibility the authoritative flag as supplied by the backend.
 *        `undefined` means "the server did not say" — which hides the option.
 */
export function canOfferReschedule(serverEligibility: boolean | undefined): boolean {
  return serverEligibility === true;
}
