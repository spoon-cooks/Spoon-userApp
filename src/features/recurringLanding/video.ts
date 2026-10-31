import { useQuery } from '@tanstack/react-query';

import { getConfig } from '@core/config';
import { readRemoteStrings } from '@core/remoteConfig';

import type { ExplainerVideoSource } from './components/ExplainerPlayer';

/**
 * The Recurring landing's explainer video, set from Firebase Remote Config (owner, 31 Oct 2026),
 * so it changes without a release:
 *
 *   recurring_explainer_video_url   the video: an `https://` link to an `.mp4` (or HLS `.m3u8`)
 *                                   on S3. Unset, blank or not `https://`: there is no video, and
 *                                   the landing leaves its explainer block out.
 *   recurring_explainer_subhead     the line under the heading ("See the whole flow in under 4
 *                                   minutes."). Unset: that default.
 *
 * Staging and development read the same names with their environment's prefix
 * (`staging_recurring_explainer_video_url`), so a test video never reaches customers
 * (`@core/remoteConfig`). Remote Config is asked at most every 15 minutes; a change reaches an
 * open app within that.
 */

export interface ExplainerVideo {
  readonly source: ExplainerVideoSource;
  /** The line under the heading; `null` for the screen's own default. */
  readonly subhead: string | null;
}

const VIDEO_URL = 'recurring_explainer_video_url';
const SUBHEAD = 'recurring_explainer_subhead';

/** The explainer from the console's values, or `null` when no usable video is set. */
export function explainerVideoFrom(values: {
  readonly url: string | null;
  readonly subhead: string | null;
}): ExplainerVideo | null {
  if (values.url === null || !/^https:\/\/\S+$/u.test(values.url)) return null;
  return { source: { uri: values.url }, subhead: values.subhead };
}

export async function fetchExplainerVideo(): Promise<ExplainerVideo | null> {
  const values = await readRemoteStrings([VIDEO_URL, SUBHEAD], getConfig().appEnv);
  if (values === null) return null;
  return explainerVideoFrom({ url: values[VIDEO_URL], subhead: values[SUBHEAD] });
}

const STALE_MS = 15 * 60 * 1000;

/** The explainer the landing shows, or `null` while there is none (or none has been read yet). */
export function useExplainerVideo(): ExplainerVideo | null {
  const query = useQuery({
    queryKey: ['remoteConfig', 'recurringExplainer'],
    queryFn: fetchExplainerVideo,
    staleTime: STALE_MS,
  });
  return query.data ?? null;
}
