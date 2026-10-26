import type { QueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { createSessionGateway, isGuestModeAvailable } from '@/features/auth';

import { createApiClient } from './api';
import type { ApiClient } from './api';
import { createSessionController, secureGuestFlagStore, secureTokenStore } from './auth';
import type { SessionController } from './auth';
import { getConfig } from './config';
import type { AppConfig } from './config';
import { crashReporter } from './crash';
import { getLogger } from './logging';
import type { Logger } from './logging';
import { createQueryClient } from './query';
import { sessionStore } from './store';

/**
 * Composition root. Built once at app start and handed to the providers.
 *
 * Wiring only — no endpoints, no backend shapes, no business rules.
 *
 * ## Two clients, on purpose
 *
 * `authClient` carries no `AuthTokenProvider`. It exists to break a construction cycle that is
 * also a runtime cycle: the session controller needs a gateway to refresh with, the gateway needs
 * an API client, and an API client that knew about the session would answer a 401 on
 * `/auth/refresh` by... refreshing. The unauthenticated client cannot do that, so the loop is
 * impossible rather than merely guarded against.
 */

export interface AppRuntime {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly queryClient: QueryClient;
  readonly api: ApiClient;
  /** Unauthenticated client for the auth endpoints. Never use it for product reads. */
  readonly authApi: ApiClient;
  readonly session: SessionController;
}

export function createAppRuntime(): AppRuntime {
  const config = getConfig();
  const logger = getLogger('app');
  const queryClient = createQueryClient();

  // Auth endpoints only. No token provider, so it can never trigger the 401 -> refresh path.
  const authClient = createApiClient({
    baseUrl: config.apiBaseUrl,
    timeoutMs: config.apiTimeoutMs,
    logger: logger.child('api.auth'),
    auth: {
      getAccessToken: async () => null,
      refreshAccessToken: async () => null,
      onSessionExpired: () => undefined,
    },
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
    platform: Platform.OS,
  });

  const session = createSessionController({
    tokenStore: secureTokenStore,
    gateway: createSessionGateway({ api: authClient, logger: logger.child('auth.gateway') }),
    logger: logger.child('session'),
    dispatch: sessionStore.dispatch,
    onSessionCleared: () => {
      // Logout must clear all three: SecureStore (in the controller), the query cache (here)
      // and session status (via the machine). Missing the cache reset leaks the previous
      // user's bookings into the next session.
      queryClient.clear();
      // And the crash reports must stop naming the account that just signed out.
      crashReporter.clearUser();
    },
    guestFlag: secureGuestFlagStore,
    isGuestModeAvailable,
  });

  const api = createApiClient({
    baseUrl: config.apiBaseUrl,
    timeoutMs: config.apiTimeoutMs,
    logger: logger.child('api'),
    auth: session,
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
    platform: Platform.OS,
  });

  return { config, logger, queryClient, api, authApi: authClient, session };
}
