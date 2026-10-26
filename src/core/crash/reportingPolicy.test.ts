import { reportingPolicy } from './crashReporter';

/** `__DEV__` is a global the React Native runtime defines; tests flip it to exercise both builds. */
function setDev(value: boolean): void {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = value;
}

/**
 * Which builds may report to Crashlytics.
 *
 * The case that matters is iOS outside production. `GoogleService-Info.plist` belongs to the
 * PRODUCTION app (`com.spoonhelp.customer`), so a staging or dev iOS build that reported would file
 * its crashes under production and corrupt the numbers that matter most.
 */
describe('reportingPolicy', () => {
  it.each([
    ['android', 'production'],
    ['android', 'staging'],
    ['android', 'development'],
  ])(
    'reports on %s %s: each environment is its own Firebase app there',
    (platform, environment) => {
      expect(reportingPolicy({ platform, environment, isDev: false })).toBe('report');
    },
  );

  it('reports on iOS production', () => {
    expect(reportingPolicy({ platform: 'ios', environment: 'production', isDev: false })).toBe(
      'report',
    );
  });

  it.each(['staging', 'development', 'unknown', ''])(
    'silences iOS %p, which would otherwise file under the production app',
    (environment) => {
      expect(reportingPolicy({ platform: 'ios', environment, isDev: false })).toBe('silence');
    },
  );

  it.each(['android', 'ios', 'web'])('leaves the SDK alone in a dev build on %s', (platform) => {
    expect(reportingPolicy({ platform, environment: 'production', isDev: true })).toBe('off');
  });

  it('leaves the SDK alone on a platform it is not linked on', () => {
    expect(reportingPolicy({ platform: 'web', environment: 'production', isDev: false })).toBe(
      'off',
    );
  });
});

/**
 * The real module load, once per scenario, with the SDK mocked. Run in isolation because the
 * decision is made at import time.
 */
describe('crashReporter module load', () => {
  type Sdk = {
    getCrashlytics: jest.Mock;
    setCrashlyticsCollectionEnabled: jest.Mock;
    setUserId: jest.Mock;
    setAttributes: jest.Mock;
    log: jest.Mock;
    recordError: jest.Mock;
  };

  function loadWith(options: { os: string; environment: string; isDev: boolean }): {
    sdk: Sdk;
    reporter: { setUser(id: string): void };
  } {
    const sdk: Sdk = {
      getCrashlytics: jest.fn(() => ({ app: 'crashlytics' })),
      setCrashlyticsCollectionEnabled: jest.fn(async () => null),
      setUserId: jest.fn(async () => null),
      setAttributes: jest.fn(async () => null),
      log: jest.fn(),
      recordError: jest.fn(),
    };
    const previousDev = __DEV__;
    setDev(options.isDev);
    let reporter!: { setUser(id: string): void };
    jest.isolateModules(() => {
      jest.doMock('@react-native-firebase/crashlytics', () => sdk);
      jest.doMock('react-native', () => ({ Platform: { OS: options.os } }));
      jest.doMock('@core/buildProvenance', () => ({
        getBuildProvenance: () => ({ environment: options.environment }),
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      reporter = (require('./crashReporter') as { crashReporter: typeof reporter }).crashReporter;
    });
    setDev(previousDev);
    return { sdk, reporter };
  }

  it('iOS staging: switches collection off and reports nothing', () => {
    const { sdk, reporter } = loadWith({ os: 'ios', environment: 'staging', isDev: false });

    expect(sdk.setCrashlyticsCollectionEnabled).toHaveBeenCalledWith({ app: 'crashlytics' }, false);

    reporter.setUser('6f1d1c2e-4b8a-4d0e-9f3a-2a7c9b1e5d44');
    expect(sdk.setUserId).not.toHaveBeenCalled();
  });

  it('iOS production: reports, and does not switch collection off', () => {
    const { sdk, reporter } = loadWith({ os: 'ios', environment: 'production', isDev: false });

    reporter.setUser('6f1d1c2e-4b8a-4d0e-9f3a-2a7c9b1e5d44');

    expect(sdk.setUserId).toHaveBeenCalledWith(
      { app: 'crashlytics' },
      '6f1d1c2e-4b8a-4d0e-9f3a-2a7c9b1e5d44',
    );
    expect(sdk.setCrashlyticsCollectionEnabled).not.toHaveBeenCalled();
  });

  it('Android staging: reports', () => {
    const { sdk, reporter } = loadWith({ os: 'android', environment: 'staging', isDev: false });

    reporter.setUser('6f1d1c2e-4b8a-4d0e-9f3a-2a7c9b1e5d44');

    expect(sdk.setUserId).toHaveBeenCalledTimes(1);
    expect(sdk.setCrashlyticsCollectionEnabled).not.toHaveBeenCalled();
  });

  it('a dev build never touches the SDK, on any platform', () => {
    const { sdk } = loadWith({ os: 'ios', environment: 'production', isDev: true });

    expect(sdk.getCrashlytics).not.toHaveBeenCalled();
    expect(sdk.setCrashlyticsCollectionEnabled).not.toHaveBeenCalled();
  });

  it('survives an SDK that throws when switching collection off', () => {
    const sdk: Sdk = {
      getCrashlytics: jest.fn(() => ({})),
      setCrashlyticsCollectionEnabled: jest.fn(() => Promise.reject(new Error('not linked'))),
      setUserId: jest.fn(),
      setAttributes: jest.fn(),
      log: jest.fn(),
      recordError: jest.fn(),
    };
    setDev(false);

    expect(() =>
      jest.isolateModules(() => {
        jest.doMock('@react-native-firebase/crashlytics', () => sdk);
        jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
        jest.doMock('@core/buildProvenance', () => ({
          getBuildProvenance: () => ({ environment: 'staging' }),
        }));
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./crashReporter');
      }),
    ).not.toThrow();

    setDev(true);
  });
});
