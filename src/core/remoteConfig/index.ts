import { fetchAndActivate, getRemoteConfig, getString } from '@react-native-firebase/remote-config';

import type { AppEnv } from '@core/config';

/**
 * Firebase Remote Config, read the same way by every feature that is set from the console without
 * a release (the update gate, the Recurring explainer video).
 *
 * ## One Firebase project, separate keys per environment
 *
 * Every build — staging and production alike — reads the same Firebase project, so a value set
 * for testing would otherwise reach real customers. Production reads a parameter's name exactly as
 * written; any other environment reads it with its own prefix (`staging_…`, `development_…`), so a
 * test value can only ever be seen by builds of that environment.
 */

/**
 * How stale a fetch may be before the SDK asks the network again.
 *
 * Firebase throttles a client to a handful of real fetches an hour, and a call inside the window
 * is answered from cache rather than failing — so asking often is safe. Fifteen minutes is how
 * soon a console change reaches someone with the app open; development gets 0 so a change shows
 * at once.
 */
const MIN_FETCH_INTERVAL_MS = __DEV__ ? 0 : 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

/** `min_app_version_ios` in production; `staging_min_app_version_ios` in staging; and so on. */
export function parameterName(base: string, appEnv: AppEnv): string {
  return appEnv === 'production' ? base : `${appEnv}_${base}`;
}

function valueOf(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The named parameters for this environment, a blank or unset one as `null`. `null` as a whole
 * when Remote Config could not be reached or read: the caller then falls back to its own default.
 */
export async function readRemoteStrings<K extends string>(
  bases: readonly K[],
  appEnv: AppEnv,
): Promise<Readonly<Record<K, string | null>> | null> {
  try {
    const remoteConfig = getRemoteConfig();
    remoteConfig.settings = {
      minimumFetchIntervalMillis: MIN_FETCH_INTERVAL_MS,
      fetchTimeoutMillis: FETCH_TIMEOUT_MS,
    };
    await fetchAndActivate(remoteConfig);
    const values = {} as Record<K, string | null>;
    for (const base of bases) {
      values[base] = valueOf(getString(remoteConfig, parameterName(base, appEnv)));
    }
    return values;
  } catch {
    return null;
  }
}
