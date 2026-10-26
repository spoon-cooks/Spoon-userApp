import type { LogLevel } from '@core/config';

import { redact } from './redact';

/**
 * Thin logger with levels, pluggable sinks and mandatory redaction.
 * (FRONTEND_FOUNDATION_PLAN.md §12)
 *
 * Crash reporting is a SINK (`crashlyticsSink.ts`), chosen per environment in `index.ts`. It was
 * held back until the redaction layer existed, because what it sends leaves the device; every
 * record it forwards is redacted again on the way out (`core/crash`).
 */

export type LogContext = Readonly<Record<string, unknown>>;

export interface LogRecord {
  readonly level: Exclude<LogLevel, 'silent'>;
  readonly message: string;
  readonly context?: LogContext;
}

export interface LogSink {
  write(record: LogRecord): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export const consoleSink: LogSink = {
  write(record) {
    const payload = record.context ? redact(record.context) : undefined;
    const args = payload === undefined ? [record.message] : [record.message, payload];

    switch (record.level) {
      case 'debug':
        console.debug(...args);
        break;
      case 'info':
        console.info(...args);
        break;
      case 'warn':
        console.warn(...args);
        break;
      case 'error':
        console.error(...args);
        break;
    }
  },
};

export const noopSink: LogSink = {
  write() {
    // Intentionally empty. Kept for tests and for any environment that wants no output at all.
  },
};

/**
 * Writes to every sink, in order. One sink throwing must not stop the others, and must never
 * reach the caller: logging is not allowed to break the code that logs.
 */
export function combineSinks(...sinks: readonly LogSink[]): LogSink {
  return {
    write(record) {
      for (const sink of sinks) {
        try {
          sink.write(record);
        } catch {
          // A broken sink is its own problem; the app carries on.
        }
      }
    },
  };
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(scope: string): Logger;
}

export function createLogger(options: { level: LogLevel; sink: LogSink; scope?: string }): Logger {
  const { level, sink, scope } = options;
  const threshold = LEVEL_ORDER[level];

  function log(recordLevel: Exclude<LogLevel, 'silent'>, message: string, context?: LogContext) {
    if (LEVEL_ORDER[recordLevel] < threshold) return;

    sink.write({
      level: recordLevel,
      message: scope === undefined ? message : `[${scope}] ${message}`,
      ...(context === undefined ? {} : { context }),
    });
  }

  return {
    debug: (message, context) => log('debug', message, context),
    info: (message, context) => log('info', message, context),
    warn: (message, context) => log('warn', message, context),
    error: (message, context) => log('error', message, context),
    child: (childScope) =>
      createLogger({
        level,
        sink,
        scope: scope === undefined ? childScope : `${scope}:${childScope}`,
      }),
  };
}
