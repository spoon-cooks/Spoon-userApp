import { useLocalSearchParams } from 'expo-router';

import { PaymentFailedBody } from '@features/booking';
import { ConfirmationLoading, SplashLoading } from '@features/loading';
import { RouteScaffold } from '@ui';

/**
 * The loading screens of Figma page `2539:15531` — DEVELOPMENT ONLY. Reachable at
 * `spoon://splash`, plus `?screen=confirming` (`2702:855`) and `?screen=failed` (`2718:916`).
 *
 * The toss (`2692:864`) renders in the product only while `src/app/index.tsx` is resolving the
 * session, which on a warm device is a handful of frames; the other two need a real checkout. This
 * route is the review path for all three and nothing more: it invents no product entry point,
 * changes no navigation, and refuses to render outside `__DEV__`.
 */
export default function SplashDevRoute() {
  const { screen } = useLocalSearchParams<{ screen?: string }>();

  if (!__DEV__) {
    return <RouteScaffold title="Not available" status="blocked" />;
  }

  if (screen === 'confirming') return <ConfirmationLoading />;
  if (screen === 'failed') {
    return <PaymentFailedBody retrying={false} onRetry={() => {}} onChangeMethod={() => {}} />;
  }
  return <SplashLoading />;
}
