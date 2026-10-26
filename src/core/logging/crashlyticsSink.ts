import type { CrashReporter } from '@core/crash';

import type { LogContext, LogSink } from './logger';

/**
 * Sends the logger's output to crash reporting.
 *
 *  - `error` is a handled failure worth a report of its own, so it becomes a NON-FATAL. Today that
 *    is two sites: a response that broke its schema (a contract mismatch with the backend) and a
 *    screen that failed to render. Both are rare and both are exactly what a crash dashboard is
 *    for. Expected failures -- offline, a 4xx the screen already handles -- are logged below
 *    `error` and stay out of it. Keep it that way: a call that logs routine failures at `error`
 *    would turn this into noise.
 *  - `warn` and `info` become BREADCRUMBS: lines shown above the next report, which is how "what
 *    was the app doing just before" gets answered.
 *  - `debug` is never sent.
 *
 * Redaction happens inside the reporter, not here, so a sink cannot be written that skips it.
 */

/** Where an `Error` is found in a log context: directly, or as the `cause` of a normalised error. */
function findError(context: LogContext | undefined): Error | null {
  if (context === undefined) return null;
  const nested = (value: unknown): unknown =>
    typeof value === 'object' && value !== null ? (value as { cause?: unknown }).cause : undefined;

  const candidates = [
    context['cause'],
    context['error'],
    nested(context['error']),
    nested(context['cause']),
  ];
  return candidates.find((candidate): candidate is Error => candidate instanceof Error) ?? null;
}

export function createCrashlyticsSink(reporter: CrashReporter): LogSink {
  return {
    write(record) {
      switch (record.level) {
        case 'error': {
          // The real error carries the real stack. Failing that, a synthetic one at least names the
          // event; its stack is the logger's own call stack, which still tells call sites apart.
          const original = findError(record.context);
          if (original !== null) reporter.breadcrumb(`error: ${record.message}`);
          reporter.recordError(original ?? new Error(record.message), record.context);
          return;
        }
        case 'warn':
        case 'info':
          reporter.breadcrumb(`${record.level}: ${record.message}`);
          return;
        case 'debug':
          return;
      }
    },
  };
}
