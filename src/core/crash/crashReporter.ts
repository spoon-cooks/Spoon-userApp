import type * as CrashlyticsModule from '@react-native-firebase/crashlytics';
import { Platform } from 'react-native';

import type { BuildProvenance } from '@core/buildProvenance';
import { redact } from '@core/logging/redact';

/**
 * Crash reporting -- Firebase Crashlytics, Android only for now.
 *
 * Everything the rest of the app does with Crashlytics goes through this module, for three reasons:
 *
 *  1. Crash reporting must NEVER be able to crash the app. Every call is wrapped, and an SDK that
 *     is absent, misconfigured or throwing degrades to doing nothing.
 *  2. Nothing personal may reach Firebase. Messages, stacks and context all pass through the same
 *     `redact` the logger uses (phone numbers, tokens and JWTs scrubbed; address, OTP, coordinates
 *     and name-like keys removed), and the only identity ever attached is an opaque account id.
 *  3. The SDK is loaded lazily, and only where it exists. iOS does not link Crashlytics yet (see
 *     the note beside the plugin in `app.config.ts`), so importing the module there must not even
 *     be attempted.
 *
 * What it is NOT: it does not install the crash handlers. `@react-native-firebase/crashlytics`
 * does that itself the moment it is loaded -- native crashes through the Firebase SDK and fatal JS
 * errors through a global handler -- so fatals are reported without any call from here. This adds
 * the parts the SDK cannot know: who (opaquely), which build, breadcrumbs, and handled errors.
 *
 * ## JS stack traces are NOT symbolicated by Crashlytics
 *
 * On a Hermes release build a JS frame is a bytecode offset into the bundle. Native Java/Kotlin
 * frames are de-obfuscated by the R8 mapping file the Crashlytics Gradle plugin uploads; JS frames
 * need the build's source map and `metro-symbolicate`, matched to the crashing commit. The
 * `release_sha` key set in `init` is what says which one.
 */

export type CrashContext = Readonly<Record<string, unknown>>;

/** The few Crashlytics operations this app uses, so tests can supply a fake. */
export interface CrashlyticsSdk {
  setUserId(id: string): Promise<unknown>;
  setAttributes(attributes: Record<string, string>): Promise<unknown>;
  log(message: string): void;
  recordError(error: Error): void;
}

export interface CrashReporter {
  /** Tags every later report with the build. Safe to call more than once. */
  init(provenance: BuildProvenance): void;
  /** Attaches an opaque account id. Anything that looks like a phone number or e-mail is refused. */
  setUser(id: string): void;
  clearUser(): void;
  /** A line shown above the next report. Redacted and truncated. */
  breadcrumb(message: string): void;
  /** A handled error, reported as non-fatal. Rate-limited and de-duplicated. */
  recordError(error: unknown, context?: CrashContext): void;
}

const NOOP_REPORTER: CrashReporter = {
  init: () => undefined,
  setUser: () => undefined,
  clearUser: () => undefined,
  breadcrumb: () => undefined,
  recordError: () => undefined,
};

/** The same error within this long is reported once. */
const DEDUPE_MS = 60_000;
/** More than this many handled errors in one window are dropped: a loop must not flood Firebase. */
const MAX_PER_WINDOW = 10;
const WINDOW_MS = 60_000;
/** Crashlytics keeps a bounded log per report; a breadcrumb is a hint, not a transcript. */
const MAX_LOG_LENGTH = 1_000;

function scrub(value: unknown): string {
  const redacted = redact(value);
  return typeof redacted === 'string' ? redacted : JSON.stringify(redacted);
}

function truncate(text: string): string {
  return text.length > MAX_LOG_LENGTH ? `${text.slice(0, MAX_LOG_LENGTH)}...` : text;
}

/**
 * An error safe to send: the original's name and STACK FRAMES, with the message and stack text
 * passed through the redactor. (`redact(error)` alone would keep only name and message, which
 * throws away the one thing a crash report is for.)
 */
function toSafeError(error: unknown): Error {
  if (error instanceof Error) {
    const safe = new Error(scrub(error.message));
    safe.name = error.name;
    if (typeof error.stack === 'string') {
      safe.stack = scrub(error.stack);
    }
    return safe;
  }
  return new Error(typeof error === 'string' ? scrub(error) : 'Non-error value thrown');
}

/** Digits-only strings of phone length, and anything e-mail shaped, are not opaque ids. */
function isOpaqueId(id: string): boolean {
  if (id.length === 0 || id.length > 128) return false;
  if (/^\+?[\d\s-]{10,}$/.test(id)) return false;
  if (id.includes('@')) return false;
  return true;
}

export interface CrashReporterOptions {
  /** `null` means reporting is off: every call does nothing. */
  readonly sdk: CrashlyticsSdk | null;
  readonly now?: () => number;
}

export function createCrashReporter(options: CrashReporterOptions): CrashReporter {
  const { sdk } = options;
  if (sdk === null) return NOOP_REPORTER;

  const now = options.now ?? Date.now;
  const lastSeen = new Map<string, number>();
  let windowStart = 0;
  let inWindow = 0;

  /** Runs one SDK call; whatever it does, the app carries on. */
  function safely(run: () => unknown): void {
    try {
      const result = run();
      if (result instanceof Promise) result.catch(() => undefined);
    } catch {
      // Crash reporting is best-effort by definition.
    }
  }

  function allow(signature: string): boolean {
    const at = now();
    const previous = lastSeen.get(signature);
    if (previous !== undefined && at - previous < DEDUPE_MS) return false;

    if (at - windowStart >= WINDOW_MS) {
      windowStart = at;
      inWindow = 0;
    }
    if (inWindow >= MAX_PER_WINDOW) return false;
    inWindow += 1;

    lastSeen.set(signature, at);
    if (lastSeen.size > 100) {
      for (const [key, time] of lastSeen) {
        if (at - time >= DEDUPE_MS) lastSeen.delete(key);
      }
    }
    return true;
  }

  return {
    init(provenance) {
      safely(() =>
        sdk.setAttributes({
          release_sha: provenance.releaseSha,
          environment: provenance.environment,
          api_label: provenance.apiBaseUrlLabel,
          runtime_version: provenance.expoRuntimeVersion,
        }),
      );
    },

    setUser(id) {
      if (!isOpaqueId(id)) return;
      safely(() => sdk.setUserId(id));
    },

    clearUser() {
      // An empty id is how the SDK forgets the previous one.
      safely(() => sdk.setUserId(''));
    },

    breadcrumb(message) {
      safely(() => sdk.log(truncate(scrub(message))));
    },

    recordError(error, context) {
      const safe = toSafeError(error);
      if (!allow(`${safe.name}:${safe.message}`)) return;
      safely(() => {
        if (context !== undefined) sdk.log(truncate(`context ${scrub(context)}`));
        sdk.recordError(safe);
      });
    },
  };
}

/**
 * The real SDK, or `null` when it cannot be used.
 *
 * `require` and not `import`, on purpose: on iOS (no native module), in Jest and under Metro dev
 * the file must never be evaluated. It is also wrapped, because a native module that failed to
 * link throws on first use rather than at import.
 */
function loadAndroidSdk(): CrashlyticsSdk | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sdk = require('@react-native-firebase/crashlytics') as typeof CrashlyticsModule;
    const crashlytics = sdk.getCrashlytics();
    return {
      setUserId: (id) => sdk.setUserId(crashlytics, id),
      setAttributes: (attributes) => sdk.setAttributes(crashlytics, attributes),
      log: (message) => sdk.log(crashlytics, message),
      recordError: (error) => sdk.recordError(crashlytics, error),
    };
  } catch {
    return null;
  }
}

/**
 * Reporting is on only in a release build on Android. Metro dev builds (`__DEV__`) and Jest have
 * red boxes and a console already, and iOS does not link the module.
 */
function reportingEnabled(): boolean {
  return Platform.OS === 'android' && !__DEV__;
}

export const crashReporter: CrashReporter = createCrashReporter({
  sdk: reportingEnabled() ? loadAndroidSdk() : null,
});
