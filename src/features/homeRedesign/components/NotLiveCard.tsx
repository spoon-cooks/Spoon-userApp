import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { ART } from '../assets';
import { waitlistProgress } from '../state/waitlist';
import type { LiveHub, Waitlist } from '../types';
import { C, F, SHADOW_PILL } from '../theme';

export type NotifyState = 'idle' | 'pending' | 'joined';

export interface NotLiveCardProps {
  /** The customer's real pincode — "You · 5600XX" and the meter note. */
  readonly pincode: string;
  readonly liveHubs: readonly LiveHub[];
  readonly waitlist: Waitlist;
  readonly notifyState: NotifyState;
  readonly onPressNotify: () => void;
  readonly onPressShare: () => void;
}

/** "HSR Layout & Haralur"; `or` gives "HSR Layout or Haralur". */
function joinNames(names: readonly string[], last = '&'): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} ${last} ${names[names.length - 1]}`;
}

/**
 * `1307:1501` "Not live card" — replaces the booking section outside the service area. There is
 * no booking path here: the card converts to the waitlist and to referrals instead.
 *
 * The map is decorative and its pins are static (HSR Layout, Haralur) — not tappable. The avatars
 * are generic initials, never real neighbours.
 */
export function NotLiveCard({
  pincode,
  liveHubs,
  waitlist,
  notifyState,
  onPressNotify,
  onPressShare,
}: NotLiveCardProps) {
  const names = liveHubs.map((hub) => hub.name);
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.map} pointerEvents="none">
          <Image source={ART.mapArt} style={styles.mapArt} resizeMode="stretch" />
          <Image source={ART.pinHsr} style={[styles.pin, { left: 82, top: 86 }]} />
          <Image source={ART.pinHsr} style={[styles.pin, { left: 166, top: 140 }]} />
          <MapLabel left={39} top={64} live text="HSR Layout · Live" />
          <MapLabel left={135} top={118} live text="Haralur · Live" />
          <View style={[styles.cookBadge, SHADOW_PILL]}>
            <Image source={ART.cookVisit} style={styles.cookIcon} />
          </View>
          <View style={[styles.youPin, SHADOW_PILL]}>
            <Image source={ART.locationFill} style={styles.youIcon} />
          </View>
          <View style={[styles.you, SHADOW_PILL]}>
            {/* One line, `simple` breaking: Android measured the pill a hair narrow and hid the
                pincode on a second line ("You ·"). */}
            <Text style={styles.youText} numberOfLines={1} textBreakStrategy="simple">
              {`You · ${pincode}`}
            </Text>
          </View>
          {/* `1307:6206` — rotated −6° and centred in its 133 × 49.4 bounding box. */}
          <View style={styles.stickerBox}>
            <View style={styles.sticker}>
              <Text style={styles.stickerText}>Coming soon!</Text>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.titles}>
            <Text style={styles.eyebrow}>NOT LIVE IN YOUR AREA YET</Text>
            <Text style={styles.title}>We’re cooking our way to your neighbourhood</Text>
            <Text style={styles.sub}>
              {`Spoon is live in ${joinNames(names)} and growing one neighbourhood at a time. Till we reach you, scroll on to see how it works.`}
            </Text>
          </View>

          {/* The others waiting in this pincode (`GET /v1/me/waitlist`); hidden while nobody else is. */}
          {waitlist.countForPincode === null ? null : (
            <View style={styles.meter}>
              <View style={styles.waiting}>
                <View style={styles.avatars}>
                  <Avatar letter="A" color="#FFD6DB" overlap />
                  <Avatar letter="R" color="#D4F5E3" overlap />
                  <Avatar letter="S" color="#D6EDFF" />
                </View>
                <Text style={styles.waitingText}>
                  {waitlist.countForPincode === 1
                    ? '1 neighbour near you is waiting'
                    : `${waitlist.countForPincode} neighbours near you are waiting`}
                </Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${waitlistProgress(waitlist) * 100}%` }]} />
              </View>
              <Text style={styles.meterNote}>
                {`Every share and notify brings Spoon closer to ${pincode}`}
              </Text>
            </View>
          )}

          <View style={styles.notify}>
            <Image source={ART.bell} style={styles.bell} />
            <View style={styles.notifyText}>
              <Text style={styles.notifyTitle}>Be the first to know</Text>
              <Text style={styles.notifyBody}>We’ll ping you the day we launch here</Text>
            </View>
            {notifyState === 'joined' ? (
              <View
                accessibilityRole="button"
                accessibilityState={{ disabled: true }}
                style={[styles.notifyButton, styles.notifyButtonDone]}
              >
                <Text style={[styles.notifyButtonLabel, styles.notifyButtonLabelDone]}>
                  You’re on the list
                </Text>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ busy: notifyState === 'pending' }}
                disabled={notifyState === 'pending'}
                onPress={onPressNotify}
                style={styles.notifyButton}
              >
                <Text
                  style={[
                    styles.notifyButtonLabel,
                    notifyState === 'pending' ? styles.hidden : null,
                  ]}
                >
                  Notify me
                </Text>
                {notifyState === 'pending' ? (
                  <ActivityIndicator color={C.text} style={styles.notifySpinner} />
                ) : null}
              </Pressable>
            )}
          </View>

          <Image source={ART.divider} style={styles.divider} resizeMode="stretch" />

          <View style={styles.share}>
            <Text style={styles.shareText}>
              {`Know someone in ${joinNames(names, 'or')}? Send Spoon their way!`}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share Spoon on WhatsApp"
              onPress={onPressShare}
            >
              <Image source={ART.whatsapp} style={styles.whatsapp} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function MapLabel({
  left,
  top,
  text,
  live,
}: {
  left: number;
  top: number;
  text: string;
  live?: boolean;
}) {
  return (
    <View style={[styles.label, SHADOW_PILL, { left, top }]}>
      {live ? <Image source={ART.liveDot} style={styles.liveDot} /> : null}
      <Text style={styles.labelText}>{text}</Text>
    </View>
  );
}

function Avatar({ letter, color, overlap }: { letter: string; color: string; overlap?: boolean }) {
  return (
    <View
      style={[styles.avatar, { backgroundColor: color }, overlap ? styles.avatarOverlap : null]}
    >
      <Text style={styles.avatarText}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, width: '100%' },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.soft,
    backgroundColor: C.base,
    overflow: 'hidden',
  },
  map: { height: 188, backgroundColor: C.softer },
  mapArt: { position: 'absolute', left: 0, top: 0, width: 370, height: 188 },
  pin: { position: 'absolute', width: 20, height: 20 },
  label: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: C.base,
  },
  liveDot: { width: 6, height: 6 },
  labelText: { fontFamily: F.semibold, fontSize: 10, lineHeight: 14, color: C.text },
  cookBadge: {
    position: 'absolute',
    left: 176,
    top: 35,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: C.base,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cookIcon: { width: 20, height: 20 },
  youPin: {
    position: 'absolute',
    right: 368 - 282 - 40,
    top: 70,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  youIcon: { width: 24, height: 24 },
  you: {
    position: 'absolute',
    right: 368 - 264 - 77,
    top: 114,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: C.text,
  },
  youText: { fontFamily: F.semibold, fontSize: 10, lineHeight: 14, color: C.base },
  stickerBox: {
    position: 'absolute',
    left: 14,
    top: 6.41,
    width: 133.05,
    height: 49.39,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sticker: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: C.text,
    transform: [{ rotate: '-6deg' }],
  },
  stickerText: { fontFamily: F.bold, fontSize: 16, lineHeight: 24, color: C.brand },
  content: { gap: 20, padding: 20 },
  titles: { gap: 4 },
  eyebrow: {
    fontFamily: F.semibold,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1,
    color: C.textSecondary,
  },
  title: { fontFamily: F.bold, fontSize: 20, lineHeight: 28, color: C.text },
  sub: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.textSecondary },
  meter: {
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: C.softer,
  },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatars: { flexDirection: 'row' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: C.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOverlap: { marginRight: -8 },
  avatarText: { fontFamily: F.semibold, fontSize: 10, lineHeight: 14, color: C.text },
  waitingText: { flex: 1, fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
  track: { height: 8, borderRadius: 4, backgroundColor: C.base },
  fill: { height: 8, borderRadius: 4, backgroundColor: C.brand },
  meterNote: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.textSecondary },
  notify: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bell: { width: 40, height: 40 },
  notifyText: { flex: 1, gap: 2 },
  notifyTitle: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
  notifyBody: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.textSecondary },
  notifyButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 9999,
    backgroundColor: C.brand,
  },
  notifyButtonDone: { backgroundColor: C.surfaceDisabled, paddingHorizontal: 12 },
  notifyButtonLabelDone: { fontFamily: F.semibold, fontSize: 14, color: C.textSecondary },
  notifySpinner: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  hidden: { opacity: 0 },
  notifyButtonLabel: { fontFamily: F.bold, fontSize: 16, lineHeight: 24, color: C.text },
  divider: { width: '100%', height: 1 },
  share: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shareText: { flex: 1, fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
  whatsapp: { width: 48, height: 48 },
});
