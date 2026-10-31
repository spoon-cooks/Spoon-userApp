import { useQuery } from '@tanstack/react-query';

import { getConfig } from '@core/config';
import { readRemoteStrings } from '@core/remoteConfig';

import type { ExplainerVideoSource } from './components/ExplainerPlayer';

/**
 * The Recurring landing's explainer video, set from Firebase Remote Config (owner, 31 Oct 2026),
 * so it changes without a release:
 *
 *   recurring_explainer_video_url   an `https://` link to the `.mp4` (or HLS `.m3u8`) on S3.
 *
 * Unset, blank or not `https://`: no video yet. The landing still shows its explainer block, and
 * the card opens the placeholder player. Staging and development read the same name with their
 * environment's prefix (`staging_recurring_explainer_video_url`), so a test video never reaches
 * customers (`@core/remoteConfig`). Remote Config is asked at most every 15 minutes; a change
 * reaches an open app within that.
 */

const VIDEO_URL = 'recurring_explainer_video_url';

/** The video for a link set in the console, or `null` when it is not a usable `https://` link. */
export function explainerVideoFrom(url: string | null): ExplainerVideoSource | null {
  if (url === null || !/^https:\/\/\S+$/u.test(url)) return null;
  return { uri: url };
}

export async function fetchExplainerVideo(): Promise<ExplainerVideoSource | null> {
  const values = await readRemoteStrings([VIDEO_URL], getConfig().appEnv);
  return values === null ? null : explainerVideoFrom(values[VIDEO_URL]);
}

const STALE_MS = 15 * 60 * 1000;

/** The video the Recurring landing plays, or `undefined` while there is none. */
export function useExplainerVideoSource(): ExplainerVideoSource | undefined {
  const query = useQuery({
    queryKey: ['remoteConfig', 'recurringExplainer'],
    queryFn: fetchExplainerVideo,
    staleTime: STALE_MS,
  });
  return query.data ?? undefined;
}
