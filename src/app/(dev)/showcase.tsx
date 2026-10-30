import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  BookingCard,
  BottomSheet,
  Button,
  Card,
  Chip,
  ChipGroup,
  CookCard,
  DetailRows,
  EmptyState,
  ErrorState,
  InfoDialog,
  ListRow,
  LoadingState,
  NavTile,
  NoteCard,
  OtpDisplay,
  PriceTile,
  RatingWidget,
  RouteScaffold,
  Screen,
  SectionHeader,
  StatusBanner,
  Text,
  lightTheme,
} from '@ui';
import type { RatingSelection } from '@ui';
import { HomeBookingBanner } from '@features/home';
import {
  DEMO_BOOKING_COMPLETED,
  DEMO_BOOKING_UNFULFILLED,
  DEMO_DURATION_OPTIONS,
  DEMO_REFUND_PROCESSING,
  DEMO_SLOT_OPTIONS,
} from '@/demo/fixtures/bookings';
import {
  DEMO_ACTIVE_BOOKING_ARRIVED,
  DEMO_ACTIVE_BOOKING_ARRIVING,
  DEMO_ACTIVE_BOOKING_CANCELLED,
  DEMO_ACTIVE_BOOKING_CONFIRMED,
  DEMO_ACTIVE_BOOKING_RATE,
  DEMO_ACTIVE_BOOKING_REASSIGNED,
  DEMO_ACTIVE_BOOKING_TIME_LEFT,
} from '@/demo/fixtures/home';
import {
  DEMO_COOK_MINIMAL,
  DEMO_COOK_PARTIAL_BADGES,
  DEMO_COOK_PROFILES,
} from '@/demo/fixtures/cooks';

/**
 * Component showcase — DEVELOPMENT ONLY.
 *
 * This is the safe surface for exercising the design system while there is no backend. It renders
 * nothing but static fixtures from `src/demo/`, and it refuses to render outside `__DEV__` so it
 * cannot become a production screen by accident.
 *
 * The layering demo at the bottom is the one that matters: a bottom sheet with a dialog above it,
 * which is the Instant-sheet + taxes-popup requirement from the audit.
 */
export default function ShowcaseRoute() {
  const [rating, setRating] = useState<RatingSelection | null>(4.5);
  const [duration, setDuration] = useState<string | null>('dur-90');
  const [slot, setSlot] = useState<string | null>('slot-0630');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!__DEV__) {
    return (
      <RouteScaffold
        title="Showcase"
        status="foundation"
        notes={['The component showcase is available in development builds only']}
      />
    );
  }

  return (
    <Screen scroll testID="showcase">
      <Text variant="headingLarge">Design system</Text>

      <Section title="Buttons">
        <Button label="Book Now • ₹129" onPress={noop} variant="primary" />
        <Button label="Start Service" onPress={noop} variant="accent" />
        <Button label="Pay →" onPress={noop} variant="inverse" size="md" fullWidth={false} />
        <Button label="No" onPress={noop} variant="secondary" size="md" fullWidth={false} />
        <Button label="Cancel Booking & Refund" onPress={noop} variant="link" fullWidth={false} />
        <Button label="Log Out of Account" onPress={noop} variant="danger" size="md" />
        <Button label="Submitting" onPress={noop} loading />
        <Button label="Unavailable" onPress={noop} disabled />
      </Section>

      <Section title="Chips and tiles">
        <ChipGroup
          options={[
            { id: 'today', caption: 'Today', label: 'Aug 5' },
            { id: 'tomorrow', caption: 'Tomorrow', label: 'Aug 6' },
            { id: 'fri', caption: 'Fri', label: 'Aug 7' },
          ]}
          selectedId="fri"
          onSelect={noop}
          testID="showcase-days"
        />
        <View style={styles.row}>
          <Chip label="Morning" icon="sunrise" tone="surface" selected onPress={noop} />
          <Chip label="Afternoon" icon="sun" tone="surface" onPress={noop} />
          <Chip label="Evening" icon="moon" tone="surface" onPress={noop} />
        </View>
        <ChipGroup
          options={DEMO_SLOT_OPTIONS}
          selectedId={slot}
          onSelect={setSlot}
          columns={4}
          accessibilityLabel="Start time"
          testID="showcase-slots"
        />
        <View style={styles.tiles}>
          {DEMO_DURATION_OPTIONS.map((option) => (
            <View key={option.id} style={styles.tile}>
              <PriceTile
                label={option.label}
                price={option.price}
                strikePrice={option.strikePrice}
                selected={duration === option.id}
                disabled={'disabled' in option ? option.disabled : false}
                onPress={() => setDuration(option.id)}
              />
            </View>
          ))}
        </View>
      </Section>

      <Section title="Status">
        <StatusBanner
          title="Cook Asha is arriving"
          message="The cook will reach your location on time!"
          icon="pin"
          highlight="16 mins"
        />
        <StatusBanner
          title="Cook Asha is arriving"
          message="We're sorry for the delay, the cook is running late"
          tone="warning"
          highlight="21 mins"
        />
        <View style={styles.row}>
          <Badge label="Completed" tone="positive" />
          <Badge label="Unfulfilled" tone="warning" />
          <Badge label="Special offer" tone="info" uppercase />
        </View>
      </Section>

      {/* All eight frames of the finalized "Cook profiles" section (`289:8515`), in its order. */}
      <Section title="Cook profiles">
        {DEMO_COOK_PROFILES.map((profile) => (
          <CookCard
            key={`${profile.cook.id}-${profile.variant}`}
            cook={profile.cook}
            variant={profile.variant}
            onCallCook={noop}
            testID={`showcase-cook-${profile.cook.firstName.toLowerCase()}-${profile.variant}`}
          />
        ))}
      </Section>

      <Section title="Cook card — degraded payloads">
        <CookCard cook={DEMO_COOK_PARTIAL_BADGES} testID="showcase-cook-partial" />
        <CookCard cook={DEMO_COOK_MINIMAL} testID="showcase-cook-minimal" />
      </Section>

      <Section title="Booking cards">
        <BookingCard booking={DEMO_BOOKING_COMPLETED} onPress={noop} />
        <BookingCard booking={DEMO_BOOKING_UNFULFILLED} />
        <BookingCard booking={DEMO_REFUND_PROCESSING} variant="refund" />
      </Section>

      <Section title="Home active booking">
        <HomeBookingBanner booking={DEMO_ACTIVE_BOOKING_CONFIRMED} onOpen={noop} />
        <HomeBookingBanner booking={DEMO_ACTIVE_BOOKING_REASSIGNED} onOpen={noop} />
        <HomeBookingBanner booking={DEMO_ACTIVE_BOOKING_ARRIVING} onOpen={noop} />
        <HomeBookingBanner booking={DEMO_ACTIVE_BOOKING_ARRIVED} onOpen={noop} />
        <HomeBookingBanner booking={DEMO_ACTIVE_BOOKING_TIME_LEFT} onOpen={noop} />
        <HomeBookingBanner booking={DEMO_ACTIVE_BOOKING_CANCELLED} onOpen={noop} />
        <HomeBookingBanner
          booking={DEMO_ACTIVE_BOOKING_RATE}
          onOpen={noop}
          onRate={(value: RatingSelection) => setRating(value)}
        />
      </Section>

      <Section title="Rating">
        <RatingWidget value={rating} onChange={setRating} showExceptionalPrompt />
        <Text variant="caption" color="textSecondary">
          {`Selected: ${rating === null ? 'none' : rating}`}
        </Text>
      </Section>

      <Section title="Summary rows">
        <Card tone="accent">
          <DetailRows
            rows={[
              { label: 'Date', value: 'Today, Aug 5' },
              { label: 'Start time', value: '5:30 PM' },
              { label: 'Duration', value: '1 hr' },
              { label: 'End Time', value: '8:00 PM' },
              { label: 'Total', value: '₹135', emphasis: 'total' },
            ]}
          />
        </Card>
        <OtpDisplay code="111" title="Start OTP" caption="Share this to start the service" />
        <NoteCard
          title="Note before starting"
          body="Please approve gate entry and ensure groceries and gas are available before cook's arrival."
        />
      </Section>

      <Section title="Navigation">
        <View style={styles.row}>
          <NavTile
            title="My bookings"
            subtitle="View booking history"
            icon="clock"
            onPress={noop}
          />
          <NavTile title="Addresses" subtitle="View or add addresses" icon="pin" onPress={noop} />
        </View>
        <Card tone="surface">
          <ListRow
            title="Home"
            subtitle="B-402, Green Meadows, Indiranagar 100ft Road"
            icon="home"
            onPress={noop}
          />
          <ListRow title="Log Out of Account" icon="logout" destructive onPress={noop} />
        </Card>
      </Section>

      <Section title="States">
        <LoadingState variant="spinner" />
        <LoadingState variant="card" count={2} />
        <EmptyState
          title="No saved addresses"
          description="Add an address so a cook knows where to go."
          actionLabel="Add address"
          onAction={noop}
        />
        <ErrorState error={{ kind: 'network', message: 'offline' }} onRetry={noop} />
      </Section>

      <Section title="Overlays — sheet with a dialog above it">
        <Button label="Open Instant sheet" onPress={() => setSheetOpen(true)} variant="primary" />
      </Section>

      <BottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Instant"
        footer={<Button label="Book NOW • ₹198" onPress={noop} />}
        {...(dialogOpen
          ? {
              dialog: (
                <InfoDialog
                  visible
                  presentation="inline"
                  onClose={() => setDialogOpen(false)}
                  title="What is Taxes?"
                  body="Taxes levied as per Govt. regulations, subject to change basis final service value."
                />
              ),
              onDialogClose: () => setDialogOpen(false),
            }
          : {})}
        testID="showcase-sheet"
      >
        <SectionHeader title="Arriving in 18 mins" />
        <View style={styles.tiles}>
          {DEMO_DURATION_OPTIONS.slice(0, 4).map((option) => (
            <View key={option.id} style={styles.tile}>
              <PriceTile
                label={option.label}
                price={option.price}
                strikePrice={option.strikePrice}
                selected={duration === option.id}
                onPress={() => setDuration(option.id)}
              />
            </View>
          ))}
        </View>
        <Button
          label="Check payment details"
          onPress={() => setDialogOpen(true)}
          variant="link"
          size="md"
        />
      </BottomSheet>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function noop() {
  // Showcase actions are intentionally inert.
}

const styles = StyleSheet.create({
  section: { marginTop: lightTheme.space.xl },
  sectionBody: { gap: lightTheme.space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: lightTheme.space.sm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -lightTheme.space.xs },
  tile: {
    width: '33.33%',
    paddingHorizontal: lightTheme.space.xs,
    paddingBottom: lightTheme.space.sm,
  },
});
