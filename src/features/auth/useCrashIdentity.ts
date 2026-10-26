import { useEffect } from 'react';

import { crashReporter } from '@core/crash';

import { useMe } from './api';

/**
 * Names the signed-in customer to crash reporting -- by account id only.
 *
 * The id is the backend's opaque `GET /v1/me` id, the same one support finds a customer by. Never
 * the phone number, name or address: a crash report leaves the device and sits in Firebase, so it
 * carries exactly enough to look an account up on our side and nothing a stranger could use.
 * (`core/crash` also refuses anything shaped like a phone number or e-mail.)
 *
 * `enabled` must be false until a session exists. `/me` fired during bootstrap, or for a guest,
 * would 401 and burn a refresh -- the same reason `useMe` takes the option. When the shell goes
 * away (sign-out, session expiry) the effect's cleanup forgets the id, and the session
 * controller's `onSessionCleared` does the same from the other side.
 *
 * Shares `useMe`'s cache entry with Home and Profile, so this costs no request of its own once
 * either has loaded it.
 */
export function useCrashIdentity(enabled: boolean): void {
  const me = useMe({ enabled });
  const id = me.state.status === 'ready' ? me.state.data.id : null;

  useEffect(() => {
    if (id === null) return undefined;
    crashReporter.setUser(id);
    return () => crashReporter.clearUser();
  }, [id]);
}
