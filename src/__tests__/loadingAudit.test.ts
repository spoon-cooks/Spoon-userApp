import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { globSync } from 'glob';

/**
 * THE LOADING SCREEN — owner, 30 Oct 2026, replacing task §13 / §25's rule.
 *
 * Every full-screen wait shows the toss (`2692:864`): the app opening, where the boot gate renders
 * `SplashLoading`, and every screen whose first read is in flight, where `QueryBoundary` renders
 * `LoadingState`'s `screen` variant — which IS the toss (`TossLoading`, `@ui`). Waits inside a
 * screen stay scoped: a CTA or inline spinner, or card skeletons for a list.
 *
 * The earlier rule kept the branded screen to the app opening alone, so a routine tap never looked
 * like a second launch. The owner chose the opposite on 30 Oct 2026: one loading screen,
 * everywhere a whole screen waits.
 *
 * ## Why this is a source scan and not a render
 *
 * The rule is about the whole app, and its failure mode is additive: someone wires a different
 * full-screen surface into a new boundary and every existing test still passes. What has to hold
 * is the INVARIANT — screens reach the toss through `LoadingState`, the splash component stays on
 * the boot gate, and the retired interstitial (`71:747`) stays retired — and that is a property of
 * the source tree. `productionDataPath.test.ts` enforces its rule the same way.
 */

const REPO_ROOT = join(__dirname, '..', '..');

/**
 * The full-viewport components a screen must not render itself: the splash belongs to the boot
 * gate, and the interstitial (`71:747`) is retired. A screen that is loading uses `LoadingState`.
 */
const BRANDED = ['SplashLoading', 'IntroLoading'] as const;

/**
 * The ONLY files allowed to render a branded loading surface.
 *
 * `src/app/index.tsx`   — the boot gate: held while the session, the profile gate and the
 *                         address gate resolve, which is the app opening.
 * `src/app/+not-found.tsx` — the same wait, reached by an unrecognised deep link before the
 *                         session has settled. It is a cold start that happens to have a URL.
 * `src/app/(dev)/splash.tsx` — a `__DEV__` review route for the frame itself. Not reachable in a
 *                         release build and not on any customer path.
 * `src/features/loading/**` — where the components are defined and tested.
 */
const ALLOWED = new Set([
  'src/app/index.tsx',
  'src/app/+not-found.tsx',
  'src/app/(dev)/splash.tsx',
]);

function productionSources(): readonly string[] {
  return (
    globSync('src/**/*.{ts,tsx}', { cwd: REPO_ROOT })
      .map((file) => file.split('\\').join('/'))
      .filter((file) => !file.includes('.test.'))
      .filter((file) => !file.startsWith('src/test/'))
      .filter((file) => !file.startsWith('src/__tests__/'))
      // The components' own module. Defining them is not rendering them.
      .filter((file) => !file.startsWith('src/features/loading/'))
  );
}

/** Strips comments so a doc block NAMING a component is not read as using one. */
function code(file: string): string {
  return readFileSync(join(REPO_ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

describe('the loading screen', () => {
  const files = productionSources();

  it('finds the production sources', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(BRANDED)('renders %s only where the app is opening', (component) => {
    const offenders = files.filter(
      (file) => !ALLOWED.has(file) && new RegExp(`<${component}\\b`).test(code(file)),
    );

    expect(offenders).toEqual([]);
  });

  /**
   * The boot gate is the one that MUST have it — an empty allow-list would also pass the test
   * above, and that is the opposite failure: a cold start with no splash at all, flashing whatever
   * the first route renders while the session resolves.
   */
  it('keeps the splash on the boot gate', () => {
    expect(code('src/app/index.tsx')).toContain('<SplashLoading');
  });

  /**
   * `433:2290` is NOT a loading screen in this sense.
   *
   * It is a DESIGNED destination — "Confirmation in progress", the few seconds between a verified
   * payment and a booking the server has confirmed (task §20). It owns the viewport because the
   * frame does, not because something is being fetched behind it, so it is exempt by definition
   * rather than by exception. Asserted so the distinction is deliberate.
   */
  it('treats Page 21 as a screen, not as a loading state', () => {
    const confirming = code('src/app/(app)/booking/confirming.tsx');

    expect(confirming).toContain('<ConfirmationLoading');
    for (const component of BRANDED) {
      expect(confirming).not.toContain(`<${component}`);
    }
  });

  /**
   * Every screen boundary shows the same loading screen.
   *
   * `loadingFallback` is `QueryBoundary`'s escape hatch for a different full-viewport surface. A
   * boundary reaching for it would bring back a second loading screen, which is what this rule
   * exists to prevent.
   */
  it('leaves no screen boundary overriding its loading state', () => {
    const offenders = files.filter((file) => code(file).includes('loadingFallback='));

    expect(offenders).toEqual([]);
  });
});
