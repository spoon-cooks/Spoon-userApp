import { Redirect, Stack, useSegments } from 'expo-router';

import { canAccessApp, canBrowseApp, isGuest, isResolving } from '@core/auth';
import { useSessionStore } from '@core/store';
import { useCrashIdentity } from '@features/auth';
import { usePushNotifications } from '@features/notifications';
import { ErrorBoundary } from '@ui';

/**
 * Authenticated shell.
 *
 * A single stack, deliberately. Whether a bottom tab bar exists is unconfirmed — no tab bar
 * appears on any of the 50 audited frames — and ruling R-5 (active bookings live on Home)
 * removes the need to guess. Committing to tabs now would risk the wrong shell.
 *
 * Push lives HERE rather than at the root: registration and the permission prompt belong to an
 * authenticated customer (§45), and mounting it in the root layout would run it on the login
 * screen, where the prompt has nothing to explain itself with and the token has no account to
 * attach to.
 *
 * ## Why the shell watches the session
 *
 * The boot gate at `/` decides where a LAUNCH lands. It cannot decide anything about a session
 * that dies while the customer is already inside the app — a refresh token revoked server-side,
 * a family killed by reuse detection, a token that simply ran out — because `/` is not mounted
 * any more. Before this, an expiry mid-session left the customer on a live-looking Home whose
 * every read 401s, with no route out.
 *
 * So the shell asks the same question `/` asks, continuously: may these routes render at all?
 * `canAccessApp` covers `authenticated` and `refreshing`, so an in-flight single-flight refresh
 * does NOT evict anyone — only a session that has actually failed does. `isResolving` holds
 * during bootstrap so a cold start into a deep link is not bounced before its tokens are read.
 *
 * The redirect targets `/login`, which lives in the `(auth)` group and therefore outside this
 * layout, so the two cannot ping-pong. Signing in again dispatches `SIGNED_IN`, which now moves
 * `expired` back to `authenticated` (see `sessionMachine`), and the customer re-enters here.
 *
 * ## Guests
 *
 * A guest (Skip on Login, iOS only) may render HOME and nothing else. Every other route here
 * reads per-account data, so a guest reaching one — a deep link, a stale push — is sent to Login
 * rather than shown a screen whose reads would all 401. Home's own CTAs already route a guest to
 * Login; this is the backstop for everything that does not pass through Home.
 */
const GUEST_ROUTES: ReadonlySet<string> = new Set(['home']);
export default function AppLayout() {
  const status = useSessionStore((state) => state.status);
  const segments = useSegments();
  usePushNotifications();
  // Crash reports name the account by its opaque id, and only once there is a session to name.
  useCrashIdentity(canAccessApp(status));

  if (!isResolving(status) && !canBrowseApp(status)) {
    return <Redirect href="/login" />;
  }

  // `segments` is `['(app)', 'home']` on Home; a nested route has more after the group.
  if (isGuest(status) && !GUEST_ROUTES.has(segments.slice(1).join('/'))) {
    return <Redirect href="/login" />;
  }

  return (
    <ErrorBoundary scope="app-shell">
      <Stack screenOptions={{ headerShown: false }} />
    </ErrorBoundary>
  );
}
