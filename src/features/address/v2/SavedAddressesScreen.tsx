import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ADDRESS_ART } from './art';
import { AddIcon, GradientHeader, LabelWell, OutlineButton, PrimaryButton } from './components';
import type { SavedAddressItem } from './model';
import { NotLiveEmptyState } from './NotLiveEmptyState';
import type { NotLiveEmptyStateProps } from './NotLiveEmptyState';
import { AddressToast } from '@ui/v2/Toast';
import type { ToastNotice } from '@ui/v2/Toast';
import { C, GRADIENT, SHADOW_1, SHADOW_2, SHADOW_3, SHADOW_HAIRLINE, T } from './theme';
import { BlurredScrim } from '@ui/v2/Backdrop';

/**
 * Saved addresses — Figma `1870:2770`, with the Remove sheet from `1870:2857`, built to dev notes
 * `2075:11950` (Saved addresses) and `2075:11957` (Remove address).
 *
 *   header  the flow's gradient header, "Saved addresses"
 *   add     `1870:2780` — `#FFF3A6` → `#FFD600` card, r24, Elevation/1, px 12 / py 8, 12pt gap:
 *           a 48pt white circle with the plus, Emphasis label, a 32pt white well with a chevron
 *   title   `1870:2788` — "Your addresses", Emphasis
 *   cards   `1870:2792` — white, r24, a 1.5pt hairline shadow, px 12 / py 14: a 40pt label well,
 *           the label (Emphasis) and its tag, the address on ONE line; a 32pt kebab at the right
 *   menu    `1870:2849` — 160 wide, r14, p6, Elevation/2; 40pt rows "Edit" and "Remove"
 *
 * Behaviour (dev notes):
 *   - "Add a new address" opens the map. With no addresses, only that banner shows.
 *   - Tapping a row makes it the current selection, from Home and the profile alike (owner,
 *     2026-10-14). A host that passes no `onSelect` gets rows that are not tappable.
 *   - The kebab opens a menu anchored to it, flipped upward near the bottom of the screen. One
 *     menu at a time; tapping outside closes it.
 *   - Remove opens a confirm sheet. "Keep" or a tap outside closes it. An address on an upcoming
 *     booking is refused by the server and the sheet says so; nothing is removed.
 */
export interface SavedAddressesScreenProps {
  readonly addresses: readonly SavedAddressItem[];
  readonly onBack: () => void;
  readonly onAdd: () => void;
  /** Makes the tapped address the current selection. Absent: rows are not tappable. */
  readonly onSelect?: (id: string) => void;
  readonly onEdit: (id: string) => void;
  /**
   * Removes the address. Resolves `'removed'`, or `'in_use'` when the server refuses because an
   * upcoming booking uses it, or `'failed'` for anything else.
   */
  readonly onRemove: (id: string) => Promise<'removed' | 'in_use' | 'failed'>;
  readonly notice?: ToastNotice | null;
  /**
   * With no saved address and a last captured place outside every live hub (`2355:6094`): the
   * area, live hubs, waiting count and Notify me. Absent: the empty list shows only the banner.
   */
  readonly notLive?: Omit<NotLiveEmptyStateProps, 'testID'> | null;
  readonly testID?: string;
}

/**
 * `1870:2849` — the menu's size. It opens OVER its kebab (`1870:2770`): top edge level with the
 * kebab's top, right edges aligned.
 */
const MENU_WIDTH = 160;
const MENU_HEIGHT = 6 + 40 + 2 + 40 + 6;

export function SavedAddressesScreen({
  addresses,
  onBack,
  onAdd,
  onSelect,
  onEdit,
  onRemove,
  notice = null,
  notLive = null,
  testID = 'saved-addresses',
}: SavedAddressesScreenProps) {
  const { bottom } = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [menu, setMenu] = useState<{
    readonly id: string;
    readonly right: number;
    readonly top: number;
  } | null>(null);
  const [removing, setRemoving] = useState<SavedAddressItem | null>(null);
  const kebabs = useRef(new Map<string, View | null>());

  const openMenu = (id: string) => {
    const node = kebabs.current.get(id);
    if (node === null || node === undefined) return;
    node.measureInWindow((x, y, width, height) => {
      // "Flips upward near the screen bottom": then its bottom edge sits level with the kebab's.
      const flip = y + MENU_HEIGHT > windowHeight - bottom - 16;
      setMenu({
        id,
        right: x + width,
        top: flip ? y + height - MENU_HEIGHT : y,
      });
    });
  };

  return (
    <View style={styles.screen} testID={testID}>
      <GradientHeader title="Saved addresses" onBack={onBack} testID={`${testID}-header`} />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: 24 + bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Add a new address"
          style={({ pressed }) => [pressed && styles.pressed]}
          testID={`${testID}-add`}
        >
          <LinearGradient
            colors={GRADIENT.action}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.addCard, SHADOW_1]}
          >
            <Text style={[styles.emphasis, styles.flex]}>Add a new address</Text>
            <View style={styles.addBadge}>
              <Image source={ADDRESS_ART.addCircle} style={styles.addCircle} />
              <AddIcon />
            </View>
          </LinearGradient>
        </Pressable>

        {addresses.length === 0 && notLive !== null ? (
          <NotLiveEmptyState {...notLive} testID={`${testID}-not-live`} />
        ) : null}
        {addresses.length === 0 ? null : (
          <>
            <Text style={styles.emphasis} accessibilityRole="header">
              Your addresses
            </Text>
            {addresses.map((address) => (
              <AddressCard
                key={address.id}
                address={address}
                menuOpen={menu?.id === address.id}
                onPress={onSelect === undefined ? undefined : () => onSelect(address.id)}
                onKebab={() => openMenu(address.id)}
                kebabRef={(node) => {
                  kebabs.current.set(address.id, node);
                }}
                testID={`${testID}-card-${address.id}`}
              />
            ))}
          </>
        )}
      </ScrollView>

      {/* The menu floats over the list; a tap anywhere outside closes it. */}
      <Modal
        visible={menu !== null}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setMenu(null)}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setMenu(null)}
          accessibilityLabel="Close menu"
          testID={`${testID}-menu-backdrop`}
        />
        {menu === null ? null : (
          <View
            style={[styles.menu, SHADOW_2, { top: menu.top, left: menu.right - MENU_WIDTH }]}
            testID={`${testID}-menu`}
          >
            <MenuItem
              icon={ADDRESS_ART.edit}
              label="Edit"
              onPress={() => {
                const id = menu.id;
                setMenu(null);
                onEdit(id);
              }}
              testID={`${testID}-menu-edit`}
            />
            <MenuItem
              icon={ADDRESS_ART.trash}
              label="Remove"
              onPress={() => {
                const target = addresses.find((address) => address.id === menu.id) ?? null;
                setMenu(null);
                setRemoving(target);
              }}
              testID={`${testID}-menu-remove`}
            />
          </View>
        )}
      </Modal>

      <RemoveAddressSheet
        address={removing}
        onClose={() => setRemoving(null)}
        onRemove={onRemove}
        testID={`${testID}-remove`}
      />

      <AddressToast notice={notice} />
    </View>
  );
}

function AddressCard({
  address,
  menuOpen,
  onPress,
  onKebab,
  kebabRef,
  testID,
}: {
  address: SavedAddressItem;
  menuOpen: boolean;
  onPress: (() => void) | undefined;
  onKebab: () => void;
  kebabRef: (node: View | null) => void;
  testID: string;
}) {
  const body = (
    <View style={styles.cardRow}>
      <LabelWell kind={address.kind} />
      <View style={styles.cardText}>
        <View style={styles.titleRow}>
          <Text style={styles.emphasis} numberOfLines={1}>
            {address.label}
          </Text>
          {address.tag === null ? null : (
            <View style={styles.tag} testID={`${testID}-tag`}>
              <Text style={styles.tagText}>{address.tag}</Text>
            </View>
          )}
        </View>
        <Text style={styles.line} numberOfLines={1}>
          {address.line}
        </Text>
      </View>
    </View>
  );
  return (
    <View style={[styles.card, SHADOW_HAIRLINE]}>
      {onPress === undefined ? (
        <View testID={testID}>{body}</View>
      ) : (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${address.label}, ${address.line}`}
          style={({ pressed }) => [pressed && styles.pressed]}
          testID={testID}
        >
          {body}
        </Pressable>
      )}
      <View ref={kebabRef} collapsable={false} style={styles.kebabSlot}>
        <Pressable
          onPress={onKebab}
          accessibilityRole="button"
          accessibilityLabel={`More actions for ${address.label}`}
          hitSlop={6}
          style={[styles.kebab, menuOpen && styles.kebabOpen]}
          testID={`${testID}-kebab`}
        >
          <Image source={ADDRESS_ART.more} style={styles.icon24} />
        </Pressable>
      </View>
    </View>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: number | object;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
      testID={testID}
    >
      <Image source={icon as never} style={styles.icon16} />
      <Text style={styles.captionStrong}>{label}</Text>
    </Pressable>
  );
}

/**
 * `1870:2949` — "Remove this address?" over the list. Keep is the primary action; Delete is the
 * monochrome destructive outline.
 */
export function RemoveAddressSheet({
  address,
  onClose,
  onRemove,
  testID,
}: {
  address: SavedAddressItem | null;
  onClose: () => void;
  onRemove: (id: string) => Promise<'removed' | 'in_use' | 'failed'>;
  testID: string;
}) {
  const { bottom } = useSafeAreaInsets();
  const visible = address !== null;
  const [shown, setShown] = useState(address);
  const [translateY] = useState(() => new Animated.Value(400));
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  if (address !== null && address !== shown) {
    setShown(address);
    setBlocked(null);
  }

  useEffect(() => {
    const animation = Animated.timing(translateY, {
      toValue: visible ? 0 : 400,
      duration: 220,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setShown(null);
    });
    return () => animation.stop();
  }, [visible, translateY]);

  if (shown === null) return null;

  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={close}>
      <View style={styles.scrim} accessibilityViewIsModal>
        <BlurredScrim dim={0.4} />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityLabel="Close"
          testID={`${testID}-backdrop`}
        />
        <Animated.View
          style={[
            styles.sheet,
            SHADOW_3,
            { paddingBottom: Math.max(32, bottom + 8), transform: [{ translateY }] },
          ]}
          testID={testID}
        >
          <View style={styles.grabber} />
          <View style={styles.trashBadge}>
            <Image source={ADDRESS_ART.trashCircle} style={styles.trashCircle} />
            <Image source={ADDRESS_ART.trashGeneral} style={styles.icon28} />
          </View>
          <View style={styles.sheetTitle}>
            <Text style={styles.title} accessibilityRole="header">
              Remove this address?
            </Text>
            <Text style={styles.subtitle}>You can always add it again later.</Text>
          </View>
          <View style={styles.preview}>
            <LabelWell kind={shown.kind} />
            <View style={styles.cardText}>
              <Text style={styles.bodyStrong} numberOfLines={1}>
                {shown.label}
              </Text>
              <Text style={styles.line} numberOfLines={1}>
                {shown.line}
              </Text>
            </View>
          </View>
          {blocked === null ? null : (
            <Text
              style={styles.blocked}
              accessibilityLiveRegion="polite"
              testID={`${testID}-blocked`}
            >
              {blocked}
            </Text>
          )}
          <View style={styles.actions}>
            <PrimaryButton
              label="Keep"
              onPress={close}
              style={styles.flex}
              testID={`${testID}-keep`}
            />
            <OutlineButton
              label="Delete"
              loading={busy}
              style={styles.flex}
              onPress={() => {
                if (blocked !== null) return;
                setBusy(true);
                void onRemove(shown.id).then((outcome) => {
                  setBusy(false);
                  if (outcome === 'in_use') setBlocked('Used in an upcoming booking');
                  else if (outcome === 'failed')
                    setBlocked('Couldn’t remove this address. Try again.');
                  else onClose();
                });
              }}
              testID={`${testID}-delete`}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.base },
  body: { paddingHorizontal: 16, paddingTop: 24, gap: 16 },
  flex: { flex: 1 },
  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    /** `1870:2770` — 8/16. */
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
  },
  addBadge: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  addCircle: { position: 'absolute', width: 48, height: 48 },
  emphasis: { ...T.emphasis, color: C.text },
  card: {
    backgroundColor: C.base,
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 44 },
  cardText: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: {
    backgroundColor: C.positive,
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagText: { ...T.microStrong, color: C.text },
  line: { ...T.caption, color: C.textSecondary },
  /** `1870:2803` — 32pt at x 326 / y 19 inside the card: 12pt in from its right edge. */
  kebabSlot: { position: 'absolute', right: 12, top: 19 },
  kebab: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kebabOpen: { backgroundColor: C.tint },
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    backgroundColor: C.base,
    borderRadius: 14,
    padding: 6,
    gap: 2,
  },
  menuItem: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  menuItemPressed: { backgroundColor: C.subtle },
  captionStrong: { ...T.captionStrong, color: C.text },
  /** `1870:2857` — the scrim is `color/surface/inverse` at full strength, as drawn. */
  scrim: { flex: 1 },
  sheet: {
    marginTop: 'auto',
    backgroundColor: C.base,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 24,
    gap: 16,
    alignItems: 'center',
  },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border },
  trashBadge: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  trashCircle: { position: 'absolute', width: 80, height: 80 },
  sheetTitle: { alignItems: 'center', gap: 4 },
  title: { ...T.title, color: C.text },
  subtitle: { ...T.body, color: C.textSecondary },
  preview: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 14,
    paddingRight: 16,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: C.subtle,
  },
  bodyStrong: { ...T.bodyStrong, color: C.text },
  blocked: { ...T.captionStrong, color: C.text, textAlign: 'center' },
  actions: { alignSelf: 'stretch', flexDirection: 'row', gap: 12 },
  icon16: { width: 16, height: 16 },
  icon24: { width: 24, height: 24 },
  icon28: { width: 28, height: 28 },
  pressed: { opacity: 0.85 },
});
