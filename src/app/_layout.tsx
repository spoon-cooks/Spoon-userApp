import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isResolving } from '@core/auth';
import { getBuildProvenance, logBuildProvenance } from '@core/buildProvenance';
import { crashReporter } from '@core/crash';
import { QueryProvider, useAppStateFocus } from '@core/query';
import { createAppRuntime } from '@core/runtime';
import { RuntimeProvider } from '@core/runtimeContext';
import { useSessionStore } from '@core/store';
import { AppUpdateGate } from '@features/appUpdate';
import { ErrorBoundary, LaunchSplash, ThemeProvider } from '@ui';
import { BackdropTargetRoot } from '@ui/v2/Backdrop';

/**
 * Root layout: providers, session bootstrap, splash hold.
 *
 * The splash holds until BOTH the session resolves (audit §R) and Livvic has loaded, then
 * `src/app/index.tsx` redirects. Holding on the font matters: the design is set in Livvic
 * throughout, and releasing early flashes the platform face and reflows every screen.
 * Tab structure is deliberately NOT committed — no tab bar has been visually confirmed, and
 * ruling R-5 removed the pressure to add one (active bookings live on Home).
 */

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const runtime = useMemo(() => createAppRuntime(), []);
  const status = useSessionStore((state) => state.status);

  /**
   * Returning from WhatsApp, from Razorpay checkout or from the permission settings re-reads the
   * server state the screen is showing, and changes nothing about where the customer is (§19).
   * Mounted at the ROOT because it is a property of the app, not of any screen.
   */
  useAppStateFocus();

  // Every weight the design uses. RN cannot synthesise these — see tokens/primitives.ts.
  //
  // The faces are bundled under `assets/fonts/` and registered here under the SAME family names
  // the tokens emit, so `fontFamily: 'Livvic_600SemiBold'` resolves identically on both platforms.
  // They are loaded from the project's own asset directory rather than through
  // `@expo-google-fonts/livvic`, whose TTFs live inside `node_modules` — a path the app must not
  // depend on for shipped design assets (founder requirement §2).
  const [fontsLoaded, fontError] = useFonts({
    Livvic_400Regular: require('../../assets/fonts/Livvic-Regular.ttf'),
    Livvic_500Medium: require('../../assets/fonts/Livvic-Medium.ttf'),
    Livvic_600SemiBold: require('../../assets/fonts/Livvic-SemiBold.ttf'),
    Livvic_700Bold: require('../../assets/fonts/Livvic-Bold.ttf'),
    Livvic_900Black: require('../../assets/fonts/Livvic-Black.ttf'),
  });

  useEffect(() => {
    void runtime.session.bootstrap();
  }, [runtime]);

  useEffect(() => {
    logBuildProvenance();
    // Every crash report says which build it came from: the release SHA is what picks the source
    // map for a JS frame (Crashlytics does not symbolicate those itself).
    crashReporter.init(getBuildProvenance());
  }, []);

  // A font failure must not strand the user on the splash — fall through to the system face.
  const fontsPending = !fontsLoaded && fontError === null;
  const appReady = !isResolving(status) && !fontsPending;

  /**
   * Android's OS splash is a flat colour (all Android 12+ allows), so the designed splash is drawn
   * by `LaunchSplash` from inside the app and the OS splash is released as soon as that is on
   * screen. iOS has no such limit -- its launch storyboard IS the designed splash -- and keeps
   * holding it until the app is ready.
   */
  const [launchSplashDone, setLaunchSplashDone] = useState(Platform.OS !== 'android');
  const releaseSystemSplash = useCallback(() => void SplashScreen.hideAsync(), []);
  const finishLaunchSplash = useCallback(() => setLaunchSplashDone(true), []);

  useEffect(() => {
    if (appReady && Platform.OS !== 'android') {
      void SplashScreen.hideAsync();
    }
  }, [appReady]);

  return (
    <>
      {/*
       * Dark clock, battery and network icons on every screen: the app is light only
       * (`userInterfaceStyle: 'light'`), but left unset Android takes the icon colour from the
       * phone's own theme, and a phone in dark mode drew them white on the yellow headers.
       */}
      <StatusBar style="dark" />
      {fontsPending ? null : <RootProviders runtime={runtime} />}
      {launchSplashDone ? null : (
        <LaunchSplash ready={appReady} onShown={releaseSystemSplash} onDone={finishLaunchSplash} />
      )}
    </>
  );
}

function RootProviders({ runtime }: { readonly runtime: ReturnType<typeof createAppRuntime> }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider client={runtime.queryClient}>
          <RuntimeProvider runtime={runtime}>
            <ThemeProvider>
              <ErrorBoundary scope="root">
                {/* Over EVERYTHING, signed in or not: an old build is blocked at the login screen too. */}
                <AppUpdateGate>
                  {/* What every sheet's blurred scrim blurs on Android (`@ui/v2/Backdrop`). */}
                  <BackdropTargetRoot>
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="index" />
                      <Stack.Screen name="(auth)" />
                      <Stack.Screen name="(app)" />
                      {/* Legal sits OUTSIDE both groups on purpose — see `app/legal/[doc].tsx`. */}
                      <Stack.Screen name="legal/[doc]" />
                    </Stack>
                  </BackdropTargetRoot>
                </AppUpdateGate>
              </ErrorBoundary>
            </ThemeProvider>
          </RuntimeProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
