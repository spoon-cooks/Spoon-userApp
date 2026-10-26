import { getConfig } from '@core/config';
import { crashReporter } from '@core/crash';

import { createCrashlyticsSink } from './crashlyticsSink';
import { combineSinks, consoleSink, createLogger } from './logger';
import type { Logger } from './logger';

let root: Logger | undefined;

/**
 * The app logger. Sink choice is environment-driven: crash reporting everywhere, plus the console
 * outside production. Crash reporting itself is a no-op in Metro dev, in Jest and on iOS (see
 * `core/crash`), so development output is unchanged.
 */
export function getLogger(scope?: string): Logger {
  if (root === undefined) {
    const { logLevel, appEnv } = getConfig();
    const crashSink = createCrashlyticsSink(crashReporter);
    root = createLogger({
      level: logLevel,
      sink: appEnv === 'production' ? crashSink : combineSinks(consoleSink, crashSink),
    });
  }
  return scope === undefined ? root : root.child(scope);
}

/** Test-only: clears the memoised root logger. */
export function resetLoggerCache(): void {
  root = undefined;
}

export { combineSinks, consoleSink, createLogger, noopSink } from './logger';
export { createCrashlyticsSink } from './crashlyticsSink';
export type { Logger, LogContext, LogRecord, LogSink } from './logger';
export { redact, REDACTED } from './redact';
