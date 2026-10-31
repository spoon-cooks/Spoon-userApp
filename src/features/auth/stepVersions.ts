import { useMe } from './api';

/**
 * Which version of the profile steps and the address steps this build asks (owner, 31 Oct 2026).
 *
 * Every customer who saved a profile or an address before these steps changed goes through them
 * again once: V0 records the version each save came from, reports `profileUpdateRequired` and an
 * address's `detailsVersion`, and the gates at `/` and on Home send the customer back through the
 * steps until both are current. Kept in step with V0's `CURRENT_PROFILE_FLOW_VERSION` and
 * `CURRENT_ADDRESS_DETAILS_VERSION`; raise both together to ask everyone again.
 */
export const PROFILE_STEPS_VERSION = 2;
export const ADDRESS_STEPS_VERSION = 2;

/**
 * Whether the backend records step versions, so a save may carry one. V0 refuses a request key it
 * does not know, so a build that reaches a V0 without them must not send the version; the
 * `profileUpdateRequired` flag on `GET /v1/me` is how the app can tell.
 */
export function useStepVersionsSupported(): boolean {
  const me = useMe();
  return me.state.status === 'ready' && me.state.data.profileUpdateRequired !== undefined;
}
