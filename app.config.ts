import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Expo app config.
 *
 * Values here are NON-SECRET only. `extra` is embedded in the JS bundle in plaintext and is
 * read back at runtime through `expo-constants` in `src/core/config`.
 *
 * NEVER write a key, token or secret INTO this file, and never put a server-side secret in
 * `extra` or in an EXPO_PUBLIC_* variable.
 *
 * The Google Maps platform keys below are the one deliberate exception, and they are not an
 * exception to the rule above: they are read from the ENVIRONMENT (never committed), and a Maps
 * client key is not a secret — it is a public identifier made safe by an APPLICATION RESTRICTION
 * in Google Cloud, exactly like a Razorpay publishable key. The backend's Google Routes key is a
 * true secret and is never read here.
 */

const APP_ENVS = ['development', 'staging', 'production'] as const;
type AppEnv = (typeof APP_ENVS)[number];

function resolveAppEnv(value: string | undefined): AppEnv {
  const found = APP_ENVS.find((env) => env === value);
  return found ?? 'development';
}

const APP_ENV = resolveAppEnv(process.env.APP_ENV);

const ENV_SUFFIX: Record<AppEnv, string> = {
  development: ' (Dev)',
  staging: ' (Staging)',
  production: '',
};

const BUNDLE_SUFFIX: Record<AppEnv, string> = {
  development: '.dev',
  staging: '.staging',
  production: '',
};

// docs/FIGMA_DESIGN_TOKENS.md — `color/grey/98`, the app's dominant warm off-white background.
const SPLASH_BACKGROUND = '#FFFDF5';

/**
 * The permission strings for rating feedback (Figma "Ratings" `1603:50`): one source for the
 * Info.plist key and every plugin that writes it, so they can never disagree.
 */
const MEDIA_PERMISSIONS = {
  camera: 'Spoon uses the camera when you add a photo or video to a rating.',
  microphone: 'Spoon uses the microphone when you record a voice note or a video for a rating.',
  photos: 'Spoon lets you choose photos and a video from your library to add to a rating.',
} as const;

/**
 * The deployed API, used when no `EXPO_PUBLIC_API_BASE_URL` is supplied in development.
 *
 * A developer who has not written a `.env` gets the real PRODUCTION deployment rather than an
 * unresolvable placeholder, which is the behaviour that makes "clone and run" work now that a
 * backend exists. This host used to be staging and was promoted: `APP_ENV` and `NODE_ENV` on the
 * Render service both read `production`, and it is the Pro-plan Supabase project, not the free
 * one that `spoon-api-staging.onrender.com` uses. Cloning without a `.env` therefore talks to the
 * live API and its real data -- which is worth knowing before you seed anything. Point it at `http://127.0.0.1:3000` (with `adb reverse`) to develop against a
 * local API — see `.env.example`.
 *
 * **Production still fails fast** when no base URL is supplied: a release build must be told
 * explicitly which environment it is talking to, never defaulted into one.
 */
const DEV_FALLBACK_API_BASE_URL = 'https://spoon-api-kalc.onrender.com';

/**
 * Native application identities — PER PLATFORM, deliberately not one shared constant.
 *
 * Production is `com.spoonhelp.customer` on BOTH platforms. The non-production variants keep the
 * `com.spoonhelp.userapp` stem, so a dev or staging build can sit on a device beside the release.
 *
 *                 Android                         iOS
 *   development   com.spoonhelp.userapp.dev       com.spoonhelp.userapp.dev
 *   staging       com.spoonhelp.userapp.staging   com.spoonhelp.userapp.staging
 *   production    com.spoonhelp.customer          com.spoonhelp.customer
 *
 * Android used to stay on `com.spoonhelp.userapp` here, on the reasoning that a package rename is
 * a new Play listing rather than an update. That was sound in the abstract and wrong in fact: the
 * Play listing this app releases through is registered as `com.spoonhelp.customer`, so an AAB
 * built as `com.spoonhelp.userapp` is refused at upload with "Your APK or Android App Bundle needs
 * to have the package name com.spoonhelp.customer" (2026-09-21). The identity the store requires
 * is not ours to choose, so the config follows it.
 *
 * The rename costs nothing here, and only because of WHEN it happened. A package rename after a
 * release really would strand every existing install on an app Play will never update again. This
 * app has never been released on either store -- the change landed while preparing the FIRST
 * submission -- so there is no install base to strand. After this release ships, the production
 * package is fixed for the life of the listing and cannot be revisited.
 *
 * `google-services.json` already carries a `com.spoonhelp.customer` client, so Firebase and push
 * are unaffected by the rename.
 *
 * Both also travel in `extra`, because the Places / Geocoding REST calls send them as
 * `X-Android-Package` / `X-Ios-Bundle-Identifier` so an application-restricted Maps key keeps
 * working. BOTH keys' restrictions must now list `com.spoonhelp.customer` before a release build
 * can render a map — see docs/GOOGLE_MAPS_CONFIGURATION.md.
 */
const ANDROID_PACKAGE =
  APP_ENV === 'production'
    ? 'com.spoonhelp.customer'
    : `com.spoonhelp.userapp${BUNDLE_SUFFIX[APP_ENV]}`;

const IOS_BUNDLE_IDENTIFIER =
  APP_ENV === 'production'
    ? 'com.spoonhelp.customer'
    : `com.spoonhelp.userapp${BUNDLE_SUFFIX[APP_ENV]}`;

const BUILD_PROVENANCE_RELEASE_SHA =
  process.env.SPOON_RELEASE_SHA ?? process.env.GIT_COMMIT_SHA ?? 'unknown';
const BUILD_PROVENANCE_TIMESTAMP = process.env.SPOON_BUILD_TIMESTAMP ?? new Date().toISOString();

function runtimeVersionLabel(value: ExpoConfig['runtimeVersion']): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return 'not-configured';
  return JSON.stringify(value);
}

function buildProvenance(runtimeVersion: ExpoConfig['runtimeVersion']) {
  return {
    releaseSha: BUILD_PROVENANCE_RELEASE_SHA,
    buildTimestamp: BUILD_PROVENANCE_TIMESTAMP,
    environment: APP_ENV,
    apiBaseUrlLabel: process.env.SPOON_API_BASE_URL_LABEL ?? APP_ENV,
    expoRuntimeVersion: process.env.EXPO_RUNTIME_VERSION ?? runtimeVersionLabel(runtimeVersion),
    expoUpdateId: process.env.EXPO_UPDATE_ID ?? 'not-applicable',
  } as const;
}

/**
 * Google Maps platform keys.
 *
 * Supplied ONLY through the environment (`.env`, which is gitignored) — never written into this
 * file, never committed. They are read here because two of the three consumers are NATIVE and can
 * only be configured at build time:
 *
 *   Maps SDK for Android  `com.google.android.geo.API_KEY` meta-data in AndroidManifest.xml
 *   Maps SDK for iOS      `GMSServices.provideAPIKey` in the AppDelegate, via Info.plist
 *   Places / Geocoding    HTTPS from JS, so the key has to reach the bundle through `extra`
 *
 * That last one means the key IS readable in a shipped build. That is inherent to calling Google's
 * web services from a client, and it is why the key must carry an APPLICATION restriction in Google
 * Cloud (Android: package + SHA-1; iOS: bundle id) — the restriction, not secrecy, is what makes a
 * client key safe. See docs/GOOGLE_MAPS_CONFIGURATION.md.
 *
 * These are NOT the backend's Google Routes key, which stays on the backend and is never read here.
 */
const GOOGLE_MAPS_ANDROID_API_KEY = process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? '';

const GOOGLE_MAPS_IOS_API_KEY = process.env.GOOGLE_MAPS_IOS_API_KEY ?? '';

/**
 * The signing certificate SHA-1 of the build being produced, uppercase hex WITHOUT separators.
 *
 * Sent as `X-Android-Cert` on Places and Geocoding requests, which is what makes an
 * "Android apps"-restricted key accept a REST call from JS (the native SDKs send it themselves).
 * Optional, because the header is only needed once the key is actually restricted — and because
 * it DIFFERS between the debug keystore and the release one, so it cannot be hardcoded.
 *
 *   debug:    keytool -list -v -keystore android/app/debug.keystore
 *                     -storepass android -alias androiddebugkey
 *   any APK:  apksigner verify --print-certs <apk>
 */
const ANDROID_SIGNING_SHA1 = (process.env.ANDROID_SIGNING_SHA1 ?? '')
  .replace(/[^0-9a-fA-F]/g, '')
  .toUpperCase();

/**
 * Android FCM credentials — `google-services.json`, supplied by PATH and never committed.
 *
 * `expo-notifications` gets an Android device token from Firebase, and Firebase needs this file
 * baked into the native project. Without it `getDevicePushTokenAsync` cannot return a token, the
 * push provider reports "no token", and registration is skipped — which is the correct fail-closed
 * behaviour, but it means push does not work at all.
 *
 * Supplied through the environment rather than checked in because the file carries the project's
 * Firebase identifiers and is regenerated per app package. An absent value simply omits the key,
 * so a build without Firebase still succeeds and still runs.
 *
 * iOS has its own file, below.
 */
const GOOGLE_SERVICES_JSON = process.env.GOOGLE_SERVICES_JSON ?? '';

/**
 * iOS FCM credentials — `GoogleService-Info.plist`, supplied by PATH exactly as Android's is.
 *
 * This file has existed at the repo root and as an EAS `production` file secret since 4 September
 * and was referenced by NOTHING, which is a large part of why iOS push has never worked.
 *
 * It matters now because the app takes its iOS token from the Firebase SDK rather than from APNs.
 * `expo-notifications`' `getDevicePushTokenAsync` returns a raw APNs device token on iOS, and the
 * backend has one provider -- FCM -- which cannot address one: every iOS send failed with an
 * invalid registration token, and had done since the feature shipped. The Firebase iOS SDK mints
 * a real FCM token instead, and it needs this file baked into the native project to know which
 * Firebase app it belongs to.
 *
 * An absent value omits the key, so a build without it still succeeds and still runs -- push is
 * simply unavailable, reported as `native-unavailable` by the token provider.
 */
const GOOGLE_SERVICES_PLIST = process.env.GOOGLE_SERVICES_PLIST ?? '';

/**
 * Production refuses to build without them, for the same reason it refuses without an API base
 * URL: a release that silently ships a blank map key renders a grey square on every customer's
 * address screen and no one finds out until support does. Development is allowed to continue —
 * the map degrades to its "unavailable" state and the rest of the flow still works.
 */
if (
  APP_ENV === 'production' &&
  (GOOGLE_MAPS_ANDROID_API_KEY === '' || GOOGLE_MAPS_IOS_API_KEY === '')
) {
  throw new Error(
    'GOOGLE_MAPS_ANDROID_API_KEY and GOOGLE_MAPS_IOS_API_KEY must be set for a production build. ' +
      'Supply them in the environment; never commit them.',
  );
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,

  name: `Spoon${ENV_SUFFIX[APP_ENV]}`,
  slug: 'spoon-user-app',
  version: '1.0.0',

  orientation: 'portrait',

  // Native only — the web target and its peers were removed as unused.
  platforms: ['ios', 'android'],

  scheme: 'spoon',
  userInterfaceStyle: 'light',

  icon: './assets/images/icon.png',

  ios: {
    bundleIdentifier: IOS_BUNDLE_IDENTIFIER,
    supportsTablet: false,
    ...(GOOGLE_SERVICES_PLIST === '' ? {} : { googleServicesFile: GOOGLE_SERVICES_PLIST }),
    infoPlist: {
      // The rate card's Gallery (Figma "Ratings" `1603:50`, M1) picks photos and a video to add
      // to a rating. The same words as `MEDIA_PERMISSIONS` below, which the picker's plugin writes.
      NSPhotoLibraryUsageDescription: MEDIA_PERMISSIONS.photos,

      /**
       * HTTPS is all this app speaks, and that is exempt. Without the key App Store Connect asks
       * the encryption question on every single build and holds it until answered, which across
       * fourteen iOS builds is fourteen interruptions for one unchanging answer.
       */
      ITSAppUsesNonExemptEncryption: false,

      /**
       * Recurring UPI Autopay by UPI Intent (Figma 2316:3558, "Choose your UPI app"). iOS answers
       * `canOpenURL` only for schemes listed here, so this is how the app learns which UPI apps
       * are installed, and how a link reaches the picked one. Must match `IOS_UPI_SCHEMES` in
       * `src/features/recurringSetup/autopay/upiApps.ts` (a test checks). A build without these
       * uses Razorpay's Checkout instead.
       */
      LSApplicationQueriesSchemes: ['phonepe', 'tez', 'paytmmp', 'credpay', 'bhim'],
    },

    /**
     * The privacy manifest Apple reads, and cross-checks against the answers given in App Store
     * Connect. Expo's generated `PrivacyInfo.xcprivacy` declares `NSPrivacyCollectedDataTypes` as
     * an empty array -- on an app that collects a name, a phone number and a precise location,
     * that is not vague, it is false, and a contradiction between the two is a firmer rejection
     * than any wording problem.
     *
     * Declared here rather than by editing the file: `ios/` is generated and gitignored, so an
     * edit there survives exactly until the next prebuild -- the same trap that put
     * `SYSTEM_ALERT_WINDOW` in the first production AAB.
     *
     * Each type is linked to the purpose it is actually used for and, per Apple's definitions,
     * `linked` because all of it hangs off an account. None of it is used for tracking: nothing
     * here is shared with a data broker or joined with data from other companies' apps.
     */
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeName',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypePhoneNumber',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeEmailAddress',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypePreciseLocation',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypePhysicalAddress',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypePurchaseHistory',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        /**
         * A rating's photos, video and voice note (Figma "Ratings" `1603:50`): what the customer
         * chooses to add, uploaded to Spoon's own storage and read by Ops to act on the feedback.
         */
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypePhotosorVideos',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeAudioData',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeCrashData',
          NSPrivacyCollectedDataTypeLinked: false,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
      ],
    },
  },

  android: {
    package: ANDROID_PACKAGE,

    /**
     * `SYSTEM_ALERT_WINDOW` -- "Display over other apps" -- reaches the manifest from Expo's own
     * prebuild template, not from this config or from any dependency: `android/` is generated and
     * gitignored, so the line nobody wrote is the line nobody can delete for good either. It was
     * in the first production AAB we built, and Play treats it as a sensitive permission: it
     * invites Data safety scrutiny and sometimes a policy questionnaire, neither of which this app
     * has an answer for, because nothing here draws an overlay. React Native's dev menu is what
     * wants it, and the dev menu ships in debug variants that declare it themselves.
     *
     * `blockedPermissions` makes prebuild emit `tools:node="remove"` for it, so the merge drops it
     * from every variant this config produces rather than us editing a generated file that the
     * next prebuild overwrites.
     */
    blockedPermissions: ['android.permission.SYSTEM_ALERT_WINDOW'],

    ...(GOOGLE_SERVICES_JSON === '' ? {} : { googleServicesFile: GOOGLE_SERVICES_JSON }),

    /**
     * Android composites an adaptive icon from a background and a foreground, and ours was the
     * wordmark in black over `SPLASH_BACKGROUND` -- an off-white. Correct, and completely unlike
     * `icon.png`, which iOS uses: black over the brand's yellow-to-lime ramp. The launcher showed
     * what looked like a monochrome icon next to a colourful one on the App Store.
     *
     * `backgroundImage` wins over `backgroundColor` where both are given, so the ramp is now an
     * image rather than a flat colour -- a single colour cannot express a gradient, and picking
     * one end of it would be choosing a new brand colour in a build file. The image is generated
     * from `icon.png`'s own four corners, so the two icons are the same artwork and stay that way
     * if the source changes. `backgroundColor` stays as the fallback for anything that asks for a
     * colour and cannot take an image.
     */
    adaptiveIcon: {
      backgroundColor: SPLASH_BACKGROUND,
      backgroundImage: './assets/images/android-icon-background.png',
      foregroundImage: './assets/images/android-icon-foreground.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },

    predictiveBackGestureEnabled: false,
  },

  plugins: [
    // Pins the Android NDK. `expo-root-project` defaults to 27.1.12297006, whose copy on the
    // build machine is a damaged package shipping clang 17 — which cannot compile
    // react-native-reanimated's constrained partial specialisations, nor React Native's own
    // `std::format`. See plugins/withNdkVersion.js for the measurements behind the choice.
    './plugins/withNdkVersion',
    './plugins/withStagingSigning',

    'expo-router',

    // Livvic is loaded at runtime in `src/app/_layout.tsx`; the plugin registers the native
    // module that loading depends on.
    'expo-font',

    /**
     * Push. The JS side is already wired — registration, the rotation listener, the received
     * handler and the tap-to-route deep link all live in `@features/notifications` — but every
     * one of them needs the NATIVE module, and on iOS the plugin is also what adds the
     * `aps-environment` entitlement.
     *
     * VERIFIED in the shipped build (iOS #18, `7fa8f6f`): `ExpoNotifications` is bundled and
     * `embedded.mobileprovision` carries `aps-environment: production`, so an ALERT notification
     * displays. `UIBackgroundModes` is NOT in the built `Info.plist`, contrary to what this
     * comment used to claim — the plugin does not add it. A visible notification does not need
     * it; a SILENT `content-available` push does, and would be dropped while backgrounded. Left
     * absent deliberately for now: adding a background mode is an Apple-facing declaration, and
     * nothing in the product sends silent pushes.
     *
     * No icon or colour is configured, deliberately: the design does not specify a notification
     * icon, and choosing one here would be a visual decision made in a build file.
     */
    'expo-notifications',

    /**
     * Firebase, for an FCM token on iOS (and, on Android only, Crashlytics -- see below).
     *
     * `expo-notifications` returns a raw APNs device token there, and the backend has a single
     * provider -- FCM -- with no APNs path anywhere in it, so every iOS send was addressed to a
     * token FCM cannot deliver to. Android is untouched by this: it already mints a real FCM token
     * through `expo-notifications` and that path keeps working exactly as it did.
     *
     * `messaging` is listed as well as `app` because the token API lives in it.
     */
    '@react-native-firebase/app',
    '@react-native-firebase/messaging',

    /**
     * Crashlytics, on both platforms.
     *
     * Android: the plugin edits Gradle (the Crashlytics Gradle plugin, which also uploads the R8
     * mapping file so native frames are readable).
     *
     * iOS: the plugin does nothing there. The pod and its "[RNFB] Crashlytics Configuration" dSYM
     * upload build phase arrive through AUTOLINKING, which is why this module was once excluded for
     * iOS in `package.json` while Android shipped first. That exclusion is gone. The dSYM script
     * runs from `${PODS_ROOT}/FirebaseCrashlytics/run`, which is the path that exists because
     * `withRNFirebasePods` keeps Firebase on CocoaPods rather than SPM.
     *
     * ## Only PRODUCTION iOS builds may report
     *
     * `GoogleService-Info.plist` is registered for `com.spoonhelp.customer` ONLY; there is no iOS
     * Firebase app for `.dev` or `.staging`. A non-production iOS build carrying that file would
     * file its crashes under the PRODUCTION app and pollute the numbers that matter most, so
     * `src/core/crash/crashReporter.ts` switches collection off there. If iOS dev/staging apps are
     * registered in Firebase later, give each build its own plist and relax that rule.
     */
    '@react-native-firebase/crashlytics',

    /**
     * `useFrameworks: 'static'` is REQUIRED by react-native-firebase, and it changes how every
     * CocoaPod in this project links -- not only Firebase's. `react-native-maps`,
     * `react-native-razorpay`, `react-native-reanimated` and `react-native-webview` are all in the
     * tree, and this setting is the usual cause of a first iOS build failing after Firebase is
     * added. Recorded here so the next person reading a linker error knows where it came from.
     *
     * Android is deliberately left alone.
     */
    [
      'expo-build-properties',
      {
        ios: { useFrameworks: 'static' },
      },
    ],

    /**
     * Static linkage and react-native-firebase's SPM resolution are incompatible, and the fix has
     * to reach the Podfile, which is generated. See the plugin for the full reasoning.
     */
    './plugins/withRNFirebasePods',

    /**
     * On Android, react-native-firebase's own FCM receiver otherwise outranks expo-notifications'
     * and silently absorbs every push before expo-notifications ever sees it. See the plugin.
     */
    './plugins/withAndroidSingleFcmReceiver',

    /**
     * Android only: react-native-compressor's TAndroidLame asks for allowBackup="true", which the
     * manifest merger refuses against the app's "false". Keeps "false". See the plugin.
     */
    './plugins/withAndroidKeepNoBackup',

    /**
     * Instant / Schedule / Recurring as OS-level shortcuts: Spotlight's buttons beside the app on
     * iOS, launcher search and the icon's long-press menu on Android. See the plugin.
     */
    './plugins/withAppShortcuts',

    /**
     * Android only: draws the designed launch splash natively from the first frame, so the flat
     * system splash is not held on screen while the JS bundle loads. See the plugin.
     */
    './plugins/withAndroidLaunchArtwork',

    [
      'expo-splash-screen',
      {
        backgroundColor: SPLASH_BACKGROUND,
        // The real "spoon" wordmark (cropped from `icon.png`'s own black foreground layer, the
        // same artwork `android-icon-foreground.png` already uses), not the unbranded chevron
        // this pointed at before -- that placeholder was never swapped for real branding, and its
        // plain abstract shape on a blank field read as a generic template splash rather than
        // Spoon's own. `imageWidth` raised from 76 to fit the wordmark's text legibly; the old
        // width was tuned for the chevron's simpler, more compact silhouette.
        //
        // This is Android's splash too (and iOS's fallback for anything that can't take the `ios`
        // override below): Android 12+'s OS-level Splash Screen API is icon-on-solid-colour ONLY
        // -- no custom full-bleed image is possible there, the same platform ceiling the adaptive
        // icon comment above already documents. `SPLASH_BACKGROUND` stays a flat colour rather
        // than one end of the gradient chosen ad hoc in a build file, matching that reasoning.
        image: './assets/images/splash-icon.png',
        imageWidth: 180,

        /**
         * Android shows the SAME designed splash as iOS, in two steps. The OS-level splash (all
         * the platform allows, per the note above) is a flat `#F1ED4D` -- the artwork's own
         * colour at mid-height, sampled from `splash-background-ios.png` (top `#FEE24D`, bottom
         * `#E3F94E`) -- with a fully transparent icon. A flat colour cannot match a gradient, but
         * the middle is within ~14 levels per channel of every point on it, so the hand-over to the
         * real artwork reads as the gradient appearing, not as a different screen. `LaunchSplash` (`src/ui/feedback/LaunchSplash.tsx`) then draws
         * `splash-background-ios.png` full-bleed from inside the app and holds it until the app
         * is ready, exactly as the iOS storyboard does.
         */
        android: {
          backgroundColor: '#F1ED4D', // mid-height of splash-background-ios.png; a literal, like SPLASH_BACKGROUND above
          // The wordmark on its own, with the middle of its LETTERS on the canvas centre (the OS
          // centres the canvas, not the ink, and the fork rises above the letters). `LaunchSplash` and the native artwork shift the artwork so ITS wordmark lands on
          // the same centre. 190 keeps the fork tip inside Android 12+'s circular icon mask (192dp).
          image: './assets/images/splash-wordmark-android.png',
          imageWidth: 190,
        },

        /**
         * iOS has no such ceiling -- `SplashScreen.storyboard` can hold any image full-bleed --
         * so it gets the actual designed splash: Figma `1:4272`'s yellow-to-lime ramp (the same
         * pair `android-icon-background.png` already renders) with the wordmark centred on it,
         * flattened into one image because the native launch screen cannot compose a gradient and
         * a logo as two live layers. `enableFullScreenImage_legacy` is the flag name, not its
         * status -- it is still the plugin's only supported route to an edge-to-edge image
         * (`withIosSplashScreenStoryboardImage.js`: without it, the image is pinned to a small
         * `imageWidth`-square frame instead of the screen's own bounds).
         */
        ios: {
          image: './assets/images/splash-background-ios.png',
          resizeMode: 'cover',
          enableFullScreenImage_legacy: true,
          /**
           * The gradient's own top stop (`palette.yellow500`, `#FFD600`), not `SPLASH_BACKGROUND`.
           *
           * `enableFullScreenImage_legacy` pins the image with autolayout constraints rather than
           * an immediate frame (`withIosSplashScreenStoryboardImage.js`'s base rect is a stale
           * 414x736 reference size, stretched to the real screen only once those constraints
           * resolve), and the view's own background paints before that first layout pass
           * completes. On a cold launch that gap is a real flash of whatever this colour is --
           * previously the pale cream `SPLASH_BACKGROUND`, jarringly different from the yellow
           * gradient and read as a separate blank screen ahead of the real one. Matching it to the
           * gradient's own top colour makes that same gap visually disappear instead.
           */
          backgroundColor: '#FFD600', // palette.yellow500 -- a literal here, like SPLASH_BACKGROUND above; primitives.ts imports react-native and cannot load in this Node config context
        },
      },
    ],

    [
      // The address step (`53:31`) needs the customer's coordinates so the BACKEND can decide
      // serviceability. Foreground only — Spoon has no reason to track anyone in the background,
      // and asking for it would be both a review risk and a privacy one.
      'expo-location',
      {
        locationWhenInUsePermission:
          'Spoon uses your location to find your address and check whether we serve your area.',

        /**
         * `false` DELETES the key rather than leaving Expo's default text
         * (`@expo/config-plugins` ios/Permissions.js: `if (permissions[p] === false) delete
         * infoPlist[p]`). Setting them to `undefined` in `ios.infoPlist` would not work twice
         * over: an undefined value disappears when the config is serialised, and this plugin
         * writes the plist AFTER `infoPlist` is applied, so it would win anyway.
         *
         * They have to go because the app never asks for them. `deviceLocation.ts` calls
         * `requestForegroundPermissionsAsync` and nothing else, so "Always" and motion described
         * capabilities this app does not have, in Expo's unedited placeholder wording -- and a
         * reviewer who reads "Allow Spoon to access your location" over an Always key is owed an
         * answer to why a cooking app wants one.
         */
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,

        /**
         * Motion CANNOT be removed the way the two Always keys can. Build 15 failed Apple's binary
         * check with ITMS-90683 naming this key: `expo-location` LINKS CoreMotion, and Apple's
         * check reads what the binary references, not what the code calls -- "while your app might
         * not use these APIs, a purpose string is still required". So it gets a real string, in
         * the same shape as the photo-library one above, which is in this config for exactly this
         * reason: a capability a bundled component drags in, described honestly rather than with
         * Expo's placeholder about detecting your current motion activity.
         */
        motionUsagePermission:
          'Spoon does not use motion data directly. This declaration is required for compatibility with a bundled location component.',

        isAndroidBackgroundLocationEnabled: false,
        isIosBackgroundLocationEnabled: false,
      },
    ],

    [
      // The map canvas on `53:31`. `react-native-maps` ships its own Expo config plugin, and
      // these two props are its official surface: `androidGoogleMapsApiKey` writes the
      // `com.google.android.geo.API_KEY` manifest meta-data, `iosGoogleMapsApiKey` writes
      // Info.plist AND adds the GoogleMaps AppDelegate import/init plus the CocoaPods entry.
      //
      // APPENDED, never substituted: `./plugins/withNdkVersion` must keep running (it pins the
      // NDK this machine can actually compile with) and every other plugin above is unchanged.
      'react-native-maps',
      {
        androidGoogleMapsApiKey: GOOGLE_MAPS_ANDROID_API_KEY,
        iosGoogleMapsApiKey: GOOGLE_MAPS_IOS_API_KEY,
      },
    ],

    // The rate card's Voice / Media / Write block (Figma "Ratings" `1603:50`): a voice note, the
    // camera for photos and a 30-second video (M3 – M5), and the system picker for the gallery.
    // All three plugins write the camera / microphone / photos strings; they are handed the SAME
    // words so whichever runs last cannot leave Expo's placeholder or delete a key another needs.
    [
      'expo-camera',
      {
        cameraPermission: MEDIA_PERMISSIONS.camera,
        microphonePermission: MEDIA_PERMISSIONS.microphone,
        recordAudioAndroid: true,
        barcodeScannerEnabled: false,
      },
    ],
    [
      'expo-audio',
      {
        microphonePermission: MEDIA_PERMISSIONS.microphone,
        recordAudioAndroid: true,
        // A rating's voice note plays and records only on screen. Background playback would add
        // the FOREGROUND_SERVICE_MEDIA_PLAYBACK permission (a Play declaration) and iOS's `audio`
        // background mode for nothing.
        enableBackgroundPlayback: false,
        enableBackgroundRecording: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: MEDIA_PERMISSIONS.photos,
        cameraPermission: MEDIA_PERMISSIONS.camera,
        microphonePermission: MEDIA_PERMISSIONS.microphone,
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
  },

  extra: {
    ...config.extra,

    /**
     * Links this local Expo project to the EAS project:
     *
     * @lakshay-spoon/spoon-user-app
     *
     * This is a public project identifier, not a secret.
     */
    eas: {
      projectId: 'bab1e270-8234-46ea-85d0-37c40dee92e1',
    },

    appEnv: APP_ENV,

    // Public. Only the iOS Update button needs it; see `src/features/appUpdate/storeUrl.ts`.
    // Defaults to the listing's App Store Connect id (`ascAppId` in eas.json).
    iosAppStoreId: process.env.EXPO_PUBLIC_IOS_APP_STORE_ID ?? '6803578695',

    // Production keeps failing fast at startup (`src/core/config/env.ts`) rather than letting an
    // unusable value reach a fetch URL; development falls back to the deployed API.
    apiBaseUrl:
      process.env.EXPO_PUBLIC_API_BASE_URL ??
      (APP_ENV === 'production' ? '' : DEV_FALLBACK_API_BASE_URL),

    buildProvenance: buildProvenance(config.runtimeVersion),

    apiTimeoutMs: Number(process.env.EXPO_PUBLIC_API_TIMEOUT_MS ?? 15000),

    logLevel: process.env.EXPO_PUBLIC_LOG_LEVEL ?? (APP_ENV === 'production' ? 'warn' : 'debug'),

    /**
     * Places (New) and Geocoding are HTTPS APIs called from JS, so their key must be in the
     * bundle. Both platforms' keys are carried and the RUNTIME picks by `Platform.OS`, because
     * `extra` is shared across platforms and this config is evaluated once.
     *
     * Deliberately NOT an `EXPO_PUBLIC_` variable: those are inlined into every module that reads
     * `process.env`, which would scatter the key through the bundle. Routed through `extra` it has
     * exactly one reader — `src/features/address/location/googlePlaces.ts`.
     */
    googleMapsAndroidApiKey: GOOGLE_MAPS_ANDROID_API_KEY,

    googleMapsIosApiKey: GOOGLE_MAPS_IOS_API_KEY,

    /**
     * Sent as `X-Android-Package` / `X-Android-Cert` / `X-Ios-Bundle-Identifier` on every Places
     * and Geocoding request, so an APPLICATION-restricted key keeps working from the app. Both are
     * public facts about the build (anyone can read them out of the APK); carrying them is what
     * lets the key be locked down in Google Cloud without another release.
     */
    androidPackage: ANDROID_PACKAGE,
    iosBundleIdentifier: IOS_BUNDLE_IDENTIFIER,
    androidSigningSha1: ANDROID_SIGNING_SHA1,
  },
});
