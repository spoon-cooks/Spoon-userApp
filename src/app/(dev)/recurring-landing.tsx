import { useLocalSearchParams, useRouter } from 'expo-router';

import { RecurringLandingScreen, useExplainerVideoSource } from '@features/recurringLanding';
import { RouteScaffold } from '@ui';

/**
 * Recurring landing — DEV PREVIEW, DEVELOPMENT ONLY. `spoon://recurring-landing` opens it at the
 * top (`970:5392`); `?state=` opens it for a frame to be compared with:
 *
 *   top      scrolled to the top, the sticky footer parked below the screen (`970:5392`)
 *   bottom   scrolled to the end, the footer in (`970:5397`)
 *   player   the player up over the page, at 1:52 (`970:5546`)
 *   watched  scrolled to the end with the video already watched (`970:5472`)
 *
 * `?pool=1` draws the Cook Pool button as for a household with a pool ("Check your Cook Pool");
 * without it the button reads "Make your Cook Pool".
 *
 * `?video=<url>` plays that video in the player, in place of the configured one (`video.ts`) —
 * for trying a link without editing code. Needs a build that has `expo-video`; an older one plays
 * the placeholder. Percent-encode the URL (`?video=https%3A%2F%2F…`).
 *
 * The real route (`(app)/recurring`) sits behind the session guard, which a build with no live
 * backend cannot pass — the same reason `recurring-setup.tsx` and `cook-pool-preview.tsx` sit
 * outside `(app)`. Here "schedule" opens the dev preview of the plan flow, and "Make your Cook
 * Pool" / "Check your Cook Pool" the Cook Pool's.
 */
const PLAYER_AT_SECONDS = 112;

export default function RecurringLandingPreviewRoute() {
  const router = useRouter();
  const { state, video, pool } = useLocalSearchParams<{
    state?: string;
    video?: string;
    pool?: string;
  }>();
  const configured = useExplainerVideoSource();
  const videoSource = video === undefined || video === '' ? configured : { uri: video };

  if (!__DEV__) {
    return (
      <RouteScaffold
        title="Recurring landing preview"
        status="foundation"
        notes={['This preview is available in development builds only']}
      />
    );
  }

  return (
    <RecurringLandingScreen
      // The screen reads its opening state once, so a new `state` is a new screen.
      key={state ?? 'top'}
      onBack={() => router.back()}
      onSchedule={() => router.push('/recurring-setup')}
      onMakeCookPool={() => router.push('/cook-pool-preview')}
      hasCookPool={pool === '1'}
      initialScroll={state === 'bottom' || state === 'watched' ? 'end' : 'top'}
      initialWatched={state === 'watched'}
      {...(videoSource === undefined ? {} : { videoSource })}
      {...(state === 'player' ? { initialPlayerAt: PLAYER_AT_SECONDS } : {})}
    />
  );
}
