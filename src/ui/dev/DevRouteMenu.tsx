import { StyleSheet, View } from 'react-native';

import { Card } from '@ui/primitives/Card';
import { ListRow } from '@ui/components/ListRow';
import { Text } from '@ui/primitives/Text';
import { lightTheme } from '@ui/theme/ThemeProvider';

/**
 * DEVELOPMENT-ONLY navigation menu.
 *
 * No auth endpoint exists, so a device build cannot sign in and would otherwise stop at Login
 * with no way to reach the built screens. This menu is the review path. It renders only under
 * `__DEV__` and lives at its own route (`spoon://menu`) — it is deliberately NOT embedded in a
 * product screen, because a content-sized menu inside a `flex: 1` screen collapses that screen.
 *
 * It is navigation scaffolding, not product UI: no screen depends on it, and it disappears from
 * release builds.
 */

export interface DevRoute {
  readonly path: string;
  readonly label: string;
  readonly note: string;
}

/** Every built screen and state, in the order the product flows. */
export const DEV_ROUTES: readonly DevRoute[] = [
  { path: '/login', label: 'Login', note: 'FINAL · Login flow 275:4472 · 250:2383' },
  { path: '/home', label: 'Home', note: 'Active-booking variant · 209:1207' },
  {
    path: '/home?instant=available',
    label: 'Instant · Available',
    note: 'FINAL · Instant booking 267:3520 · 1:728',
  },
  {
    path: '/home?instant=taxes',
    label: 'Instant · Taxes dialog',
    note: 'FINAL · 25:1585 — dialog layered over the sheet',
  },
  {
    path: '/home?instant=outOfShift',
    label: 'Instant · Out of shift',
    note: 'FINAL · 25:1327 — moon art, "Schedule NOW"',
  },
  {
    path: '/home?instant=noSlots',
    label: 'Instant · No slots',
    note: 'FINAL · 44:5378 — calendar art, "Schedule NOW"',
  },
  { path: '/scheduled', label: 'Schedule · 1 Day', note: 'FINAL · 267:3521 · 275:4488' },
  { path: '/scheduled?step=2', label: 'Schedule · 2 + Time', note: 'FINAL · 275:4713' },
  { path: '/scheduled?step=3', label: 'Schedule · 3 + Duration', note: 'FINAL · 275:4938' },
  { path: '/scheduled?step=4', label: 'Schedule · 4 + Start time', note: 'FINAL · 34:3035' },
  { path: '/reschedule/demo', label: 'Reschedule · 1 Day', note: 'FINAL · 275:5217 · 275:5442' },
  { path: '/reschedule/demo?step=2', label: 'Reschedule · 2 + Time', note: 'FINAL · 275:5490' },
  {
    path: '/reschedule/demo?step=3',
    label: 'Reschedule · 3 + Start time',
    note: 'FINAL · 275:5218 · CTA "Reschedule"',
  },
  { path: '/address/location', label: 'Address · Select location', note: 'FINAL · 53:31' },
  { path: '/address/details', label: 'Address · Complete address', note: 'FINAL · 60:655' },
  { path: '/meal-brief', label: 'Meal Brief & Recipe Link', note: '3:684' },
  {
    path: '/booking/confirmation',
    label: 'Booking · Confirmation',
    note: '3:1041 · tap "View booking details" for NEW 250:2861',
  },
  {
    path: '/booking/confirmReassign',
    label: 'Booking · Confirm reassign',
    note: '289:6607',
  },
  { path: '/booking/enRoute', label: 'Booking · En route (on time)', note: '3:1381' },
  { path: '/booking/enRouteLate', label: 'Booking · En route (late)', note: '292:469' },
  { path: '/booking/arrived', label: 'Booking · Arrived + Start OTP', note: '3:1658' },
  {
    path: '/booking/inService',
    label: 'Booking · In service + Extend',
    note: '101:1812 · "Extend Time" opens 3:2002; its "Check payment details" opens NEW 275:4189',
  },
  {
    path: '/booking/cookingExtended',
    label: 'Booking · Cooking extended',
    note: '292:1197',
  },
  { path: '/booking/reassigned', label: 'Booking · Reassigned (on time)', note: '201:100' },
  { path: '/booking/reassignedLate', label: 'Booking · Reassigned (late)', note: '292:657' },
  { path: '/booking/autoCancelled', label: 'Booking · Auto cancelled', note: '201:278' },
  {
    path: '/booking/completion',
    label: 'Booking · Completion',
    note: '299:1424 · tap the tip row for NEW 306:2885',
  },
  {
    path: '/booking/feedbackSubmitted',
    label: 'Booking · Feedback submitted',
    note: '319:3191',
  },
  { path: '/address', label: 'Saved addresses', note: 'FINAL · Address 275:4473 · 68:214' },
  { path: '/address?edit=1', label: 'Address · Edit / Delete sheet', note: 'NEW 228:1801' },
  { path: '/address/out-of-service', label: 'Address · Out of service', note: 'FINAL · 215:1472' },
  { path: '/profile', label: 'Profile', note: 'FINAL · Profile 275:6021 · 6:663' },
  /*
   * Account, but NOT `/account/delete-otp`: entering that screen sends a real OTP against the
   * signed-in customer's own number and spends one of their eight-per-ten-minutes budget, which
   * is not something a menu of screens should do on a tap. It is reached through the sheet.
   */
  { path: '/account', label: 'Account · Delete account', note: 'No frame id · supplied mock' },
  { path: '/history', label: 'My bookings', note: 'FINAL · 6:227' },
  { path: '/refunds', label: 'Refunds', note: 'FINAL · 71:615' },
  { path: '/otp', label: 'Login · OTP (countdown)', note: 'FINAL · 275:4289' },
  { path: '/otp?state=ready', label: 'Login · OTP (resend ready)', note: 'FINAL · 250:2439' },
  { path: '/otp?state=error', label: 'Login · OTP (wrong code)', note: 'FINAL · 275:4349' },
  {
    path: '/cancellation',
    label: 'Cancel booking · Policy',
    note: 'FINAL · Cancellation flow 115:2821 · 6:2 · no entry point (B-11)',
  },
  { path: '/cancellation?step=reason', label: 'Cancel booking · Reason', note: 'FINAL · 104:2260' },
  { path: '/cancellation?step=refund', label: 'Cancel booking · Refund', note: 'FINAL · 104:2336' },
  {
    path: '/cancellation?step=confirmed',
    label: 'Cancel booking · Confirmed',
    note: 'FINAL · 115:2703',
  },
  { path: '/showcase', label: 'Component showcase', note: 'Design system' },
  { path: '/splash', label: 'Loading · App launch toss', note: '2692:864' },
  { path: '/splash?screen=confirming', label: 'Loading · Confirming payment', note: '2702:855' },
  { path: '/splash?screen=failed', label: 'Loading · Payment failed', note: '2718:916' },
  {
    path: '/taste-profile',
    label: 'Taste profile · Family (preview)',
    note: 'IN PROGRESS · 1548:3676 · dev preview, no session needed',
  },
  {
    path: '/taste-profile?step=diet',
    label: 'Taste profile · Diet (preview)',
    note: 'IN PROGRESS · 1548:3786',
  },
  {
    path: '/taste-profile?step=taste',
    label: 'Taste profile · Taste (preview)',
    note: 'IN PROGRESS · 1548:3922',
  },
  {
    path: '/taste-profile?step=cook',
    label: 'Taste profile · Cook (preview)',
    note: 'IN PROGRESS · 1548:4061',
  },
  {
    path: '/taste-profile?step=cook&meal=regular-cook',
    label: 'Taste profile · Cook, meals picked (preview)',
    note: 'IN PROGRESS · 2522:1049',
  },
  {
    path: '/recurring-setup',
    label: 'Recurring setup · full flow (preview)',
    note: 'IN PROGRESS · dev preview, no session needed',
  },
  {
    path: '/recurring-setup?step=1',
    label: 'Recurring setup · Pick days only (preview)',
    note: 'IN PROGRESS · dev preview, no session needed',
  },
  {
    path: '/recurring-autopay?state=choose',
    label: 'Recurring Autopay · Choose UPI app (preview)',
    note: 'DEV PREVIEW · 2316:3558',
  },
  {
    path: '/recurring-autopay?state=more',
    label: 'Recurring Autopay · Choose UPI app · all apps (preview)',
    note: 'DEV PREVIEW · 2316:3558',
  },
  {
    path: '/recurring-autopay?state=creating',
    label: 'Recurring Autopay · Choose UPI app · starting (preview)',
    note: 'DEV PREVIEW · no frame',
  },
  {
    path: '/recurring-autopay?state=waiting',
    label: 'Recurring Autopay · Waiting for approval (preview)',
    note: 'DEV PREVIEW · 2317:3577',
  },
  {
    path: '/recurring-autopay?state=left',
    label: 'Recurring Autopay · Left without approving (preview)',
    note: 'DEV PREVIEW · 2317:3667',
  },
  {
    path: '/recurring-autopay?state=failed',
    label: 'Recurring Autopay · Didn’t go through (preview)',
    note: 'DEV PREVIEW · 2317:3753',
  },
  {
    path: '/recurring-autopay?state=confirming',
    label: 'Recurring Autopay · Still confirming (preview)',
    note: 'DEV PREVIEW · 2317:3839',
  },
  {
    path: '/recurring-autopay?state=active',
    label: 'Recurring Autopay · Active (preview)',
    note: 'DEV PREVIEW · 2317:4009',
  },
  {
    path: '/recurring-autopay?state=noApp',
    label: 'Recurring Autopay · No UPI app found (preview)',
    note: 'DEV PREVIEW · no frame',
  },
  {
    path: '/recurring-autopay?state=banner',
    label: 'Recurring Autopay · Home · Confirming Autopay banner (preview)',
    note: 'DEV PREVIEW · no frame',
  },
  {
    path: '/booking-flow?view=assigned',
    label: 'Booking flow · assigned',
    note: 'IN PROGRESS · redesign preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1385:3275',
  },
  {
    path: '/booking-flow?view=arrival-early',
    label: 'Booking flow · cook in -15 mins',
    note: '2878:7730',
  },
  {
    path: '/booking-flow?view=arrival-late',
    label: 'Booking flow · cook in +10 mins',
    note: '2878:7959',
  },
  {
    path: '/booking-flow?view=onTheWay',
    label: 'Booking flow · onTheWay',
    note: 'IN PROGRESS · redesign preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1385:3275',
  },
  {
    path: '/booking-flow?view=arrived',
    label: 'Booking flow · arrived',
    note: 'IN PROGRESS · redesign preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1385:3275',
  },
  {
    path: '/booking-flow?view=cooking',
    label: 'Booking flow · cooking',
    note: 'IN PROGRESS · redesign preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1385:3275',
  },
  {
    path: '/booking-flow?view=timesUp',
    label: 'Booking flow · timesUp',
    note: 'IN PROGRESS · redesign preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1385:3275',
  },
  {
    path: '/booking-flow?view=completed',
    label: 'Booking flow · completed',
    note: 'IN PROGRESS · redesign preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1385:3275',
  },
  {
    path: '/booking-flow?view=c1',
    label: 'Booking flow · c1',
    note: 'IN PROGRESS · redesign preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1385:3275',
  },
  {
    path: '/booking-flow?view=c2',
    label: 'Booking flow · c2',
    note: 'IN PROGRESS · redesign preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1385:3275',
  },
  {
    path: '/booking-flow?view=c2-25',
    label: 'Booking flow · c2-25',
    note: 'IN PROGRESS · redesign preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1385:3275',
  },
  {
    path: '/booking-flow?view=c2-50',
    label: 'Booking flow · c2-50',
    note: 'IN PROGRESS · redesign preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1385:3275',
  },
  {
    path: '/booking-flow?view=c2-cook',
    label: 'Booking flow · c2-cook',
    note: 'IN PROGRESS · redesign preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1385:3275',
  },
  {
    path: '/booking-flow?view=c3',
    label: 'Booking flow · c3',
    note: 'IN PROGRESS · redesign preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1385:3275',
  },
  {
    path: '/booking-flow?view=c4',
    label: 'Booking flow · c4',
    note: 'IN PROGRESS · redesign preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1385:3275',
  },
  {
    path: '/booking-flow?view=c4b',
    label: 'Booking flow · c4b',
    note: 'IN PROGRESS · redesign preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1385:3275',
  },
  {
    path: '/booking-flow?view=c5',
    label: 'Booking flow · c5',
    note: 'IN PROGRESS · redesign preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1385:3275',
  },
  {
    path: '/booking-flow?view=c5b',
    label: 'Booking flow · c5b',
    note: 'IN PROGRESS · redesign preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1385:3275',
  },
  {
    path: '/booking-flow?view=not-serviceable',
    label: 'Booking flow · not-serviceable',
    note: 'IN PROGRESS · redesign preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1385:3275',
  },
  {
    path: '/recurring-live',
    label: 'Recurring live · Live booking calendar',
    note: 'IN PROGRESS · static UI, dev preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1005:131',
  },
  {
    path: '/recurring-live?date=past',
    label: 'Recurring live · Date pop-up · past',
    note: 'IN PROGRESS · static UI, dev preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1005:131',
  },
  {
    path: '/recurring-live?date=today',
    label: 'Recurring live · Date pop-up · today',
    note: 'IN PROGRESS · static UI, dev preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1005:131',
  },
  {
    path: '/recurring-live?date=upcoming',
    label: 'Recurring live · Date pop-up · upcoming',
    note: 'IN PROGRESS · static UI, dev preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1005:131',
  },
  {
    path: '/recurring-live?screen=plans',
    label: 'Recurring live · Manage plans · 1st visit',
    note: 'IN PROGRESS · static UI, dev preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1005:131',
  },
  {
    path: '/recurring-live?screen=plans&visit=2',
    label: 'Recurring live · Manage plans · 2nd visit',
    note: 'IN PROGRESS · static UI, dev preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1005:131',
  },
  {
    path: '/recurring-live?screen=plans&edited=1',
    label: 'Recurring live · Manage plans · edited, unsaved',
    note: 'IN PROGRESS · static UI, dev preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1005:131',
  },
  {
    path: '/recurring-live?screen=visit&variant=assigned',
    label: 'Recurring live · Visit details · cook assigned',
    note: 'IN PROGRESS · static UI, dev preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1005:131',
  },
  {
    path: '/recurring-live?screen=visit&variant=pending',
    label: 'Recurring live · Visit details · cook pending',
    note: 'IN PROGRESS · static UI, dev preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1005:131',
  },
  {
    path: '/recurring-live?screen=visit&variant=completed',
    label: 'Recurring live · Visit details · completed',
    note: 'IN PROGRESS · static UI, dev preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1005:131',
  },
  {
    path: '/recurring-live?screen=visit&variant=cancelled',
    label: 'Recurring live · Visit details · cancelled',
    note: 'IN PROGRESS · static UI, dev preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1005:131',
  },
  {
    path: '/recurring-live?screen=visit&variant=assigned&sheet=modify',
    label: 'Recurring live · Modify booking sheet',
    note: 'IN PROGRESS · static UI, dev preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1005:131',
  },
  {
    path: '/recurring-live?screen=visit&variant=assigned&sheet=payment',
    label: 'Recurring live · Payment details sheet',
    note: 'IN PROGRESS · static UI, dev preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1005:131',
  },
  {
    path: '/recurring-live?screen=rating',
    label: 'Recurring live · Rate visit · first look',
    note: 'IN PROGRESS · static UI, dev preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1005:131',
  },
  {
    path: '/recurring-live?screen=rating&sheet=more',
    label: 'Recurring live · Tell us more sheet',
    note: 'IN PROGRESS · static UI, dev preview — Figma cCQlzTeiObQkpVBzwI8mZi page 1005:131',
  },
];

export interface DevRouteMenuProps {
  readonly onNavigate: (path: string) => void;
}

export function DevRouteMenu({ onNavigate }: DevRouteMenuProps) {
  if (!__DEV__) {
    return null;
  }

  return (
    <Card tone="surface" testID="dev-route-menu" style={styles.card}>
      <Text variant="labelUpper" color="textSecondary">
        Development navigation
      </Text>
      <Text variant="caption" color="textSecondary">
        No auth endpoint exists yet, so these open each designed screen and state directly.
      </Text>

      <View style={styles.list}>
        {DEV_ROUTES.map((route) => (
          <ListRow
            key={route.path}
            title={route.label}
            subtitle={route.note}
            icon="forward"
            onPress={() => onNavigate(route.path)}
            testID={`dev-route-${route.path}`}
          />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: lightTheme.space.xxs },
  list: { paddingTop: lightTheme.space.sm },
});
