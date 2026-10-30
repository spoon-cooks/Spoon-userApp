# Backend integration map

**What this is:** the actual state of frontend ↔ backend integration, endpoint by endpoint. It
records what is wired, not what is planned. Anything not yet real is marked as a gap rather than
described as if it worked.

**Verified against:** a local backend built from `D:\spoon-backend` at `origin/main` = `6497589`
(a clean tree — the Phase 10 work described in earlier revisions of this document as
"uncommitted" is now MERGED), run against local PostGIS/Redis with the repo's own Bengaluru
serviceability polygons imported and all 28 migrations applied, including
`1754320700000_phase10-resolved-product-rules`. Contracts below were captured from LIVE
responses on 2026-08-18 unless marked *contract-read*.

**Deployed API:** `https://spoon-api-kalc.onrender.com` — healthy (`/health/live` 200,
`/health/ready` reports postgres, postgis and redis all healthy) but still serving a build that
predates the merge: `GET /v1/catalogue` answers 404 there. See DEP-4.

**Recovery note:** this document has now survived two interrupted sessions. §6 records the first;
§8 records the third pass (payment, location, push, Call Cook, clock skew) and is where a
subsequent session should start reading.

---

## 1. Transport

| Concern | Where | State |
| --- | --- | --- |
| Base URL | `EXPO_PUBLIC_API_BASE_URL` → `app.config.ts` → `src/core/config/env.ts` | DONE. No URL is hardcoded in a screen or feature module. Production fails fast when unset; development falls back to the Render deployment. |
| Success envelope `{ data }` | `src/core/api/envelope.ts`, unwrapped in `client.ts` | DONE. Unwrapped once, centrally. A non-enveloped 2xx is rejected at the boundary. `data: null` is legitimate and passes through. |
| Error envelope `{ error: { code, message, requestId } }` | `envelope.ts` + `errors/normalize.ts` | DONE. `code` and `requestId` are preserved verbatim on every `AppError`. Nothing branches on HTTP status alone. |
| Error → UI copy | `src/core/errors/messages.ts` | DONE for the mapping; copy itself is FIGMA_PENDING. All 20 backend codes are mapped; unknown codes degrade to the transport-kind message. |
| Retry policy | `errors/types.ts`, `core/query/queryClient.ts` | DONE. `RATE_LIMITED` and `IDEMPOTENCY_CONFLICT` are retryable despite being 4xx; `INTERNAL_ERROR` is not, despite being 5xx. Mutations never auto-retry. |
| Idempotency-Key | `src/core/api/idempotency.ts` | DONE. Keys are scoped to the INTENT and stable across retries; released on success. Applied to every endpoint that demands one. |
| Auth transport | `client.ts` + `core/auth/*` | DONE. 401 → single-flight refresh → retry once → terminate. Auth endpoints use a separate unauthenticated client so refresh cannot recurse. |
| Token storage | `core/auth/tokenStore.ts` (SecureStore only) | DONE. No token touches AsyncStorage, Zustand or React Query. `deviceId` lives beside them. |

---

## 2. Endpoint map

Legend — **WIRED**: called by the app through a typed module with a zod boundary.
**PARTIAL**: wired but something the screen needs is missing. **SEAM**: written and ready, blocked
on an approved dependency. **GAP**: no backend capability.

| Flow | Screen | Endpoint | Method | Query/mutation | View model | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Send OTP | Login `53:174` | `/v1/auth/otp/send` | POST | `useSendOtp` | `LoginViewModel` | **WIRED** |
| Verify OTP | OTP `227:1649` | `/v1/auth/otp/verify` | POST | `useVerifyOtp` → `session.signIn` | `OtpViewModel` | **WIRED** |
| Refresh | — | `/v1/auth/refresh` | POST | `createSessionGateway` | — | **WIRED** |
| Logout | Profile `6:663` | `/v1/auth/logout` | POST | `useSignOut` | — | **WIRED** |
| Identity | Profile | `/v1/me` | GET | `useMe` | `ProfileViewModel` | **WIRED** |
| Profile update | — | `/v1/me/profile` | PUT | `useUpdateProfile` | — | **WIRED** (no screen yet: the "Complete profile" CTA has no designed form) |
| Catalogue | Home / Schedule / Instant / Cancellation / Extension | `/v1/catalogue` | GET | `useCatalogue` | many | **WIRED** |
| Addresses | Saved addresses `68:214` | `/v1/me/addresses` | GET | `useAddresses` | `AddressListViewModel` | **WIRED** |
| Create address | Address details `60:655` | `/v1/me/addresses` | POST | `useCreateAddress` | — | **WIRED** (blocked upstream by the map gap) |
| Update / delete | Address edit `228:1801` | `/v1/me/addresses/:id` | PUT / DELETE | `useUpdateAddress` / `useDeleteAddress` | — | **WIRED** |
| Serviceability | Address location `53:31` | `/v1/serviceability/check` | POST | `useServiceabilityCheck` | `serviceabilityMessage` | **WIRED** (no coordinates source — see FE-1) |
| Instant availability | Instant sheet `1:728` | `/v1/availability/instant` | GET | `useInstantAvailability` | `InstantViewModel` | **WIRED** |
| Scheduled availability | Schedule `275:4488` | `/v1/availability/scheduled` | GET | `useScheduledAvailability` | `ScheduleViewModel` | **WIRED** |
| Quote | Instant / Schedule | `/v1/bookings/quote` | POST | `useQuote` | `InstantViewModel.ctaLabel` | **WIRED** — the CTA amount is the quote's total |
| Create booking | Instant / Schedule | `/v1/bookings` | POST | `useBookingSubmission` | — | **WIRED** — creates a booking on HOLD; payment is FE-3 |
| Booking detail | Service flow `308:3134` | `/v1/bookings/:id` | GET | `useBookingDetail` | `BookingDetailViewModel` | **WIRED** |
| Active booking | Home `333:3834` | `/v1/me/bookings/active` | GET | `useActiveBookings` | `HomeActiveBookingViewModel` | **WIRED** |
| History | Past bookings `6:227` | `/v1/me/bookings` | GET | `useBookingHistory` | `BookingListViewModel` | **WIRED** |
| Refunds | Refunds `71:615` | `/v1/me/refunds` | GET | `useRefunds` | `BookingListViewModel` | **PARTIAL** — row shape unverified (empty list on every reachable account) |
| Cancellation preview | Cancellation `104:2336` | `/v1/bookings/:id/cancellation-preview` | GET | `useCancellationPreview` | `CancellationViewModel` | **WIRED** — now with a real booking id |
| Cancel | Cancellation `104:2260` | `/v1/bookings/:id/cancel` | POST | `useCancelBooking` | `cancelAllowed` | **WIRED** — B-11 closed; reachable from the booking screen |
| Reschedule options | Reschedule `275:5217` | `/v1/bookings/:id/reschedule-options` | GET | `useRescheduleOptions` | `rescheduleAllowed` | **WIRED** |
| Reschedule | Reschedule | `/v1/bookings/:id/reschedule` | POST | `useRescheduleBooking` | — | **WIRED** |
| Tracking | En route `3:1381` / Arrived `3:1658` / In service `101:1812` | `/v1/bookings/:id/tracking` | GET | `useTracking` | `TrackingViewModel`, `ArrivedViewModel.otpCode`, `InServiceViewModel.otpCode` | **WIRED** — supplies the live ETA AND the service OTP *(contract-read; 404s until a cook is travelling)* |
| Extension options | Extension `3:2002` | `/v1/bookings/:id/extension-options` | GET | `useExtensionOptions` | `ExtensionViewModel` | **WIRED** *(contract-read)* |
| Create extension | Extension | `/v1/bookings/:id/extensions` | POST | `useCreateExtension` | — | **WIRED** *(contract-read)* |
| Rating | Completion `299:1424` | `/v1/bookings/:id/rating` | PUT | `useRateBooking` | — | **WIRED** *(contract-read)* |
| Tip | Tip sheet `306:2885` | `/v1/bookings/:id/tips` | POST | `useTipCook` | `TipSheetViewModel` | **WIRED** *(contract-read)* |
| Payment order | Instant / Schedule | `/v1/bookings/:id/payments/order` | POST | `usePayForBooking` | — | **WIRED** — order created live against the Razorpay sandbox (201) |
| Payment verify | Instant / Schedule | `/v1/bookings/:id/payments/verify` | POST | `usePayForBooking` | — | **WIRED** — reached only from a real checkout result; not exercisable headlessly |
| Cook contact | En route / Arrived / In service `94:936` | `/v1/bookings/:id/cook-contact` | GET | `useCallCook` | `callCookAllowed` | **WIRED** — on-press only; 404 verified live |
| Push token | — | `/v1/me/push-token` | PUT | `useRegisterPushToken` | — | **WIRED** — fails closed with no `google-services.json` (PROV-1) |

**Auth:** every endpoint above is Bearer-authenticated except `otp/send`, `otp/verify` and
`refresh`. `logout` IS authenticated and takes no body.

---

## 3. Gaps

### BACKEND_GAP

**BE-1 — CLOSED (2026-08-18). The customer can now read the service OTP.**
- Previously: `deriveServiceOtp` was reachable only from the COOK's verify routes and
  `GET /v1/bookings/:id` returned no OTP field, so Arrived (`3:1658`) and In service (`101:1812`)
  could not be driven by real data.
- Now: `src/fulfilment/tracking-service.ts` returns `serviceOtp: { start, end }` on
  `GET /v1/bookings/:id/tracking`, derived from state per DEC-033 — `start` only while
  `cook_en_route`/`cook_arrived` and unconsumed, `end` only while `cooking` and unconsumed, `null`
  otherwise.
- Frontend: consumed by `trackingDetailFrom` and applied to `ArrivedViewModel.otpCode` /
  `InServiceViewModel.otpCode`. A withheld (`null`) code leaves the designed copy in place rather
  than blanking the row — asserted in `src/features/booking/adapters.test.ts`. No code is cached,
  derived or logged.
- Note: it is served on TRACKING, not on the booking read as originally recommended. Tracking is
  therefore polled in exactly the three states above, and not at all outside them.

**BE-2 — CLOSED (2026-08-18). Clock skew is published and consumed.**
- `GET /v1/bookings/:id` returns `serverTime` alongside the booking (`booking-service.ts:502`) —
  the server's clock at the moment it built the response.
- Frontend: `bookingDetailResponseSchema` parses it; `useBookingDetail` measures it against the
  device clock AT THE SEAM (`observeServerTime`) rather than in a component, because a timestamp
  compared during a later render has already had the render delay folded into it. The offset
  lives in one central store (`src/core/time/clockSkew.ts`, §29) so every countdown in the app
  agrees, and `bookingDetailFrom` reads it into `InServiceViewModel.clockSkewMs`.
- An absent or unparseable `serverTime` KEEPS the previous measurement rather than resetting to
  zero, which would make a running countdown jump. Covered by `src/core/time/clockSkew.test.ts`.

**BE-3 — refund row shape unverified.** `/v1/me/refunds` returned `[]` for every account reachable
in development, so the row fields are inferred from the service signature, not observed. The schema
is deliberately permissive and the screen degrades to a sparse card. Non-blocking.

**BE-4 — no support destination.** `catalogue.support` is `{}` on this deployment, so the Help pill
and the Profile "Help" tile still have nowhere to go (the long-standing product blocker B-10, now
visible in the contract).

**BE-COOKPOOL — RESOLVED by V0 `feat/cook-pool-recurring-plans` (DEC-085, 2026-10-06).** The
backend now serves the pool (`GET /v1/me/cooks`), Pool selection's deck — tried, active, unpooled
Cooks only (`GET /v1/me/cooks/candidates`), a Cook's profile with dishes by category
(`GET /v1/me/cooks/:cookId`, tried or pooled Cooks only), add by `cookId` (refused
`COOK_NOT_TRIED` for a Cook who never completed a booking for the household) and remove. Dish
likes are saved per household (`/v1/me/dish-likes`, DEC-115). Dish photos still
come from the bundled card content by `profileCode`. Not deployed: the branch is unmerged.

**BE-RECURRING — Recurring V2 is wired against an unmerged, undeployed backend (2026-10-06).**
`src/features/recurringSetup/api` speaks DEC-086's contract (V0 `feat/cook-pool-recurring-plans`):
eligibility (Home's chip, times of day, base/effective prices), the 21-day calendar, start times by
time of day with the Plan's other visits (`sameDayVisits`), the multi-Plan quote and save, UPI
Autopay start/verify (re-approval included), visit and whole-booking cancellation with quotes and
reasons, and visit prep checks. Gaps on the app side:
- The Autopay step after "Book Now" and the confirmation after it have no Figma frames; they are
  built from the spec's Step 8 with the flow's own components (`RecurringAutopayScreen`,
  `RecurringBookedScreen`) and run save → mandate → Razorpay recurring checkout → verify.
- The Live booking / Manage plans / visit-details screens are not on this branch.
- None of it has run against a live backend: the routes exist only on the unmerged V0 branch.

**BE-RECURRING-VIDEO — the Recurring landing's explainer video has no source of truth yet
(2026-10-05).** The player (`src/features/recurringLanding/components/ExplainerPlayer.tsx`) plays
whatever `useExplainerVideoSource()` returns (`src/features/recurringLanding/video.ts`): today the
constant `EXPLAINER_VIDEO_URL`, `null` until a URL is pasted there (an `https://` `.mp4` or HLS
`.m3u8`; the 3:45 length is read from the video once it loads). If the backend should send it
instead — so the video can change without an app release — expose the URL on a read the app
already makes (or a small config read) and have `useExplainerVideoSource` return it; the player and
the screens do not change. Playback uses `expo-video`, a native module: a build made before it was
added plays a placeholder instead (`expoVideo.ts` checks for the module first).

**BE-5 — the redesigned Home is partly wired.** `/home` now renders `src/features/homeRedesign`
on live data (`useHomeRedesignData`, `adapters.ts`): serviceability from the current address,
`GET /v1/catalogue` durations (price, GST-inclusive total, `taxRateBps`),
`GET /v1/availability/instant` per duration (availability + ETA), `GET /v1/me/bookings` for
"returning", Razorpay via `useBookingSubmission`, and `PUT /v1/me/waitlist`. Still missing, so
deliberately empty on Home:
- `GET /v1/me/cooks` and `GET /v1/me/recurring-plans` — only on V0
  `feat/cook-pool-recurring-plans` (unmerged); the pool shows no beads and the chip reads
  "Check Recurring".
- Waitlist demand (`countForPincode`, `launchThreshold`) and a read of membership — the meter is
  hidden and "You're on the list" lasts for the session.
- A "most booked" flag and "serves" per duration; a per-duration roll-up of scheduled capacity
  (Later treats every duration as bookable; the slot picker answers per date).
- A list of live hubs — the not-live map uses the dev note's static HSR Layout / Haralur pins.

### BACKEND_DEPLOYMENT_GAP

**DEP-4 — DEPLOYMENT DRIFT: Render is running older code than `D:\spoon-backend`. Blocking for
any deployed-environment work.**
Re-verified 2026-08-18. `GET https://spoon-api-kalc.onrender.com/v1/catalogue` answers
`404 RESOURCE_NOT_FOUND` — the endpoint does not exist on that build — while `/v1/me` correctly
answers `401` and `/v1/availability/scheduled` answers `400`. The local backend serves
`/v1/catalogue` (`src/api/routes/v1/index.ts:753`, backed by the UNTRACKED
`src/policies/customer-catalogue.ts`).

Consequence: `/v1/catalogue` is the single source of every value this app stopped hardcoding (§4
below) — durations, prices, tax rate, scheduled horizon, meal periods, extension SKUs,
cancellation bands and reasons. Against Render, all of it is unavailable. The same drift covers
the rest of the backend's uncommitted Phase 10 work: the reschedule policy, `allowedActions`, and
the service OTP on tracking (BE-1).

- LOCAL_BACKEND_STATE: Phase 10 complete, largely UNCOMMITTED (last commit `742e777`).
- DEPLOYED_RENDER_STATE: pre-Phase-10; no `/v1/catalogue`; cannot send OTPs (DEP-1).
- Resolution is a backend commit + deploy, not a frontend change.

**DEP-1 — the deployed API cannot send OTPs. Blocking.**
`POST https://spoon-api-kalc.onrender.com/v1/auth/otp/send` answers
`503 PROVIDER_TEMPORARILY_UNAVAILABLE` for a well-formed request. Re-verified 2026-08-18: still
open. Nobody can sign in on the deployed environment, so no authenticated flow can be verified
there. Local works (`fake` provider). Likely MSG91 credentials/configuration on Render.

GAP-19 (a safe local-development OTP retrieval mechanism) is now CLOSED backend-side —
`LOGIN_OTP_DEV_ECHO` in `src/config/env.ts`, refused when the environment is deployed — so §27's
preferred strategy applies: develop against the LOCAL backend.

**DEP-2 — FCM is not configured.** The API reports `providersConfigured.fcm: false` at startup, so
push has no delivery path even once a token is registered.

**DEP-3 — the local `.env` cannot start the API. STILL TRUE, but now worked around without
touching that file — and it is worse than previously recorded.**

Re-audited 2026-08-18 (categories only; no secret value was printed or copied):

| Key | State |
| --- | --- |
| `DATABASE_URL` | **VALID_URL, but REMOTE** — an `aws-0-ap-southeast-1.pooler.supabase.com` host. A file labelled local development points at a hosted database. |
| `REDIS_URL` | **INVALID_COMMAND_STRING** — a `redis-cli --tls -u ...` command line, not a URL, with a token embedded in it. |
| `LOGIN_OTP_PROVIDER` | normalizes to `msg91`; schema-valid as a value but spelled in the wrong case, and it is the LIVE provider |
| `LOGIN_OTP_DEV_ECHO` | absent (defaults `false`) |
| `BOOKING_ALLOWED_DURATION_MINUTES` | configured as `60,90,120` |
| `PRICING_DURATION_PRICES` | **missing** — so pricing falls back to `DEVELOPMENT_FIXTURE`, which prices `30,45,60,90,120,150` |
| `FCM_SERVICE_ACCOUNT_JSON` | present as multi-line raw JSON, which also makes `docker compose` refuse to read the file |

The startup crash is the last two rows together: `validatePricingPolicy` requires the configured
durations and the priced durations to match EXACTLY, so three allowed durations against six priced
ones is `duration_prices_allowed_duration_mismatch`.

**Nothing in `D:\spoon-backend` was edited.** The backend's own loader (`src/config/local-env.ts`)
uses `dotenv` with `override: false` and documents that existing environment variables win,
precisely so a developer can run against the infrastructure they asked for. Overriding in the
process environment achieves a clean local boot without touching a file that carries live
credentials and points at a hosted database — see §7 below.

### FRONTEND_GAP

**FE-1 — PARTIALLY CLOSED (2026-08-18). Real coordinates now exist; the map canvas and search
still do not.**

What was closed, and why it did not need a vendor decision: `expo-location` reads the OS location
service and the OS geocoder. Neither needs an API key, a billing account, nor a commitment to
Google/Mapbox/Ola, so "use where I am now" could be built without pre-empting the choice that
docs/FRONTEND_FOUNDATION_PLAN.md §305 leaves open.

  ask permission -> device fix -> OS reverse geocode (display) -> POST /v1/serviceability/check

- `src/features/address/location/deviceLocation.ts` produces the point, or a REASON. It never
  defaults to a city centre; a defaulted coordinate would be saved as someone's address.
- `useAddressLocation` runs the chain; `data.ts` composes it with the screen's static copy (the
  fixture import stays in `data.ts`, which is the only place the lint rule permits it).
- `POST /v1/me/addresses` is now actually called from `60:655` with those coordinates, through
  the `addressDraftStore` that carries the point between the two routes (§20).
- Verified live: an address was created against the local backend at a serviceable Bengaluru
  point, and the booking chain below ran on it.

**Still open, as CONFIGURATION_GAP:** the map canvas (`53:33`) needs a tile provider and the
search field (`53:63`) needs Places or an equivalent. The pin is therefore not draggable and
search does not resolve. No coordinate is faked to cover for either.

**FE-2 — CLOSED (2026-08-18). The booking composition screens now drive quote and create.**
- Instant (`src/app/(app)/home.tsx`): the selected duration is an INPUT to
  `GET /v1/availability/instant` and `POST /v1/bookings/quote`. The sheet's blocked states are the
  server's refusal (`available: false`), mapped to the two designed frames —
  `OUTSIDE_OPERATING_WINDOW` to the moon state, every other reason to the calendar state, so an
  unseen reason degrades rather than crashing. The CTA amount is the QUOTE's total, tax included,
  never assembled from the catalogue.
- Scheduled (`src/app/(app)/scheduled.tsx`): the selection is lifted out of `ScheduleView` via
  `onSelectionChange`, because the day and duration are the ARGUMENTS to
  `GET /v1/availability/scheduled` — picking a different day re-asks the server which slots exist
  rather than re-filtering a grid the client already holds. The slot id IS the server's ISO
  `start`, echoed back verbatim on create.
- Both submit through `useBookingSubmission`: quote → `POST /v1/bookings` with an
  `Idempotency-Key` scoped to the selection, then navigation to the created booking.
- **`POST /v1/bookings` returns a booking on HOLD (`holdExpiresAt`), not a confirmed one.** It
  becomes confirmed only when payment is verified server-side, which is FE-3. Nothing in the app
  treats a created booking as paid.
- Covered by `src/features/booking/submission.test.tsx` (9 tests), including the fail-closed case:
  a scheduled booking with no server-offered start cannot be submitted.

**FE-5 — RESOLVED (2026-08-18). Root cause proven on the device, fixed structurally, regression
tested.**

The earlier entry guessed that the device had received Render's 503 and lost the code. **That was
wrong, and the correction matters more than the bug**: the device had never reached Render at all.

What the captured error actually was (temporary diagnostic in the login route, since removed):

```
isAppError: true, ctor: "Object", isError: false, isTypeError: false,
kind: "unknown", code: null, status: null,
message: 'fetch failed: java.net.UnknownHostException:
          Unable to resolve host "api.spoon.invalid": No address associated with hostname'
```

Two separate facts fell out of that one line:

1. **The installed APK carried a stale embedded base URL.** `api.spoon.invalid` appears NOWHERE in
   the current source — it was baked into the debug APK's embedded manifest by an older build. In
   an Expo debug build `Constants.expoConfig.extra` comes from that embedded config, so changing
   `EXPO_PUBLIC_API_BASE_URL` and restarting Metro changes nothing until the APK is REBUILT. Every
   device observation made before the rebuild — in this session and the previous one — was of an
   app talking to a host that does not exist. Rebuilding with the right value is what finally let
   the device reach a backend.

2. **A real network failure was classified `unknown`.** `normalizeError` decided "network" from
   `cause instanceof TypeError`, which is what a browser and Node's undici throw. React Native on
   Android rejects with a plain `Error`, so the failure fell through to `unknown` and an
   unreachable network told the customer "Something went wrong. Please try again." instead of that
   their connection was the problem.

**The fix is structural, not a message-pattern special case.** `client.ts` now classifies at the
seam where the fact is known: if `fetch` rejects and nothing aborted the request, then no response
exists, and "no response" IS the network kind — whatever the platform named the exception. An
`AppError` thrown from upstream still passes through untouched, an abort is still a timeout, and
`normalizeError` keeps its `TypeError` branch for non-transport callers. Request-body serialization
moved above the `try` so an unencodable body cannot be misreported as a network failure.

Regression tests (`src/core/api/client.test.ts`) pin the EXACT rejection captured from the device,
plus the browser/undici `TypeError`, plus the abort-is-still-a-timeout case, plus the resulting
user-facing copy.

**FE-6 — CLOSED (2026-08-18).**

Was: Home always rendered the FIXTURE address, never the customer's. The original diagnosis below
was only half the story — the wiring had since been corrected to write into `header`, but the
defect survived in a second form: the composer wrote the real values only when it HAD them, so an
account with no saved address still inherited the static screen definition's address.

Fixed structurally. `HomeHeaderViewModel.addressLabel`/`addressLine` are now `string | null`, so
"no address" is representable and the type system forces the banner to handle it; `homeFrom`
writes them UNCONDITIONALLY, including null. `HomeTopBanner` draws a prompt ("Add address" /
"Set your delivery location", FIGMA_PENDING — the design has no empty state) in the same lockup,
still opening the address flow. Four regression tests in `HomeScreen.test.tsx` assert that
whatever the fixture carries can never reach a customer who has none.

Original finding, kept for the record:**

Proven on a real device: a freshly created account with ZERO addresses in the database rendered
"Home / E102, Purva Skydale, Silver Count..." — the demo fixture's address.

The seam is correct: `useHomeData` resolves the default address and returns `null` for both fields
when there is none. The wiring is not. It writes `addressLabel` / `addressLine` at the ROOT of the
view model, while `HomeTopBanner` reads `header.addressLabel` / `header.addressLine` — and `header`
is spread from `DEMO_HOME_ACTIVE_BOOKING`. The real values are computed and then never read.

Because `HomeHeaderViewModel` types both fields as required `string`, a null address cannot even be
represented there, so the fix is a small contract change (nullable header fields, or moving the two
values into `header`) plus the designed empty presentation for "no address yet". Recorded rather
than fixed because the task that found it was scoped to the local backend environment and auth.

**FE-3 — CLOSED (2026-08-18). Razorpay checkout is integrated.**
- `react-native-razorpay@3.0.0` — the official package, and the version that ships a
  `codegenConfig` TurboModule spec, so it works under the New Architecture this app builds with
  (`newArchEnabled=true`, RN 0.86.2). Verified linked: Gradle runs
  `:react-native-razorpay:generateCodegenArtifactsFromSchema` and the debug APK builds clean.
- `razorpayCheckoutLauncher` fills the `CheckoutLauncher` seam. `usePayForBooking` was already
  written either side of it, so nothing else changed: order -> checkout -> verify -> REFETCH.
- The SDK is required LAZILY. It builds a `NativeEventEmitter` at import time, which throws where
  the native module is absent (Expo Go, a JS-only test runner, an older APK) — at the top level
  that throw takes down the whole bundle at startup, turning "payments unavailable" into "the app
  does not open". The require happens when checkout opens, so the failure stays local.
- Cancellation is separated from failure (Razorpay code 2), so dismissing the sheet does not show
  the customer an error they caused deliberately. Both still resolve to "not paid".
- A success carrying no signature is REFUSED rather than sent as an empty string.
- `unavailableCheckoutLauncher` remains the exported fail-closed default for hosts without the
  module. Nothing anywhere fabricates a `providerPaymentId`.
- Covered by `src/features/payment/api/razorpayLauncher.test.ts` (8 tests).

**What is NOT proven:** an actual payment. Opening checkout needs a device and a person. Verified
live up to and including `POST /v1/bookings/:id/payments/order` returning **201** from the
repo's own `rzp_test` sandbox key, with the publishable `keyId` on the response and no secret.

**FE-4 — CLIENT CLOSED (2026-08-18); delivery blocked by PROV-1.**
- `expo-notifications` installed. `expoPushTokenProvider` fills the `PushTokenProvider` seam and
  requests permission only when the OS still allows asking (`canAskAgain`).
- The DEVICE token, not the Expo token: the backend's worker sends through FCM directly, so an
  Expo relay token would register successfully and deliver nothing.
- `usePushNotifications` is mounted in the AUTHENTICATED layout, not the root — §45's product
  moment. A customer on the login screen is not asked.
- Received -> invalidate the booking queries (ask the server again). Tapped -> navigate. A push
  never writes booking state: its payload is `{ bookingId, eventType }` and nothing else.
- Deep links (§46): `routeForNotification` maps to `/booking/:id`, and an UNKNOWN event type with
  a booking id still opens that booking rather than producing a dead tap; anything without a
  usable booking id opens Home. Covered by `src/features/notifications/deepLink.test.ts`.
- Every failure path returns "no token" — nothing fabricated ever reaches `PUT /v1/me/push-token`.

### PRODUCT_DECISION_PENDING

- **Home marketing content.** The promo carousel, cuisine mosaic, reasons grid, duration matrix,
  exclusions and promise have no endpoint and no owner. They are clearly static and clearly
  separated from the domain reads in `useHomeData`.
- **Struck-through pricing.** The design draws `₹150 ₹69`. The backend owner confirmed on
  2026-08-17 that promotional pricing is **visual-only for V0** and permanently absent from the
  contract, so the strike price has no authority and remains static.
- **Suggested tip amounts disagree with the design.** The catalogue publishes
  `[2000, 5000, 10000, 15000]` paise (₹20/₹50/₹100/₹150); the tip sheet `306:3048` draws
  **₹25**/₹50/₹100/₹150. The backend is authoritative for suggestions — the design's first chip
  needs changing, or the policy does.
- **Meal brief has no store.** The catalogue publishes its BOUNDS (guest range, four-valued diet
  axis) but no endpoint persists a brief.
- **Redesigned Home — open rules.** Plan tracker, recurring explainer, cook pool and cook profile
  screens do not exist yet (Home says "coming soon"). The dial's recommendation formula (`recommendDuration` is a
  placeholder tuned to the frame), the share-sheet copy and store link, and the destinations not
  built yet (confirm step, tax dialog, recurring flow, plan tracker, explainer, cook pool, cook
  profile).

---

## 4. Values the app no longer hardcodes

Everything in this list used to be baked into the bundle and now comes from `GET /v1/catalogue`:

| Value | Was | Now |
| --- | --- | --- |
| Durations and prices | 6 hardcoded tiles | `durations[]` — verified identical to the Figma fixture (₹69/99/129/189/259/319) |
| Tax rate | implicit in the fixture | `taxRateBps: 500`, rendered as "Taxes @5%" |
| Scheduled horizon | fixture-length day strip (blocker **B-8**) | `scheduled.horizonDays: 3` |
| Meal periods | 3 hardcoded chips | `scheduled.periods[]` |
| Instant promise | "18 mins" in the fixture | `instant.arrivalPromiseMinutes: 30` |
| Extension SKUs | 10/20/30 at ₹15/₹35/₹69 in the fixture | `extension.options[]` — identical values, now published |
| Cancellation bands | fee table in the fixture | `cancellation.bands[]` |
| Cancellation reasons | 7 hardcoded labels + a match on "Others" | `cancellation.reasons[]` with `requiresDetail` as DATA |
| Booking statuses | empty registry, everything `unknown` | the real 7-value enum in `bookingStatusView.ts` |
| Allowed actions | inferred per screen | `allowedActions` from the booking payload |

---

## 5. Test coverage

| Area | Test | Runs in |
| --- | --- | --- |
| Envelope unwrap, non-enveloped rejection, null payload | `src/core/api/client.test.ts` | `npm test` |
| Backend error code + requestId preservation; two codes sharing a transport kind | same | `npm test` |
| Idempotency-Key header pass-through | same | `npm test` |
| Idempotency scope stability / release / collision | `src/core/api/idempotency.test.ts` | `npm test` |
| Refresh rotation; unrecoverable vs transient failure | `src/features/auth/api/sessionGateway.test.ts` | `npm test` |
| Booking status → view, unknown fallback, payload-dependent views | `src/features/booking/state/bookingStatusView.test.ts` | `npm test` |
| Service OTP applied / withheld; ETA formatting and its null cases | `src/features/booking/adapters.test.ts` | `npm test` |
| Quote gating, CTA total from the quote, blocked-state mapping, create body + Idempotency-Key, scheduled fail-closed | `src/features/booking/submission.test.tsx` | `npm test` |
| Production data path excludes dev fixtures | `src/__tests__/productionDataPath.test.ts` | `npm test` |
| Route mount against stubbed real payloads | `src/__tests__/routes.test.tsx` | `npm test` |
| **Live** auth handshake, catalogue, serviceability, availability, error codes | `src/__tests__/live.e2e.ts` | `npx jest --config jest.e2e.config.js` |

The live suite is deliberately outside `npm test` so the ordinary gates never depend on a running
server. Point it elsewhere with `SPOON_E2E_BASE`.

---

## 6. INTERRUPTED_SESSION_RECOVERY

A previous integration session was cut off mid-flight (laptop disconnected). The filesystem — not
the conversation — was treated as the source of truth. This section records what was found, what
was repaired and what was completed afterwards, so another interruption costs an audit rather than
the work.

### What survived

Effectively all of it. Both working trees held substantial uncommitted work:

- **Frontend** (185 changed/untracked paths, nothing committed): the whole transport layer
  (`core/api`, `core/auth`, `core/data`, `core/query`), typed feature APIs with zod boundaries for
  auth, address, catalogue, availability, booking, payment and notifications, the adapters, the
  runtime provider, the tests, and this document.
- **Backend** (56 changed/untracked paths on top of `742e777`): the Phase 10 work — customer
  catalogue, reschedule service and policy, `allowedActions`, schedule periods, the cancellation
  reason catalogue, the timing verdict, and the service OTP on tracking.

### Validation of the recovered work

Run before anything new was written, so nothing was stacked on a broken base:

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS, clean |
| `npx eslint . --max-warnings=0` | **FAILED** — 5 errors (repaired, below) |
| `npx prettier --check .` | **FAILED** — 2 files (repaired, below) |
| `npx jest` | PASS — 41 suites, 387 tests |

### What was repaired

The interruption landed while the live E2E harness was being written, and it was the only broken
thing found.

1. `src/__tests__/live.e2e.ts` imported five feature API submodules directly, tripping the
   `no-restricted-imports` barrel rule. The imports are CORRECT — feature barrels re-export React
   Native screens, which cannot be required in a headless Node runtime, and the file says so. The
   fix was therefore the rule, not the code: `eslint.config.js` already exempted
   `**/*.test.{ts,tsx}` from that rule, and `**/*.e2e.ts` now sits alongside it.
2. `jest.e2e.config.js` and `live.e2e.ts` were unformatted. Prettier applied.

### Backend gaps re-checked against current source (not against the earlier audit)

| Gap | Previous state | Current state |
| --- | --- | --- |
| GAP-2 readable customer profile | NOT_IMPLEMENTED | **IMPLEMENTED** — `GET /v1/me` returns `id, role, status, phone, name, profileComplete` |
| GAP-3 `accessTokenExpiresAt` on refresh | NOT_IMPLEMENTED | **IMPLEMENTED** — returned by both verify and refresh |
| GAP-19 local-development OTP retrieval | NOT_IMPLEMENTED | **IMPLEMENTED** — `LOGIN_OTP_DEV_ECHO`, refused when the environment is deployed |
| BE-1 customer-readable service OTP | BACKEND_GAP | **IMPLEMENTED** on tracking — see §3 |
| Duration/pricing catalogue, scheduled horizon, periods, cancellation reasons, allowed actions, customer reschedule | NOT_IMPLEMENTED | **IMPLEMENTED** — all present in the local tree |
| Deployment parity | assumed | **DEPLOYMENT_DRIFT** — see DEP-4 |

### What was newly completed after recovery

1. **Service OTP + live ETA (BE-1 consumption).** `trackingSchema` extended with `serviceOtp`,
   `destination` and `refreshAfterSeconds`; `trackingDetailFrom` applies the codes and the ETA to
   the Arrived and In-service view models; `useBookingDetailData` polls tracking ONLY in
   `cook_en_route` / `cook_arrived` / `cooking`, where the endpoint has an answer.
2. **Server-driven poll cadence.** `useApiQuery`'s `refetchInterval` now accepts a function of the
   latest data, so tracking polls at the server's `refreshAfterSeconds` instead of a client
   constant. The constant survives only as the pre-first-response fallback.
3. **Booking composition end to end (FE-2).** Instant and Scheduled now own their selection, feed
   it to availability and quote, and submit through `useBookingSubmission` →
   `POST /v1/bookings` with a selection-scoped `Idempotency-Key`.
4. **Tests.** `src/features/booking/adapters.test.ts` (7) and
   `src/features/booking/submission.test.tsx` (9). Suite is now 43 files / 403 tests.

### Still remaining, and why

| Item | Blocked by |
| --- | --- |
| Payment (4F) | FE-3 — Razorpay needs a native module, a prebuild and a new APK; §16 requires an approved dependency strategy first. `CheckoutLauncher` fails closed. |
| Address coordinates (4C) | FE-1 — no map/geocoding provider. Coordinates are NOT faked, so create-address and serviceability stay unexercised from the UI. |
| Push (4K) | FE-4 — `expo-notifications` + Firebase config is a native change. DEP-2: FCM is not configured server-side either. |
| Any deployed-environment verification | DEP-1 (no OTP delivery) and DEP-4 (drift). Develop against the local backend per §27. |
| Full booking → payment → lifecycle E2E | The chain above: a created booking is on HOLD and cannot be paid from the client yet. |

---

## 7. Running the whole stack locally (verified 2026-08-18)

Local auth now works end to end, on a physical device, against a local backend. This is the exact
route, because rediscovering it costs an afternoon.

### Why nothing in `D:\spoon-backend` is edited

That repo's `.env` points `DATABASE_URL` at a hosted Supabase pooler and carries live MSG91,
Razorpay, Google and FCM credentials (DEP-3). Editing it risks the recovered configuration and the
hosted data. The backend's own loader uses `dotenv` with `override: false` and documents that
existing environment variables win — so the process environment is the sanctioned override seam.

### 1. Infrastructure — the repo's own compose stack

A native PostgreSQL and Redis already hold 5432/6379 on this machine, so the stack runs on the
offset ports its own header documents:

```
POSTGRES_HOST_PORT=5433 REDIS_HOST_PORT=6380 docker compose up -d
```

Pass `--env-file` pointing at a file containing ONLY those two variables: `docker compose` reads
`.env` for substitution and chokes on the multi-line `FCM_SERVICE_ACCOUNT_JSON`, and it has no
business reading that file anyway. PostGIS 3.4 is present in the image; the local volume already
carries all 28 migrations, including the untracked Phase 10 one.

### 2. The backend, with local-only overrides

| Override | Why |
| --- | --- |
| `DATABASE_URL=postgresql://spoon:spoon_local_dev@127.0.0.1:5433/spoon` | the compose stack, not the hosted pooler |
| `REDIS_URL=redis://127.0.0.1:6380` | an actual URL, not a `redis-cli` command |
| `LOGIN_OTP_PROVIDER=fake` | the repo's approved non-production OTP path; one of the two schema-valid values |
| `LOGIN_OTP_DEV_ECHO=true` | permitted because BOTH gates hold and NEITHER is weakened: `NODE_ENV` is development, and the resolved provider is `fake`, so no real handset receives a code |
| `BOOKING_ALLOWED_DURATION_MINUTES=30,45,60,90,120,150` | `DEVELOPMENT_FIXTURE.allowedDurationMinutes` verbatim, which is what the fallback pricing prices. No price or duration invented. |
| placeholder MSG91 / Razorpay / Google / FCM values | all `.optional()` in the schema, so an obvious placeholder validates but cannot authenticate — a stray outbound call fails instead of succeeding |

Then `npm run dev:api`. `/health/live` and `/health/ready` both answer, with postgres, postgis and
redis all healthy.

### 3. The device

`EXPO_PUBLIC_API_BASE_URL` is read by `app.config.ts` and **embedded into the debug APK at build
time**, so pointing the app somewhere new needs a REBUILD, not just a Metro restart (this is what
FE-5 turned on). Build with the host's LAN address — `adb reverse` was not sufficient here, while
the LAN route worked first time and is verifiable from the device browser:

```
cd android && JAVA_HOME=<Android Studio jbr> \
  EXPO_PUBLIC_API_BASE_URL=http://<host-lan-ip>:3000 ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Gradle needs JVM 17+; the machine's default `JAVA_HOME` is JVM 8, and Android Studio's bundled JBR
(21) works. The debug manifest already allows cleartext traffic, so plain `http` to the LAN host is
fine for development.

### What was verified on the device

Login → OTP → verify → authenticated Home; session restore across a full force-stop and cold
start; Profile rendering the authoritative `/v1/me` (the real phone, `name` null → "Add your name",
`profileComplete: false` → the incomplete banner); logout returning to Login. No redbox, no crash,
no ANR. Home's "Spoon in 30 mins" is the catalogue's real `instant.arrivalPromiseMinutes`.

The OTP is never displayed in the app UI — it is read from the `devOtp` field of the send response,
which is the approved development echo and is refused outright in a deployed environment.

---

## 8. Third pass — payment, location, push, Call Cook, clock skew (2026-08-18)

The state a subsequent session should start from. Written as it happened, including the things
that turned out NOT to be true.

### What the environment actually was

The two previous revisions of this document described the backend's Phase 10 work as
"uncommitted" and treated Render as merely stale. Re-checked from source rather than from those
notes:

| Claim in the earlier audit | Actual state on 2026-08-18 |
| --- | --- |
| Backend Phase 10 work is uncommitted | **MERGED.** `origin/main` = `6497589`; the local branch is byte-identical to it (`git diff` empty). |
| Migration `1754320700000` may not be applied | **APPLIED.** Present in `pgmigrations`; `migrate:up` reports "No migrations to run". |
| Render is behind | **STILL TRUE** — see DEP-4. Health is green, `/v1/catalogue` still 404s. |
| `providersConfigured.fcm: false` | **NOW TRUE-ish**: the running API reports `fcm: true`. The gap moved to the CLIENT — see PROV-1. |

Gates on the recovered tree BEFORE any edit: **tsc clean · eslint --max-warnings=0 clean ·
prettier clean · jest 43 suites / 407 tests**. The tree was sound.

### What was completed

1. **FE-6 Home address** — closed structurally (nullable header contract), 4 regression tests.
2. **Call Cook (§31)** — was entirely unwired (`onCallCook={() => {}}`) despite the button being
   drawn on five frames. Now `GET /v1/bookings/:id/cook-contact`, fetched ON PRESS and handed to
   the device dialer. Gated by `allowedActions.canCallCook`, fail-closed when the field is absent.
   The number is never cached, never a prop, never logged. 5 tests.
3. **FE-3 Razorpay** — integrated; see the FE-3 entry above. 8 tests.
4. **FE-1 map/geocoding** — real device coordinates; address creation now actually calls the API.
   See FE-1. 10 tests.
5. **FE-4 push** — full client integration and deep-link routing. See FE-4. 6 tests.
6. **BE-2 clock skew** — closed; central skew store. See BE-2. 8 tests.
7. **Cancellation (§36) — blocker B-11 closed.** The four-step sheet was fully built and already
   read live data (catalogue bands, preview, reschedule options), but it had NO product entry
   point and its confirm was a `TODO`. B-11 recorded that no live-booking frame drew a Cancel
   control; the current file does — `3:1041` draws the Reschedule/Cancel pair under the summary
   and `292:241` draws it on the en-route and reassigned frames. It is now reachable from the
   booking screen with the real booking id, gated by `allowedActions.canCancel`, and confirm
   calls `POST /v1/bookings/:id/cancel` with the chosen reason and the customer's `reasonDetail`
   (forwarded, not discarded). The fee and the refund are refetched, never predicted. 4 tests.
   §37's contradictory "Book Now" label is recorded and NOT obeyed: the flow closes and returns
   to Home rather than creating a booking from inside a cancellation.

### The live end-to-end chain, and where it really stops

Run against the local backend by `src/__tests__/live.e2e.ts`. Every step below is a REAL request
whose response was parsed by the app's own zod schemas:

```
send OTP -> verify -> /v1/me
  -> /v1/catalogue
  -> /v1/serviceability/check           (serviceable)
  -> POST /v1/me/addresses              (real coordinates)
  -> GET  /v1/availability/instant      -> refused: TRAVEL_ESTIMATE_UNAVAILABLE
  -> GET  /v1/availability/scheduled    -> an open slot
  -> POST /v1/bookings/quote            (parts sum to the total, server-side)
  -> POST /v1/bookings                  -> status `created`, i.e. ON HOLD, never paid
  -> GET  /v1/bookings/:id              -> serverTime present, allowedActions present
  -> GET  /v1/bookings/:id/cook-contact -> RESOURCE_NOT_FOUND (no cook assigned) — as designed
  -> POST /v1/bookings/:id/payments/order -> 201, publishable keyId, no secret
```

**It stops at opening checkout, and that is not a defect.** Razorpay's sheet needs a device and a
person. The order is real (created against the repo's own `rzp_test` sandbox key), and everything
after it — verify, refetch, the UI transition — is written and unit-tested but cannot be reached
without a human tapping through a payment.

**Instant booking could not be exercised locally.** `TRAVEL_ESTIMATE_UNAVAILABLE`: instant
matching needs a live travel estimate from the Google Routes provider, which is not reachable
from this machine. Scheduled booking does not, which is why the chain routes through it. This is
a PROVIDER_CONFIG_GAP for local development, not a frontend defect — see PROV-2.

### Local test data that had to be created (and why it is not faking anything)

Instant/scheduled availability returned `NO_PRESENT_COOK` because the local database had no cook
on duty today. `scratchpad/seed-cook.sql` inserts one, satisfying the SAME conditions the real
candidate query in `src/bookings/repositories/schedule-repository.ts` checks — active user,
active profile in the hub whose polygon covers the test point, `present` attendance for today's
IST service date, a shift covering today's ISO day of week, and (for instant)
`cook_operational_availability.state = 'available'`.

Nothing in the application is bypassed: the real matcher runs against real rows. The table's own
constraints were discovered the hard way and are worth recording — a shift must be **exactly 12
hours**, start on the hour between **05:00 and 10:00**, and carry a **2-hour break inside
11:00–16:00**. `10:00–22:00` is the latest legal shift, which is what makes an evening booking
reachable at all.

**Nothing in `D:\spoon-backend` was edited.** The overrides live in the process environment,
which the backend's own loader sanctions (`dotenv`, `override: false`).

### One deliberate configuration choice

`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` are NOT overridden — the repo's own values are checked
(prefix only, no secret printed) to be an `rzp_test` sandbox pair, and using them is the only way
to prove the order contract. Only `RAZORPAY_WEBHOOK_SECRET` is a placeholder, because the repo
carries none and nothing in this run receives a webhook.

### New gaps this pass opened

**PROV-1 — no `google-services.json`. Push cannot be DELIVERED on Android.**
The client integration is complete and fails closed: `getDevicePushTokenAsync` cannot return a
token without the Firebase config for this app's package, so registration is skipped and no
fabricated token is ever sent. Closing it needs the file from the Firebase console for
`com.spoonhelp.userapp.dev` (and the release package), dropped in and referenced as
`android.googleServicesFile` in `app.config.ts`. Not something a frontend session can produce.

**PROV-2 — the Google Routes provider is unreachable in local development.**
`GOOGLE_ROUTES_API_KEY` is configured (the API reports `routes: true`) but every travel estimate
fails, so INSTANT availability answers `TRAVEL_ESTIMATE_UNAVAILABLE` and instant booking cannot
be exercised end to end here. Scheduled booking is unaffected. Needs either network egress to the
Routes API from this machine or a working key.

**CONFIGURATION_GAP — map tiles and Places.** Unchanged from FE-1: still an open vendor decision,
and still the reason the pin cannot be dragged and search does not resolve.

**BUILD-1 — CLOSED (2026-08-18). The Android build is green again.**
Root cause was NOT a version incompatibility: this machine's `27.1.12297006` NDK is a damaged
install carrying clang 17 under a clang 18 version number, which rejects both
react-native-reanimated's constrained partial specialisations and React Native's `std::format`.
Pinned to `27.2.12479018` through a config plugin (`plugins/withNdkVersion.js`) using Expo's own
`ext.ndkVersion` seam. Clean `assembleDebug` passes on all four ABIs, and the APK installs and
cold launches to Login on the physical handset with a clean logcat. Full diagnosis, including the
standalone reproductions that disproved the earlier "NDK 28 required" conclusion, is in
[`PHASE4_FRONTEND_HANDOVER.md`](./PHASE4_FRONTEND_HANDOVER.md) §7.
