// Type-only imports: erased at runtime, so they do not break jest.mock factory hoisting.
import type * as ReactTypes from 'react';
import type * as ReactNativeTypes from 'react-native';
import type * as SafeAreaContextTypes from 'react-native-safe-area-context';

/**
 * Global test setup.
 *
 * Native modules are mocked here rather than per-test so that a module under test can import
 * them normally. Anything backend-shaped is deliberately absent — there is no contract to mock.
 */

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    isAvailableAsync: jest.fn(async () => true),
    __reset: () => store.clear(),
  };
});

/**
 * `@expo/vector-icons` loads its font asynchronously and setStates when it resolves, which fires
 * an act() warning in every component test. The glyph itself is not under test — our `Icon`
 * wrapper is — so the family is replaced by a plain Text that forwards all props (including the
 * accessibility props `Icon` sets).
 */
jest.mock('@expo/vector-icons/Feather', () => {
  const ReactNative = jest.requireActual('react-native') as typeof ReactNativeTypes;
  const React = jest.requireActual('react') as typeof ReactTypes;

  return {
    __esModule: true,
    default: ({ name, ...rest }: { name: string }) =>
      React.createElement(ReactNative.Text, rest, name),
  };
});

/**
 * Livvic ships as five TTFs under `assets/fonts/` and is registered through `expo-font` in
 * `src/app/_layout.tsx`. Under Jest there is no native font loader, so `useFonts` reports loaded
 * immediately — the typography tokens under test carry a `fontFamily` string, which is asserted
 * directly. Only `useFonts` is replaced; the rest of `expo-font` stays real.
 */
jest.mock('expo-font', () => ({
  ...(jest.requireActual('expo-font') as Record<string, unknown>),
  useFonts: () => [true, null],
}));

/**
 * `SafeAreaProvider` lives at the app root (`src/app/_layout.tsx`), so `useSafeAreaInsets` is
 * valid at runtime. Component tests render a component in isolation, without that provider, and
 * the hook throws rather than defaulting. Only the inset READERS are mocked — `SafeAreaView` and
 * everything else stay real — and they report zero, so no test can pass because an inset padded
 * a layout it should not have.
 */
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual(
    'react-native-safe-area-context',
  ) as typeof SafeAreaContextTypes;

  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        appEnv: 'development',
        apiBaseUrl: 'https://api.test.invalid',
        apiTimeoutMs: 15000,
        logLevel: 'silent',
        // No Maps key in tests: search reports `unconfigured`, which is a real, designed state
        // and the one a build without a key genuinely has.
        androidPackage: 'com.spoonhelp.userapp.test',
        iosBundleIdentifier: 'com.spoonhelp.userapp.test',
      },
    },
  },
}));

/**
 * Location and notifications are NATIVE modules with no headless implementation.
 *
 * Both are mocked to their "not available" answer rather than to a working one. That is the
 * state a test runner is genuinely in, and it means every screen that depends on them is
 * exercised on the path a real device also takes when permission is refused or the module is
 * missing — which is the path most likely to be wrong.
 */
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  hasServicesEnabledAsync: jest.fn(async () => true),
  getCurrentPositionAsync: jest.fn(async () => {
    throw new Error('No location provider in the test environment');
  }),
  // The OS's cached fix. `null` by default, so the fallback path is the one tests take unless
  // a test opts into a cached position explicitly.
  getLastKnownPositionAsync: jest.fn(async () => null),
  reverseGeocodeAsync: jest.fn(async () => []),
}));

/**
 * `react-native-webview` is a native view with no headless implementation.
 *
 * Mocked to a plain host that RENDERS and passes every prop straight through, so a test can find
 * it by `testID`, read the `source` handed to it, and — the part that matters — call
 * `onShouldStartLoadWithRequest` directly to prove which URLs the legal viewer will and will not
 * load. That rule is the viewer's whole security boundary, so it has to be reachable from a test
 * rather than only from a real WebView.
 */
jest.mock('react-native-webview', () => {
  const ReactNative = jest.requireActual('react-native') as typeof ReactNativeTypes;
  const React = jest.requireActual('react') as typeof ReactTypes;

  const WebView = (props: Record<string, unknown>) =>
    React.createElement(ReactNative.View, props, props['children'] as ReactTypes.ReactNode);

  return { __esModule: true, WebView, default: WebView };
});

/**
 * `react-native-maps` is a native view with no headless implementation.
 *
 * Mocked to plain hosts that RENDER but do nothing, so a test can assert that the map is present
 * (and absent before a point exists) without a Google Maps surface. Props pass straight through
 * untouched, so a test can drive `onRegionChangeStart` / `onRegionChangeComplete` and prove the
 * screen reads the coordinate the map settled on.
 *
 * The REF carries the imperative camera API, because the screen recentres through it. A ref that
 * resolved to a bare `View` would make `animateToRegion` a missing method, and every recentre a
 * crash that only the test environment sees.
 */
jest.mock('react-native-maps', () => {
  const ReactNative = jest.requireActual('react-native') as typeof ReactNativeTypes;
  const React = jest.requireActual('react') as typeof ReactTypes;

  // Props pass straight through, so `testID` still finds the node and every callback the screen
  // hands the map remains callable from a test.
  const passthrough = (props: Record<string, unknown>) =>
    React.createElement(ReactNative.View, props, props['children'] as ReactTypes.ReactNode);

  /**
   * Shared across renders and across the whole file, so a test can assert that a recentre was
   * asked for. `clearMocks` empties the recorded calls between tests; the identity is stable.
   */
  const animateToRegion = jest.fn();
  const animateCamera = jest.fn();
  /** A north-up camera, so the address map's compass stays hidden unless a test turns it. */
  const getCamera = jest.fn(() =>
    Promise.resolve({ center: { latitude: 0, longitude: 0 }, heading: 0, pitch: 0, zoom: 17 }),
  );

  function MapViewMock(props: Record<string, unknown>, ref: ReactTypes.Ref<unknown>) {
    React.useImperativeHandle(ref, () => ({ animateToRegion, animateCamera, getCamera }), []);
    return React.createElement(ReactNative.View, props, props['children'] as ReactTypes.ReactNode);
  }
  const MapView = React.forwardRef(MapViewMock);

  return {
    __esModule: true,
    default: MapView,
    Marker: passthrough,
    PROVIDER_GOOGLE: 'google',
    /** Exposed for tests that need to prove the camera moved (or did not). */
    __animateToRegion: animateToRegion,
    __animateCamera: animateCamera,
    __getCamera: getCamera,
  };
});

/**
 * Firebase messaging — the iOS token source.
 *
 * Android never reaches it (the provider branches on `Platform.OS`), but the module is imported
 * at the top of the provider either way, so every test that touches push needs it stubbed. The
 * default is a real-looking token: a test that cares asserts on the value, and one that does not
 * gets a working path rather than a throw.
 */
jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: jest.fn(() => ({})),
  getToken: jest.fn(async () => 'fcm-ios-token'),
  isDeviceRegisteredForRemoteMessages: jest.fn(() => true),
  registerDeviceForRemoteMessages: jest.fn(async () => undefined),
}));

/**
 * Firebase Remote Config — the app-update policy. Every parameter is unset by default, which is
 * "no requirement", so a test that mounts the root layout is never blocked by an update screen.
 */
jest.mock('@react-native-firebase/remote-config', () => ({
  getRemoteConfig: jest.fn(() => ({ settings: {} })),
  fetchAndActivate: jest.fn(async () => true),
  getString: jest.fn(() => ''),
}));

/**
 * Firebase Crashlytics. `core/crash` loads it lazily and never under Jest (`__DEV__` is true), so
 * this is a backstop: a test that deliberately enables reporting, or a future import of the module,
 * gets inert functions rather than a missing native module.
 */
jest.mock('@react-native-firebase/crashlytics', () => ({
  getCrashlytics: jest.fn(() => ({})),
  log: jest.fn(),
  recordError: jest.fn(),
  setUserId: jest.fn(async () => null),
  setAttributes: jest.fn(async () => null),
  setAttribute: jest.fn(async () => null),
}));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  IosAuthorizationStatus: {
    NOT_DETERMINED: 0,
    DENIED: 1,
    AUTHORIZED: 2,
    PROVISIONAL: 3,
    EPHEMERAL: 4,
  },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: false })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: false })),
  getDevicePushTokenAsync: jest.fn(async () => {
    throw new Error('No push token in the test environment');
  }),
  // The rotation listener the push hook subscribes to. Absent here, any test that mounted the
  // hook died on "not a function" rather than on anything it was written to check.
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));
