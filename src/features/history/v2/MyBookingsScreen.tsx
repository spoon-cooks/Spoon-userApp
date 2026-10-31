import type { ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DataState } from '@core/data';
import { ACCOUNTS_ART } from '@ui/v2/accountsArt';
import { QueryBoundary } from '@ui';
import { PrimaryButton } from '@ui/v2/Buttons';
import { C, SHADOW_1, T, figmaGradient } from '@ui/v2/theme';

import { countLabel, monthGroupsFrom } from './model';
import type { BookingKind, BookingRow, NextVisit, StatusGlyph } from './model';

export type MyBookingsTab = 'upcoming' | 'past';

export interface MyBookingsPaging {
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly loadMoreError: boolean;
  readonly loadMore: () => void;
  readonly retryLoadMore: () => void;
  readonly refetch: () => void;
}

export interface MyBookingsScreenProps {
  readonly tab: MyBookingsTab;
  readonly onTab: (tab: MyBookingsTab) => void;
  readonly upcoming: MyBookingsPaging & {
    readonly state: DataState<{
      readonly next: NextVisit | null;
      readonly later: readonly BookingRow[];
    }>;
    readonly count: number;
  };
  readonly past: MyBookingsPaging & {
    readonly state: DataState<readonly BookingRow[]>;
    readonly count: number;
  };
  readonly onBack: () => void;
  readonly onOpen: (bookingId: string) => void;
  readonly onBook: () => void;
}

const TEST_ID = 'history-screen';

/**
 * My bookings — Figma `2192:4371` (Upcoming), `2192:4430` (Past), `2192:4504` / `2192:4534`
 * (Empty). Both tabs stay mounted and only the active one is shown, so each keeps its own scroll
 * position (dev note `2192:4489`). A card opens Visit details; it carries no other action.
 */
export function MyBookingsScreen(props: MyBookingsScreenProps) {
  const { top } = useSafeAreaInsets();
  const { tab, upcoming, past } = props;
  return (
    <View style={styles.screen} testID={TEST_ID}>
      <View style={[styles.header, { paddingTop: top + 16 }]}>
        <View style={styles.nav}>
          <Pressable
            onPress={props.onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={styles.back}
            testID={`${TEST_ID}-back`}
          >
            <Image source={ACCOUNTS_ART.chevronLeft} style={styles.icon24} />
          </Pressable>
          <Text style={T.displayLarge} accessibilityRole="header">
            My bookings
          </Text>
        </View>
        <View style={styles.tabs} testID={`${TEST_ID}-tabs`}>
          <TabButton
            label="Upcoming"
            count={countLabel(upcoming.count, upcoming.hasMore)}
            active={tab === 'upcoming'}
            onPress={() => props.onTab('upcoming')}
            testID={`${TEST_ID}-tabs-upcoming`}
          />
          <TabButton
            label="Past"
            count={countLabel(past.count, past.hasMore)}
            active={tab === 'past'}
            onPress={() => props.onTab('past')}
            testID={`${TEST_ID}-tabs-past`}
          />
        </View>
      </View>

      <View style={[styles.flex, tab === 'upcoming' ? null : styles.hidden]}>
        <QueryBoundary state={upcoming.state} onRetry={upcoming.refetch} loadingVariant="card">
          {(data) => {
            if (data.next === null && data.later.length === 0) {
              return (
                <EmptyBookings
                  title="Nothing coming up"
                  body="Book a service and your next visit will show up here."
                  art={ACCOUNTS_ART.emptyFlower}
                  onBook={props.onBook}
                  testID={`${TEST_ID}-empty`}
                />
              );
            }
            return (
              <RowList
                rows={data.later.map((row) => ({ type: 'row' as const, row }))}
                header={
                  // One View, so the body's 16pt gap also separates the label, the card and LATER:
                  // FlatList wraps its header in a single cell, and `gap` only reaches between cells.
                  <View style={styles.listHeader}>
                    {data.next === null ? null : (
                      <>
                        <Text style={styles.sectionLabel}>NEXT VISIT</Text>
                        <NextVisitCard
                          visit={data.next}
                          onPress={() => props.onOpen(data.next?.id ?? '')}
                        />
                      </>
                    )}
                    {data.later.length === 0 ? null : (
                      <Text style={styles.sectionLabel}>LATER</Text>
                    )}
                  </View>
                }
                paging={upcoming}
                onOpen={props.onOpen}
                testID={`${TEST_ID}-upcoming`}
              />
            );
          }}
        </QueryBoundary>
      </View>

      <View style={[styles.flex, tab === 'past' ? null : styles.hidden]}>
        <QueryBoundary state={past.state} onRetry={past.refetch} loadingVariant="card">
          {(rows) => {
            if (rows.length === 0) {
              return (
                <EmptyBookings
                  title="No bookings yet"
                  body="Your completed visits will show up here."
                  art={ACCOUNTS_ART.emptyFlowerPast}
                  onBook={props.onBook}
                  testID={`${TEST_ID}-past-empty`}
                />
              );
            }
            return (
              <RowList
                rows={monthGroupsFrom(rows).flatMap((group) => [
                  { type: 'month' as const, month: group.month },
                  ...group.rows.map((row) => ({ type: 'row' as const, row })),
                ])}
                paging={past}
                onOpen={props.onOpen}
                testID={`${TEST_ID}-past`}
              />
            );
          }}
        </QueryBoundary>
      </View>
    </View>
  );
}

function TabButton({
  label,
  count,
  active,
  onPress,
  testID,
}: {
  label: string;
  count: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={`${label}, ${count}`}
      accessibilityState={{ selected: active }}
      style={[styles.tab, active && styles.tabActive]}
      testID={testID}
    >
      <Text style={[T.bodyStrong, !active && styles.secondary]}>{label}</Text>
      <View style={[styles.count, active ? styles.countActive : styles.countIdle]}>
        <Text style={[T.bodyStrong, !active && styles.secondary]} testID={`${testID}-count`}>
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

type ListItem =
  | { readonly type: 'month'; readonly month: string }
  | { readonly type: 'row'; readonly row: BookingRow };

function RowList({
  rows,
  header,
  paging,
  onOpen,
  testID,
}: {
  rows: readonly ListItem[];
  header?: ReactElement;
  paging: MyBookingsPaging;
  onOpen: (id: string) => void;
  testID: string;
}) {
  return (
    <FlatList
      testID={`${testID}-list`}
      data={rows}
      keyExtractor={(item) => (item.type === 'month' ? `month-${item.month}` : item.row.id)}
      contentContainerStyle={styles.body}
      ListHeaderComponent={header}
      renderItem={({ item }) =>
        item.type === 'month' ? (
          <Text style={styles.sectionLabel}>{item.month}</Text>
        ) : (
          <BookingCard row={item.row} onPress={() => onOpen(item.row.id)} />
        )
      }
      onEndReached={paging.hasMore ? paging.loadMore : undefined}
      onEndReachedThreshold={1.5}
      ListFooterComponent={
        paging.loadingMore ? (
          <View style={styles.pagingRow} testID={`${testID}-loading-more`}>
            <ActivityIndicator color={C.text} />
          </View>
        ) : paging.loadMoreError ? (
          <View style={styles.pagingRow} testID={`${testID}-load-more-error`}>
            <Text style={[T.caption, styles.secondary]}>Couldn’t load more</Text>
            <Pressable
              onPress={paging.retryLoadMore}
              accessibilityRole="button"
              accessibilityLabel="Retry loading more"
              hitSlop={8}
            >
              <Text style={[T.captionStrong, styles.underline]}>Retry</Text>
            </Pressable>
          </View>
        ) : null
      }
    />
  );
}

const GLYPH_ART = {
  check: ACCOUNTS_ART.wellCheck,
  rescheduled: ACCOUNTS_ART.recurring,
  closed: ACCOUNTS_ART.wellClose,
  pending: ACCOUNTS_ART.calendar,
} as const;

/** The status well: `#FFEF99`, or `#FFF7CC` behind a cross (`2192:4421`). */
function StatusWell({ glyph, size }: { glyph: StatusGlyph; size: 44 | 32 }) {
  const icon = size === 44 ? 22 : 16;
  const source = glyph === 'check' && size === 32 ? ACCOUNTS_ART.wellCheckSmall : GLYPH_ART[glyph];
  return (
    <View
      style={[
        styles.well,
        { width: size, height: size, borderRadius: size / 2 },
        glyph === 'closed' ? styles.wellClosed : styles.wellOpen,
      ]}
      testID={`${TEST_ID}-well-${glyph}`}
    >
      <Image source={source} style={{ width: icon, height: icon }} />
    </View>
  );
}

function KindTag({ kind }: { kind: BookingKind }) {
  return (
    <View style={[styles.tag, kind === 'recurring' ? styles.tagRecurring : styles.tagOneTime]}>
      <Text style={T.captionStrong}>{kind === 'recurring' ? 'Recurring' : 'One-time'}</Text>
    </View>
  );
}

function BookingCard({ row, onPress }: { row: BookingRow; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.when}, ${row.statusLine}`}
      style={[styles.card, row.dimmed && styles.dimmed]}
      testID={`${TEST_ID}-card-${row.id}`}
    >
      <StatusWell glyph={row.glyph} size={44} />
      <View style={styles.info}>
        <View style={styles.infoTop}>
          <Text style={[T.bodyStrong, styles.shrink]} numberOfLines={1}>
            {row.when}
          </Text>
          <KindTag kind={row.kind} />
        </View>
        <Text style={T.body} testID={`${TEST_ID}-card-${row.id}-status`}>
          {row.statusLine}
        </Text>
      </View>
    </Pressable>
  );
}

/** `2192:4392` — the Status banner's gradient transform. */
const SKY = figmaGradient([
  [0.6, 0.4, 0],
  [-0.4, 0.6, 0.4],
]);

function NextVisitCard({ visit, onPress }: { visit: NextVisit; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Next visit, ${visit.date}, ${visit.slot}, ${visit.statusLine}`}
      style={styles.nextCard}
      testID={`${TEST_ID}-next-${visit.id}`}
    >
      <LinearGradient
        colors={['#FFF3A6', '#FFD600']}
        start={SKY.start}
        end={SKY.end}
        style={[styles.banner, SHADOW_1]}
      >
        <View style={styles.backdrop} pointerEvents="none">
          <Image source={ACCOUNTS_ART.skyGlow} style={styles.glow} />
          <Image source={ACCOUNTS_ART.skyRays} style={styles.rays} />
          <Image source={ACCOUNTS_ART.skySun} style={styles.sun} />
          <Image source={ACCOUNTS_ART.skySunRim} style={styles.sunRim} />
        </View>
        <View style={styles.dateRow}>
          <View style={styles.when}>
            <Text style={T.displayLarge}>{visit.date}</Text>
            <Text style={T.bodyStrong}>{visit.slot}</Text>
          </View>
          <View style={styles.badgeBox}>
            <View style={styles.badge}>
              <Image source={ACCOUNTS_ART.stateConfirmed} style={styles.icon20} />
            </View>
            <Text style={styles.badgeLabel} numberOfLines={1}>
              {visit.badge}
            </Text>
          </View>
        </View>
      </LinearGradient>
      <View style={styles.nextBottom}>
        <View style={styles.nextLeft}>
          <StatusWell glyph={visit.glyph} size={32} />
          <Text style={T.body}>{visit.statusLine}</Text>
        </View>
        <KindTag kind={visit.kind} />
      </View>
    </Pressable>
  );
}

function EmptyBookings({
  title,
  body,
  art,
  onBook,
  testID,
}: {
  title: string;
  body: string;
  art: (typeof ACCOUNTS_ART)['emptyFlower'];
  onBook: () => void;
  testID: string;
}) {
  const { bottom } = useSafeAreaInsets();
  return (
    <ScrollView
      // Centred in the space above the home indicator, as the frames draw it.
      contentContainerStyle={[styles.empty, { paddingBottom: 48 + bottom }]}
      testID={testID}
    >
      <Image source={art} style={styles.flower} />
      <View style={styles.emptyText}>
        <Text style={[T.title, styles.center]}>{title}</Text>
        <Text style={[T.body, styles.secondary, styles.center]}>{body}</Text>
      </View>
      <PrimaryButton
        label="Book Now"
        onPress={onBook}
        // `2192:4504` / `2192:4534` draw Book Now with Elevation/1, over the Button's hairline.
        style={[styles.emptyButton, SHADOW_1]}
        testID={`${testID}-book`}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.base },
  flex: { flex: 1 },
  hidden: { display: 'none' },
  header: {
    backgroundColor: C.subtle,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 16,
    overflow: 'hidden',
  },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon24: { width: 24, height: 24 },
  icon20: { width: 20, height: 20 },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 9999,
    backgroundColor: C.base,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 9999,
  },
  tabActive: { backgroundColor: C.brand },
  count: { paddingHorizontal: 8, borderRadius: 9999 },
  countActive: { backgroundColor: C.base },
  countIdle: { backgroundColor: C.subtle },
  secondary: { color: C.textSecondary },
  underline: { textDecorationLine: 'underline' },
  body: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 48, gap: 16 },
  listHeader: { gap: 16 },
  sectionLabel: {
    fontFamily: T.microStrong.fontFamily,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.6,
    color: C.textSecondary,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.base,
  },
  dimmed: { opacity: 0.7 },
  well: { alignItems: 'center', justifyContent: 'center' },
  wellOpen: { backgroundColor: C.border },
  wellClosed: { backgroundColor: C.subtle },
  info: { flex: 1, gap: 8 },
  infoTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  shrink: { flexShrink: 1 },
  tag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9999 },
  tagRecurring: { backgroundColor: C.border },
  tagOneTime: { backgroundColor: '#ECFF9B' },
  nextCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.base,
    overflow: 'hidden',
  },
  banner: { borderRadius: 24, padding: 16, overflow: 'hidden' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  glow: { position: 'absolute', right: -100, top: -144, width: 280, height: 280 },
  rays: { position: 'absolute', right: -31.76, top: -78, width: 145.76, height: 148 },
  sun: { position: 'absolute', right: 0, top: -44, width: 80, height: 80 },
  sunRim: { position: 'absolute', right: -6, top: -50, width: 92, height: 92 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  when: { flex: 1, gap: 4 },
  badgeBox: {
    minWidth: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    fontFamily: T.button.fontFamily,
    fontSize: 10,
    letterSpacing: 0.6,
    color: C.text,
  },
  nextBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  nextLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  pagingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  /** `2192:4504` / `2192:4534` — the body centred in the space under the header, padded 0/32/48. */
  empty: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  flower: { width: 180, height: 170 },
  emptyText: { gap: 8, alignSelf: 'stretch', marginTop: 28 },
  center: { textAlign: 'center' },
  emptyButton: { alignSelf: 'stretch', marginTop: 28 },
});
