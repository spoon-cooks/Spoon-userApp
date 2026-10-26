import type { CrashReporter } from '@core/crash';

import { createCrashlyticsSink } from './crashlyticsSink';
import { combineSinks, createLogger } from './logger';
import type { LogSink } from './logger';

function fakeReporter(): jest.Mocked<CrashReporter> {
  return {
    init: jest.fn(),
    setUser: jest.fn(),
    clearUser: jest.fn(),
    breadcrumb: jest.fn(),
    recordError: jest.fn(),
  };
}

describe('createCrashlyticsSink', () => {
  it('never forwards debug', () => {
    const reporter = fakeReporter();
    createLogger({ level: 'debug', sink: createCrashlyticsSink(reporter) }).debug('noise');

    expect(reporter.breadcrumb).not.toHaveBeenCalled();
    expect(reporter.recordError).not.toHaveBeenCalled();
  });

  it('turns info and warn into breadcrumbs, not reports', () => {
    const reporter = fakeReporter();
    const logger = createLogger({ level: 'debug', sink: createCrashlyticsSink(reporter) });

    logger.info('booking opened');
    logger.warn('slow response');

    expect(reporter.breadcrumb.mock.calls.map(([line]) => line)).toEqual([
      'info: booking opened',
      'warn: slow response',
    ]);
    expect(reporter.recordError).not.toHaveBeenCalled();
  });

  it('reports an error with the ORIGINAL error and its stack when the context carries one', () => {
    const reporter = fakeReporter();
    const logger = createLogger({ level: 'debug', sink: createCrashlyticsSink(reporter) });
    const original = new Error('render blew up');

    // The shape the ErrorBoundary logs: a normalised error whose `cause` is the real one.
    logger.error('Render failed', {
      scope: 'app-shell',
      error: { kind: 'unknown', message: 'render blew up', cause: original },
    });

    expect(reporter.recordError).toHaveBeenCalledTimes(1);
    expect(reporter.recordError.mock.calls[0]?.[0]).toBe(original);
    expect(reporter.breadcrumb).toHaveBeenCalledWith('error: Render failed');
  });

  it('finds an error passed directly as cause or error', () => {
    const reporter = fakeReporter();
    const logger = createLogger({ level: 'debug', sink: createCrashlyticsSink(reporter) });
    const viaCause = new Error('a');
    const viaError = new Error('b');

    logger.error('one', { cause: viaCause });
    logger.error('two', { error: viaError });

    expect(reporter.recordError.mock.calls.map(([error]) => error)).toEqual([viaCause, viaError]);
  });

  it('reports a synthetic error named after the event when there is no real one', () => {
    const reporter = fakeReporter();
    const logger = createLogger({ level: 'debug', sink: createCrashlyticsSink(reporter) });

    logger.error('Response failed boundary validation', { path: '/v1/me', correlationId: 'c-1' });

    const [error, context] = reporter.recordError.mock.calls[0] ?? [];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Response failed boundary validation');
    expect(context).toEqual({ path: '/v1/me', correlationId: 'c-1' });
  });

  it('prefixes the scope of a child logger', () => {
    const reporter = fakeReporter();
    createLogger({ level: 'debug', sink: createCrashlyticsSink(reporter) })
      .child('api')
      .warn('retrying');

    expect(reporter.breadcrumb).toHaveBeenCalledWith('warn: [api] retrying');
  });
});

describe('combineSinks', () => {
  it('writes to every sink in order', () => {
    const order: string[] = [];
    const a: LogSink = { write: () => order.push('a') };
    const b: LogSink = { write: () => order.push('b') };

    createLogger({ level: 'debug', sink: combineSinks(a, b) }).info('x');

    expect(order).toEqual(['a', 'b']);
  });

  it('keeps going, and keeps quiet, when one sink throws', () => {
    const second = jest.fn();
    const broken: LogSink = {
      write: () => {
        throw new Error('sink failed');
      },
    };

    const logger = createLogger({ level: 'debug', sink: combineSinks(broken, { write: second }) });

    expect(() => logger.error('x')).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
