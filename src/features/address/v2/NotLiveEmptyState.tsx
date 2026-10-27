import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { ADDRESS_ART } from './art';
import { C, T } from './theme';

export interface NotLiveEmptyStateProps {
  /** The area of the customer's last refused place ("Indiranagar"); null when unnamed. */
  readonly locality: string | null;
  /** Where Spoon is live, from the serviceability check on that place. */
  readonly liveAreas: readonly string[];
  /** Customers waiting at that pincode, the customer included; null when unknown. */
  readonly waiting: number | null;
  readonly notify: 'idle' | 'pending' | 'joined';
  readonly onNotify: () => void;
  readonly testID: string;
}

/** "HSR Layout & Haralur". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

/**
 * Saved addresses · Empty (area not live) — Figma `2355:6094`, dev note `2355:14298`: shown when
 * the customer has no saved address and their last captured place is outside every live hub.
 * Area name, live hubs and the waiting count come from that place's serviceability check and the
 * waitlist state, the same data as Home's inactive-pincode variant. "Notify me" is the same
 * idempotent waitlist call as Home; once joined it reads "On the list" and is disabled.
 */
export function NotLiveEmptyState({
  locality,
  liveAreas,
  waiting,
  notify,
  onNotify,
  testID,
}: NotLiveEmptyStateProps) {
  const area = locality ?? 'Your area';
  const live = joinNames(liveAreas);
  const neighbours = waiting === null ? null : Math.max(waiting - 1, 0);
  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.mapCard} pointerEvents="none">
        <Image source={ADDRESS_ART.notLiveMap} style={styles.map} resizeMode="cover" />
        <View style={styles.soon}>
          <Text style={styles.soonText}>Coming soon!</Text>
        </View>
      </View>
      <Text style={styles.title}>No saved addresses yet</Text>
      <Text style={styles.body}>
        {live === ''
          ? 'Your area is on our list, and we’re growing one neighbourhood at a time.'
          : `Spoon is live in ${live} right now. Your area is on our list, and we’re growing one neighbourhood at a time.`}
      </Text>
      <View style={styles.row}>
        <Image source={ADDRESS_ART.locationFill} style={styles.pin} />
        <View style={styles.rowText}>
          <Text style={styles.strong}>{`${area} · Not live yet`}</Text>
          {neighbours === null ? null : (
            <Text style={styles.caption}>{`You + ${neighbours} neighbours waiting`}</Text>
          )}
        </View>
        <Pressable
          onPress={onNotify}
          disabled={notify !== 'idle'}
          accessibilityRole="button"
          accessibilityState={{ disabled: notify !== 'idle' }}
          style={({ pressed }) => [
            styles.notify,
            notify === 'joined' && styles.notifyJoined,
            pressed && styles.pressed,
          ]}
          testID={`${testID}-notify`}
        >
          {notify === 'pending' ? (
            <ActivityIndicator color={C.text} />
          ) : (
            <Text style={styles.notifyText}>
              {notify === 'joined' ? 'On the list' : 'Notify me'}
            </Text>
          )}
        </Pressable>
      </View>
      {live === '' ? null : (
        <View style={styles.family}>
          <Text style={styles.strong}>Booking for family?</Text>
          <Text style={styles.caption}>
            {`Add your parents’ or friends’ address in ${live} and book a cook for them.`}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  mapCard: {
    height: 186,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.subtle,
  },
  map: { width: '100%', height: '100%' },
  soon: {
    position: 'absolute',
    left: 14,
    top: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: C.text,
    transform: [{ rotate: '-6deg' }],
  },
  soonText: { ...T.emphasis, color: C.brand },
  title: { ...T.heading, color: C.text, textAlign: 'center' },
  body: { ...T.body, color: C.textSecondary, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: C.subtle,
  },
  pin: { width: 24, height: 24 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  notify: {
    minWidth: 104,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.brand,
  },
  notifyJoined: { backgroundColor: C.surfaceDisabled },
  notifyText: { ...T.button, color: C.text },
  family: {
    gap: 4,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.border,
  },
  strong: { ...T.bodyStrong, color: C.text },
  caption: { ...T.caption, color: C.textSecondary },
  pressed: { opacity: 0.85 },
});
