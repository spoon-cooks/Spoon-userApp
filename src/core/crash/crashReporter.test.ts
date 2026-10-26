import type { BuildProvenance } from '@core/buildProvenance';

import { createCrashReporter } from './crashReporter';
import type { CrashlyticsSdk } from './crashReporter';

function fakeSdk(): jest.Mocked<CrashlyticsSdk> {
  return {
    setUserId: jest.fn<Promise<unknown>, [string]>(async () => null),
    setAttributes: jest.fn<Promise<unknown>, [Record<string, string>]>(async () => null),
    log: jest.fn<void, [string]>(),
    recordError: jest.fn<void, [Error]>(),
  };
}

const PROVENANCE: BuildProvenance = {
  releaseSha: 'abc1234',
  buildTimestamp: '2026-10-26T00:00:00Z',
  environment: 'staging',
  apiBaseUrlLabel: 'staging',
  expoRuntimeVersion: '1.0.0',
  expoUpdateId: 'not-applicable',
};

describe('createCrashReporter', () => {
  it('does nothing at all when there is no SDK', () => {
    const reporter = createCrashReporter({ sdk: null });

    expect(() => {
      reporter.init(PROVENANCE);
      reporter.setUser('6f1d1c2e-4b8a-4d0e-9f3a-2a7c9b1e5d44');
      reporter.clearUser();
      reporter.breadcrumb('x');
      reporter.recordError(new Error('x'), { a: 1 });
    }).not.toThrow();
  });

  describe('init', () => {
    it('tags reports with the build, and nothing else from provenance', () => {
      const sdk = fakeSdk();
      createCrashReporter({ sdk }).init(PROVENANCE);

      expect(sdk.setAttributes).toHaveBeenCalledWith({
        release_sha: 'abc1234',
        environment: 'staging',
        api_label: 'staging',
        runtime_version: '1.0.0',
      });
    });
  });

  describe('identity', () => {
    it('attaches an opaque account id', () => {
      const sdk = fakeSdk();
      createCrashReporter({ sdk }).setUser('6f1d1c2e-4b8a-4d0e-9f3a-2a7c9b1e5d44');

      expect(sdk.setUserId).toHaveBeenCalledWith('6f1d1c2e-4b8a-4d0e-9f3a-2a7c9b1e5d44');
    });

    it.each([
      '9876543210',
      '+91 98765 43210',
      '+919876543210',
      'asha@example.com',
      '',
      'x'.repeat(129),
    ])('refuses %p, which is not an opaque id', (value) => {
      const sdk = fakeSdk();
      createCrashReporter({ sdk }).setUser(value);

      expect(sdk.setUserId).not.toHaveBeenCalled();
    });

    it('forgets the account with an empty id', () => {
      const sdk = fakeSdk();
      createCrashReporter({ sdk }).clearUser();

      expect(sdk.setUserId).toHaveBeenCalledWith('');
    });
  });

  describe('recordError', () => {
    it('keeps the stack frames but scrubs a phone number out of the message and the stack text', () => {
      const sdk = fakeSdk();
      const error = new Error('could not reach 9876543210');
      error.stack = 'Error: could not reach 9876543210\n    at send (bundle.js:1:100)';

      createCrashReporter({ sdk }).recordError(error);

      const sent = sdk.recordError.mock.calls[0]?.[0] as Error;
      expect(sent.message).not.toContain('9876543210');
      expect(sent.stack).not.toContain('9876543210');
      expect(sent.stack).toContain('at send (bundle.js:1:100)');
    });

    it('logs redacted context ahead of the report', () => {
      const sdk = fakeSdk();
      createCrashReporter({ sdk }).recordError(new Error('boom'), {
        path: '/v1/bookings',
        phone: '9876543210',
        otp: '123',
      });

      const logged = sdk.log.mock.calls.map(([line]) => line).join('\n');
      expect(logged).toContain('/v1/bookings');
      expect(logged).not.toContain('9876543210');
      expect(logged).not.toContain('"otp":"123"');
    });

    it('reports a thrown non-Error as a generic error and never its value', () => {
      const sdk = fakeSdk();
      createCrashReporter({ sdk }).recordError({ phone: '9876543210' });

      const sent = sdk.recordError.mock.calls[0]?.[0] as Error;
      expect(sent).toBeInstanceOf(Error);
      expect(sent.message).toBe('Non-error value thrown');
    });

    it('reports the same error once per minute, then again', () => {
      const sdk = fakeSdk();
      let now = 1_000_000;
      const reporter = createCrashReporter({ sdk, now: () => now });

      reporter.recordError(new Error('same'));
      reporter.recordError(new Error('same'));
      now += 30_000;
      reporter.recordError(new Error('same'));
      expect(sdk.recordError).toHaveBeenCalledTimes(1);

      now += 31_000;
      reporter.recordError(new Error('same'));
      expect(sdk.recordError).toHaveBeenCalledTimes(2);
    });

    it('drops a flood of different errors after ten in a minute', () => {
      const sdk = fakeSdk();
      const reporter = createCrashReporter({ sdk, now: () => 1_000_000 });

      for (let i = 0; i < 25; i += 1) reporter.recordError(new Error(`distinct ${String(i)}`));

      expect(sdk.recordError).toHaveBeenCalledTimes(10);
    });
  });

  describe('breadcrumb', () => {
    it('redacts and truncates', () => {
      const sdk = fakeSdk();
      createCrashReporter({ sdk }).breadcrumb(`called 9876543210 ${'a'.repeat(2_000)}`);

      const line = sdk.log.mock.calls[0]?.[0] ?? '';
      expect(line).not.toContain('9876543210');
      expect(line.length).toBeLessThanOrEqual(1_003);
    });
  });

  describe('when the SDK misbehaves', () => {
    it('never lets a throw or a rejection reach the caller', async () => {
      const sdk = fakeSdk();
      sdk.setUserId.mockRejectedValue(new Error('native module gone'));
      sdk.setAttributes.mockImplementation(() => {
        throw new Error('not linked');
      });
      sdk.log.mockImplementation(() => {
        throw new Error('not linked');
      });
      sdk.recordError.mockImplementation(() => {
        throw new Error('not linked');
      });
      const reporter = createCrashReporter({ sdk });

      expect(() => {
        reporter.init(PROVENANCE);
        reporter.setUser('6f1d1c2e-4b8a-4d0e-9f3a-2a7c9b1e5d44');
        reporter.clearUser();
        reporter.breadcrumb('x');
        reporter.recordError(new Error('x'));
      }).not.toThrow();
      // The rejected promise must be handled, not left to surface as an unhandled rejection.
      await Promise.resolve();
    });
  });
});
