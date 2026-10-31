import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { ready } from '@core/data';
import type { DataState } from '@core/data';
import { useBookingDetail, useRescheduleBooking } from '@features/booking';
import { useCatalogue } from '@features/catalogue';
import { serviceDateIn } from '@features/scheduled';
import { ScheduleForLaterView, useScheduleForLater } from '@features/scheduleLater';
import { getUserMessage, isAppError } from '@core/errors';
import { useNavigationGuard, useSafeBack } from '@core/navigation';
import { InfoDialog, QueryBoundary } from '@ui';

/**
 * Reschedule — the redesigned Schedule for Later screen (`cCQlzTeiObQkpVBzwI8mZi` `2466:18844`) in
 * its reschedule mode.
 *
 * It used to draw the OLD Schedule screens (`@features/scheduled`'s `ScheduleView`, from the
 * earlier Figma file's "Rescheduled flow" `275:5217`), so Reschedule opened a screen the rest of
 * the app no longer looks like (device test, 31 Oct 2026). The redesign never gave Reschedule its
 * own route, and this one was not moved over when "Book for later" was.
 *
 * The locked rules are unchanged: a reschedule moves WHEN, never how long (the carousel holds only
 * the booking's own duration), and it is free (no payable, no "Check payment details", CTA
 * "Reschedule"). The day the booking is on starts selected.
 *
 * ## Submit, and ruling R-3
 *
 * `POST /v1/bookings/:id/reschedule` decides eligibility. This screen sends the slot the server
 * itself offered and renders whatever comes back, including a refusal. It infers nothing.
 */
export default function RescheduleRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookingId = typeof id === 'string' ? id : '';
  const booking = useBookingDetail(bookingId === '' ? null : bookingId);
  const catalogue = useCatalogue();

  /**
   * The BOOKING being rescheduled — the only screen this one can be about. A notification that
   * deep-links here (or a `spoon://reschedule/:id`) therefore backs out to that booking rather
   * than to Home, which is where the customer expects to be when they abandon the change.
   */
  // One screen per tap: a quick double tap must not open (or pop) a screen twice.
  const guard = useNavigationGuard();
  const goBack = useSafeBack(bookingId === '' ? '/home' : `/booking/${bookingId}`);

  // The presets are read once, when the screen opens, so it waits for the booking first.
  const state = useMemo<DataState<{ durationId: string; dayId: string | null }>>(() => {
    if (booking.state.status !== 'ready') return booking.state;
    if (catalogue.state.status !== 'ready') return catalogue.state;
    const { scheduledStart, durationMinutes } = booking.state.data;
    const timeZone = catalogue.state.data.operatingWindow.timeZone;
    return ready({
      durationId: `dur-${String(durationMinutes)}`,
      dayId: scheduledStart === null ? null : serviceDateIn(timeZone, new Date(scheduledStart)),
    });
  }, [booking.state, catalogue.state]);

  return (
    <QueryBoundary state={state} onRetry={booking.refetch}>
      {(preset) => (
        <RescheduleScreen
          bookingId={bookingId}
          presetDurationId={preset.durationId}
          presetDayId={preset.dayId}
          onBack={guard(goBack)}
        />
      )}
    </QueryBoundary>
  );
}

function RescheduleScreen({
  bookingId,
  presetDurationId,
  presetDayId,
  onBack,
}: {
  readonly bookingId: string;
  readonly presetDurationId: string;
  readonly presetDayId: string | null;
  readonly onBack: () => void;
}) {
  const router = useRouter();
  // Re-read every 30 seconds only while this screen is showing (DEC-094).
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const later = useScheduleForLater({ presetDurationId, presetDayId, focused });
  const reschedule = useRescheduleBooking();
  const [error, setError] = useState<string | null>(null);
  const { selection } = later;

  return (
    <>
      <ScheduleForLaterView
        mode="reschedule"
        state={later.state}
        selection={selection}
        lostPick={later.lostPick}
        onBack={onBack}
        onRetry={later.refetch}
        onSelectDuration={later.selectDuration}
        onSelectDay={later.selectDay}
        onSelectPeriod={later.selectPeriod}
        onSelectSlot={later.selectSlot}
        // Reschedule is free, so there is no quote to wait on.
        canSubmit={bookingId !== ''}
        /* The call in flight still has to hold the CTA, or a second tap moves the booking twice. */
        submitting={reschedule.isPending}
        submitError={null}
        onSubmit={() => {
          // The slot id IS the server's ISO start, so what is sent back is exactly what was
          // offered. No slot is constructed here, and an unselected grid cannot submit.
          if (bookingId === '' || selection.slotId === null || reschedule.isPending) return;

          reschedule
            .mutateAsync({
              bookingId,
              scheduledStart: selection.slotId,
              // Scoped to the booking and the target instant, so a retry after an ambiguous
              // failure replays the same move instead of booking a second one.
              scope: `booking.reschedule:${bookingId}:${selection.slotId}`,
            })
            .then(() => {
              // The freed slot and the taken one both change what is free.
              void later.refreshFresh();
              /**
               * REPLACE, not push. The booking has moved, so returning to a grid still showing
               * the old slots would offer the customer a choice that no longer describes their
               * booking. The detail screen re-reads the authoritative state.
               */
              router.replace(`/booking/${bookingId}`);
            })
            .catch((thrown: unknown) => {
              // Includes the server's own refusal — "already rescheduled once", "too close to
              // the start". Its message is shown; this screen decides nothing about eligibility.
              setError(
                isAppError(thrown)
                  ? getUserMessage(thrown)
                  : 'We could not reschedule this booking.',
              );
            });
        }}
      />

      <InfoDialog
        visible={error !== null}
        onClose={() => setError(null)}
        title="Couldn’t reschedule"
        body={error ?? ''}
        testID="reschedule-error"
      />
    </>
  );
}
