import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Image, LayoutAnimation, StyleSheet, View } from 'react-native';
import type { ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ART } from '../assets';
import { ActiveBookings } from '../components/ActiveBookings';
import { BookSection } from '../components/BookSection';
import { CooksTrust } from '../components/CooksTrust';
import { DaySorted } from '../components/DaySorted';
import { DurationDial } from '../components/DurationDial';
import { HeroBanner } from '../components/HeroBanner';
import { HomeHeader } from '../components/HomeHeader';
import { NotIncluded } from '../components/NotIncluded';
import { NotLiveCard } from '../components/NotLiveCard';
import type { NotifyState } from '../components/NotLiveCard';
import { PromiseFooter } from '../components/Promise';
import { RecurringPool } from '../components/RecurringPool';
import { ShareCard } from '../components/ShareCard';
import { Toast } from '../components/Toast';
import type { ToastHandle } from '../components/Toast';
import { TaxDetailsDialog } from '../components/TaxDetailsDialog';
import { SHARE_MESSAGE } from '../content';
import { shareSpoon } from '../share';
import { canBook, ctaKind, draftReducer, initialDraft } from '../state/bookingDraft';
import type { BookingDraft, BookingMode } from '../state/bookingDraft';
import { forCta, isDurationAvailable, nearestAvailableId } from '../state/durations';
import { recommendDuration } from '../state/recommendDuration';
import type { DialInputs } from '../state/recommendDuration';
import { poolBeads, recurringChipFor } from '../state/recurring';
import type { RecurringTarget } from '../state/recurring';
import { resolveHomeVariant } from '../state/variant';
import { C } from '../theme';
import type { ActiveBookingCard, DurationOption, HomeModel, PoolCook } from '../types';

/** What the customer chose, handed to the booking flow. */
export interface BookingRequest {
  readonly duration: DurationOption;
  readonly dishes: number;
  readonly people: number;
  readonly complexity: BookingDraft['complexity'];
}

/**
 * Every place Home hands off to. The screen owns no navigation; the route decides where each goes.
 */
export interface HomeRedesignActions {
  /** Building label → address picker. */
  readonly onPressAddress: () => void;
  /** Avatar → profile. */
  readonly onPressProfile: () => void;
  /** An Active bookings card → that booking's details. */
  readonly onPressActiveBooking?: (card: ActiveBookingCard) => void;
  /** Active bookings "View all ›" → My bookings, Upcoming. */
  readonly onPressViewAllBookings?: () => void;
  /** Lime "Book now" (Now, instant available) → Razorpay for the payable total. */
  readonly onBookNow: (request: BookingRequest) => void;
  /**
   * Yellow "Schedule" (Later, or Now while instant is unavailable) → the slot picker, with the
   * duration pre-selected so only slots and payment remain.
   */
  readonly onPickSlot: (request: BookingRequest) => void;
  /**
   * The recurring chip: recurring flow, plan tracker or explainer. Returns `false` for a
   * destination that does not exist yet, and the screen says "coming soon" instead of nothing.
   */
  readonly onPressRecurring: (target: RecurringTarget) => boolean;
  /** Absent while the cook pool screen does not exist — the chip then says "coming soon". */
  readonly onPressCookPool?: () => void;
  /** Bead → cook profile (proposed in the dev note). */
  readonly onPressPoolCook?: (cook: PoolCook) => void;
  /**
   * "Notify me" — idempotent register for {user, pincode}, asking notification permission at
   * the tap (see `joinWaitlist`). Rejects only if the register fails.
   */
  readonly onJoinWaitlist: (pincode: string) => Promise<void>;
  /**
   * Analytics `duration_selected`, raised on every new selection: `tile` a tap, `dial` a Help me
   * pick suggestion. Taking a selection back (a second tap) raises nothing.
   */
  readonly onDurationSelected?: (event: {
    durationMin: number;
    pricePaise: number;
    source: 'tile' | 'dial';
  }) => void;
  /** Re-read availability (Home focus is handled by the screen; this is the Now/Later switch). */
  readonly onRefreshAvailability?: () => void;
  /** Defaults to `shareSpoon`: WhatsApp first, the system share sheet otherwise. */
  readonly onShare?: () => void;
  /**
   * Whether the tiles are showing Later availability: the Later tab, or Now while Instant is
   * unavailable ("Book for later"). The route re-reads the three-day overview every 30 seconds
   * only while this holds (DEC-094).
   */
  readonly onLaterTilesChange?: (showing: boolean) => void;
}

export interface HomeRedesignViewProps extends HomeRedesignActions {
  readonly model: HomeModel;
  readonly initialMode?: BookingMode;
  /** A booking is being created / checkout is open — the CTA holds still. */
  readonly bookingBusy?: boolean;
  /** One-line messages from the route (a refused booking, say). A new `id` shows it again. */
  readonly notice?: { readonly id: number; readonly message: string } | null;
  /**
   * A status banner the route puts at the top of the body: Recurring's "Confirming Autopay"
   * while the bank confirms a mandate (Autopay note 2317:13605). No Home frame draws one.
   */
  readonly banner?: ReactNode;
  /**
   * Home is the focused route. It stays mounted under a pushed screen, so this is what stops the
   * Active bookings carousel advancing for a screen nobody is looking at. Defaults to true.
   */
  readonly focused?: boolean;
}

/**
 * The redesigned Home — Figma `cCQlzTeiObQkpVBzwI8mZi`, one screen with three variants resolved
 * from the payload (`resolveHomeVariant`), never from a client guess:
 *
 *   default    `941:4884`   live pincode, no booking history
 *   returning  `1255:2973`  default + the pool / recurring block under the CTA;
 *              `1290:1280`  on Recurring the duration strip and CTA give way to that block
 *              `2240:6334`  + the Active bookings carousel between the hero and the Book section
 *                           (any variant, whenever the customer has an active booking)
 *   inactive   `1302:3539`  not live — waitlist + referral, no booking path, read-only dial
 */
export function HomeRedesignView({
  model,
  initialMode,
  bookingBusy = false,
  notice = null,
  banner = null,
  focused = true,
  ...actions
}: HomeRedesignViewProps) {
  const { top, bottom } = useSafeAreaInsets();
  const variant = resolveHomeVariant(model);
  const scroll = useRef<ScrollView>(null);
  /*
   * The address header is pinned above the scroll (owner, 2026-10-14). It is see-through at the
   * top of the page, as Figma draws it, and fills with the screen-header gradient, rounded at the
   * bottom, once the page moves under it. Its height (status bar included) is measured, so the
   * page starts below it and jumps within the page stop below it rather than under it.
   */
  const [scrollY] = useState(() => new Animated.Value(0));
  const [headerHeight, setHeaderHeight] = useState(
    top + HEADER_TOP_GAP + HEADER_ROW + HEADER_BOTTOM_GAP,
  );
  const headerFill = scrollY.interpolate({
    inputRange: [0, HEADER_FILL_DISTANCE],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const bodyY = useRef(0);
  const dialY = useRef(0);
  /** The Book section's offset in the body — where "Select duration" brings the customer back. */
  const bookY = useRef(0);

  const [draft, dispatch] = useReducer(
    draftReducer,
    {
      focusedDurationId: model.focusedDurationId,
      instantAvailable: model.instant.available,
      mode: initialMode,
    },
    (input) =>
      initialDraft({
        focusedDurationId: input.focusedDurationId,
        instantAvailable: input.instantAvailable,
        ...(input.mode === undefined ? {} : { mode: input.mode }),
      }),
  );

  /**
   * `1303:1333` dev note: "When Instant is not available, user is automatically taken to the
   * Later / schedule state." `initialDraft` does that when Home opens already knowing; Instant's
   * read usually lands a moment later, so the switch also happens then — until the customer picks
   * a tab. Choosing Now themselves shows the instantNA state: the same SKUs, grey Now, "Book for
   * later".
   */
  const modeChosen = useRef(initialMode !== undefined);
  useEffect(() => {
    if (modeChosen.current || model.instant.available || draft.mode !== 'now') return;
    dispatch({ type: 'setMode', mode: 'later' });
  }, [model.instant.available, draft.mode]);

  // Every mode can be chosen (the toggle never deactivates a tab); the content below decides
  // what each can do — Now without instant simply leaves the CTA off.
  const mode = draft.mode;
  const cta = ctaKind(mode, model.instant.available);
  const { onLaterTilesChange } = actions;
  const laterTiles = cta === 'schedule';
  useEffect(() => {
    onLaterTilesChange?.(laterTiles);
  }, [laterTiles, onLaterTilesChange]);
  // Tiles priced for the current CTA: Instant's for "Book Now", Scheduled's otherwise.
  const durations = useMemo(
    () => model.durations.map((d) => forCta(d, cta)),
    [model.durations, cta],
  );
  const [taxOpen, setTaxOpen] = useState(false);
  const toast = useRef<ToastHandle>(null);
  const available = (d: DurationOption) => isDurationAvailable(d, cta);

  // Focus never rests on an unbookable tile; a refreshed payload that drops it falls back too.
  const durationIds = durations.map((d) => d.id);
  const wantedFocus = durationIds.includes(draft.focusedDurationId)
    ? draft.focusedDurationId
    : model.focusedDurationId;
  const focusedId = nearestAvailableId(durations, wantedFocus, cta);
  // A selection that became unavailable (refresh, or a Now/Later switch) is cleared below.
  const selectedOption = durations.find((d) => d.id === draft.selectedDurationId);
  const selectedId =
    selectedOption !== undefined && available(selectedOption) ? selectedOption.id : null;
  const bookable = canBook({ ...draft, selectedDurationId: selectedId }) && !bookingBusy;

  const noticeId = notice?.id;
  const noticeMessage = notice?.message;
  useEffect(() => {
    if (noticeMessage !== undefined) toast.current?.show(noticeMessage);
  }, [noticeId, noticeMessage]);

  const comingSoon = () => toast.current?.show('Coming soon.');

  const lostSelection = draft.selectedDurationId !== null && selectedId === null;
  useEffect(() => {
    if (!lostSelection) return;
    const lost = durations.find((d) => d.id === draft.selectedDurationId);
    // Nothing takes its place: the customer picks again.
    toast.current?.show(`${lost?.label ?? 'That duration'} is no longer available.`);
    dispatch({ type: 'clearSelection' });
  }, [lostSelection, draft.selectedDurationId, durations]);

  /** Selecting a duration (a tap, or Help me pick) also brings it to the front. */
  const selectDuration = (id: string, source: 'tile' | 'dial') => {
    const option = durations.find((d) => d.id === id);
    if (option === undefined || !available(option)) return;
    if (id !== draft.selectedDurationId) {
      actions.onDurationSelected?.({
        durationMin: option.minutes,
        pricePaise: option.pricePaise,
        source,
      });
    }
    if (id !== draft.focusedDurationId) dispatch({ type: 'focusDuration', id });
    dispatch({ type: 'selectDuration', id });
  };

  /*
   * Nothing is selected until the customer taps a tile (or takes a Help me pick suggestion). The
   * tile at the front is only where the strip rests; on open that is 45 mins.
   */

  const inputs: DialInputs = {
    complexity: draft.complexity,
    dishes: draft.dishes,
    people: draft.people,
  };
  const recommended = recommendDuration(inputs, durations);

  const changeMode = (next: BookingMode) => {
    modeChosen.current = true;
    if (next === mode) return;
    // Recurring removes the strip and CTA; animate the content moving up (and back).
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    dispatch({ type: 'setMode', mode: next });
    actions.onRefreshAvailability?.();
  };

  /** The dial's result selects the tile, so changing an input picks the new recommendation. */
  const changeInputs = (next: DialInputs) => {
    if (next.complexity !== draft.complexity) {
      dispatch({ type: 'setComplexity', complexity: next.complexity });
    }
    if (next.dishes !== draft.dishes) dispatch({ type: 'setDishes', value: next.dishes });
    if (next.people !== draft.people) dispatch({ type: 'setPeople', value: next.people });
    const pick = recommendDuration(
      next,
      durations.filter((d) => available(d)),
    );
    if (pick !== null) selectDuration(pick.id, 'dial');
  };

  /**
   * `1622:2011` "Select duration": takes the dial's recommendation (among the tiles that can be
   * booked in this mode), centres it in the carousel and brings the Book section back into view.
   */
  const selectRecommended = () => {
    const pick = recommendDuration(
      inputs,
      durations.filter((d) => available(d)),
    );
    if (pick === null) return;
    selectDuration(pick.id, 'dial');
    scroll.current?.scrollTo({ y: bodyY.current + bookY.current - headerHeight, animated: true });
  };

  const request = (): BookingRequest | null => {
    const duration = durations.find((d) => d.id === selectedId);
    if (duration === undefined) return null;
    return { duration, dishes: draft.dishes, people: draft.people, complexity: draft.complexity };
  };

  const book = () => {
    const chosen = request();
    if (chosen === null) return;
    if (cta === 'book') actions.onBookNow(chosen);
    else if (cta === 'schedule') actions.onPickSlot(chosen);
  };

  // Waitlist button: disabled "You're on the list" on load when the server says joined.
  const joined = model.waitlist?.joined === true;
  const [localNotify, setNotifyState] = useState<NotifyState>('idle');
  const notifyState: NotifyState = joined ? 'joined' : localNotify;

  const notify = () => {
    if (notifyState !== 'idle') return;
    setNotifyState('pending');
    actions.onJoinWaitlist(model.address.pincode).then(
      () => setNotifyState('joined'),
      () => setNotifyState('idle'),
    );
  };

  const share = actions.onShare ?? (() => void shareSpoon(SHARE_MESSAGE));
  // Returning users see the pool under the CTA; anyone on Recurring sees it in place of the strip.
  // With fewer than two pooled cooks its chip reads "Check Recurring" and opens the explainer.
  const showPool = variant === 'returning' || mode === 'recurring';

  return (
    <View style={styles.screen} testID="home-redesign-screen">
      <Animated.ScrollView
        ref={scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: bottom }}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
      >
        <Image source={ART.glows} style={styles.glows} resizeMode="stretch" />
        <View
          style={styles.body}
          onLayout={(e) => {
            bodyY.current = e.nativeEvent.layout.y;
          }}
        >
          {banner}

          {/* Decorative. */}
          <HeroBanner />

          <ActiveBookings
            cards={model.activeBookings ?? []}
            onPressCard={actions.onPressActiveBooking ?? comingSoon}
            onPressViewAll={actions.onPressViewAllBookings ?? comingSoon}
            focused={focused}
          />

          {variant === 'inactive' && model.waitlist !== null ? (
            <NotLiveCard
              pincode={model.address.pincode}
              liveHubs={model.liveHubs}
              waitlist={model.waitlist}
              notifyState={notifyState}
              onPressNotify={notify}
              onPressShare={share}
            />
          ) : null}

          {variant === 'inactive' ? null : (
            <View
              onLayout={(e) => {
                bookY.current = e.nativeEvent.layout.y;
              }}
            >
              <BookSection
                etaMins={model.instant.available ? model.instant.etaMins : null}
                mode={mode}
                onChangeMode={changeMode}
                durations={durations}
                focusedDurationId={focusedId}
                selectedDurationId={selectedId}
                onFocusDuration={(id) => dispatch({ type: 'focusDuration', id })}
                onSelectDuration={(id) => {
                  // A second tap on the selected tile takes the selection back.
                  if (id === selectedId) dispatch({ type: 'clearSelection' });
                  else selectDuration(id, 'tile');
                }}
                isAvailable={available}
                pricingStatus={model.pricingStatus ?? 'ready'}
                onPressUnavailable={(d) =>
                  toast.current?.show(
                    `${d.label} isn’t available ${cta === 'book' ? 'right now' : 'to schedule'}.`,
                  )
                }
                onRetryPricing={() => actions.onRefreshAvailability?.()}
                canBook={bookable}
                onPressBook={book}
                onPressHelpMePick={() =>
                  scroll.current?.scrollTo({
                    y: bodyY.current + dialY.current - headerHeight,
                    animated: true,
                  })
                }
                onPressPaymentDetails={() => setTaxOpen(true)}
                cta={cta}
              />
            </View>
          )}

          {showPool ? (
            <RecurringPool
              beads={poolBeads(model)}
              chip={recurringChipFor(model)}
              onPressChip={() => {
                if (!actions.onPressRecurring(recurringChipFor(model).target)) comingSoon();
              }}
              onPressCookPool={actions.onPressCookPool ?? comingSoon}
              onPressCook={actions.onPressPoolCook ?? comingSoon}
            />
          ) : null}

          <DaySorted />

          <View
            onLayout={(e) => {
              // Relative to the body; Help me pick adds the body's offset and parks the dial's
              // heading just under the status bar.
              dialY.current = e.nativeEvent.layout.y;
            }}
          >
            <DurationDial
              durations={durations}
              recommended={recommended}
              inputs={inputs}
              {...(variant === 'inactive'
                ? {}
                : { onChangeInputs: changeInputs, onSelectDuration: selectRecommended })}
            />
          </View>

          <CooksTrust />
          <NotIncluded />
          {variant === 'inactive' ? <ShareCard onPressShare={share} /> : null}
          <PromiseFooter />
        </View>
      </Animated.ScrollView>
      <View
        style={[
          styles.header,
          { paddingTop: top + HEADER_TOP_GAP, paddingBottom: HEADER_BOTTOM_GAP },
        ]}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        testID="home-header-bar"
      >
        <Animated.View style={[styles.headerFill, { opacity: headerFill }]} pointerEvents="none">
          <LinearGradient colors={[C.softer, C.tint]} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <HomeHeader
          addressLabel={model.address.label}
          addressDetail={model.address.detail}
          onPressAddress={actions.onPressAddress}
          onPressProfile={actions.onPressProfile}
          filled={headerFill}
        />
      </View>
      <Toast ref={toast} />
      <TaxDetailsDialog
        visible={taxOpen}
        onClose={() => setTaxOpen(false)}
        gstPercent={model.tax.gstPercent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.base },
  /** `941:4885` — soft yellow glows drawn behind the whole page; they scroll with it. */
  glows: { position: 'absolute', top: 0, left: 0, right: 0, height: 3027 },
  body: { gap: 24 },
  header: { position: 'absolute', top: 0, left: 0, right: 0 },
  /** The screen headers' fill (`#FFF7CC` → `#FFE666`), rounded 24 at the bottom like theirs. */
  headerFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 12, color: 'rgba(0,0,0,0.1)' }],
  },
});

/** `1255:2983` — the header row: a 44pt pin box with 8pt above and below. */
const HEADER_ROW = 60;
/** Breathing room between the status bar and the address row (owner, 2026-10-14). */
const HEADER_TOP_GAP = 12;
/** Room under the address row, so the filled header's rounded edge does not hug it (owner, 2026-10-14). */
const HEADER_BOTTOM_GAP = 8;
/** How far the page scrolls before the header is fully filled. */
const HEADER_FILL_DISTANCE = 24;
