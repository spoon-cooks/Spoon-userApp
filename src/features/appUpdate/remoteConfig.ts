import type { AppEnv } from '@core/config';
import { readRemoteStrings } from '@core/remoteConfig';

export { parameterName } from '@core/remoteConfig';

/**
 * The update policy, read from Firebase Remote Config.
 *
 * Changing it needs no release: edit the parameters in the Firebase console and publish. The
 * parameters are per platform because the two stores approve a build at different times, and a
 * minimum raised for one before it is live there would block customers with nothing to install.
 *
 *   min_app_version_ios / _android     below this the app is blocked (mandatory update)
 *   latest_app_version_ios / _android  below this a dismissible prompt is shown (optional update)
 *   update_message                     optional copy for the mandatory screen
 *
 * An unset or blank parameter is `null`, which means "no requirement" (see `version.ts`).
 *
 * ## One Firebase project, separate keys per environment
 *
 * Every build — staging and production alike — reads the same Firebase project, so a value set
 * to test the update screen would otherwise reach real customers. Production reads the names
 * above exactly as written. Any other environment reads them with its own prefix
 * (`staging_min_app_version_ios`, `development_…`), so a test value can only ever be seen by
 * builds of that environment, and a prefixed key that does not exist yet means "no requirement".
 */

export interface UpdatePolicy {
  readonly minimum: string | null;
  readonly latest: string | null;
  readonly message: string | null;
}

export async function fetchUpdatePolicy(
  platform: 'ios' | 'android',
  appEnv: AppEnv,
): Promise<UpdatePolicy | null> {
  const values = await readRemoteStrings(
    [`min_app_version_${platform}`, `latest_app_version_${platform}`, 'update_message'],
    appEnv,
  );
  if (values === null) return null;
  return {
    minimum: values[`min_app_version_${platform}`],
    latest: values[`latest_app_version_${platform}`],
    message: values.update_message,
  };
}
