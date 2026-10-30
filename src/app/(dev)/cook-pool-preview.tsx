import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { CookPoolFlow, CookPoolSourceProvider, createDemoCookPoolSource } from '@features/cookPool';
import { RouteScaffold } from '@ui';

import { DEMO_COOK_POOL } from '@/demo/fixtures/cookPool';

/**
 * Cook Pool — DEV PREVIEW, DEVELOPMENT ONLY. `spoon://cook-pool-preview` opens the landing for a
 * new household (`844:5842`); `?pool=1` opens it with two cooks already in the pool (`719:1507`).
 *
 * The real routes (`(app)/cook-pool/*`) sit behind the session guard, which a build with no live
 * backend cannot pass — the same reason `recurring-setup.tsx` sits outside `(app)`. The preview
 * therefore reads a local store seeded from `DEMO_COOK_POOL`, not `/v1/me/cooks`.
 */
export default function CookPoolPreviewRoute() {
  const router = useRouter();
  const { pool } = useLocalSearchParams<{ pool?: string }>();
  // One store for the preview's lifetime, seeded as it opens, before any screen reads it.
  const [source] = useState(() =>
    createDemoCookPoolSource({
      ...DEMO_COOK_POOL,
      poolIds: pool === '1' ? ['demo-pool-meera', 'demo-pool-asha'] : [],
    }),
  );

  if (!__DEV__) {
    return (
      <RouteScaffold
        title="Cook Pool preview"
        status="foundation"
        notes={['This preview is available in development builds only']}
      />
    );
  }

  return (
    <CookPoolSourceProvider source={source}>
      <CookPoolFlow onExit={() => router.back()} />
    </CookPoolSourceProvider>
  );
}
