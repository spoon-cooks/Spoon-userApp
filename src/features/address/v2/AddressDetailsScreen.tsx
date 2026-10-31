import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ImageSourcePropType, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DataState } from '@core/data';

import type { AddressPropertyType, SocietyDto } from '../api';

import { ADDRESS_ART } from './art';
import { AddIcon, FieldInput, GradientHeader, PrimaryButton } from './components';
import { SocietyPicker } from './SocietyPicker';
import type { AddressLabelKind } from './components';
import { C, GRADIENT, T } from './theme';

/**
 * Address details — Figma `1870:2485` (Apartment), `1870:2576` (Independent house) and
 * `1870:2672` (Edit address), built to dev notes `2075:11932`, `2075:11941` and `2075:11945`.
 *
 *   header   the flow's gradient header: "Address details", or "Edit address" when editing
 *   pinned   `1870:2495` — `#FFF7CC` r24 p12: the 64pt mini map, "PINNED LOCATION", the place and
 *            its line, and a white "Edit" pill that goes back to the map keeping everything typed
 *   steps    four numbered steps on a dashed rail (visual only, not tappable):
 *            1 Property type — two tiles, the selected one on the yellow gradient
 *            2 Flat / House details — the type's own fields
 *            3 Save it as — Home · Parents · Friends · Others; Others adds a name (max 20)
 *            4 Someone else receiving the service? — an optional, expandable receiver
 *   dock     "Save address" (editing: "Save changes" over a "Remove this address" link)
 *
 * Rules (dev notes): the property type swaps the fields and Floor carries over; `*` marks a
 * required field; labels are single-select and may repeat across addresses; the receiver is
 * optional and its X collapses it AND clears it; Save is disabled until the required fields and a
 * label are filled — and, when editing, until something has changed.
 */
export interface AddressDetailsForm {
  readonly propertyType: AddressPropertyType;
  /** Flat no. (apartment) or House/ Plot no. (house). */
  readonly number: string;
  readonly floor: string;
  readonly tower: string;
  /**
   * The society field (R-AREA-18 to 20): `society` is the name it shows (the picked entry's, or
   * the filter text while choosing); `societyId` the picked entry; `societyOthers` that "Others"
   * was picked, with the typed name in `customSociety`. A society is chosen only through the list.
   */
  readonly society: string;
  readonly societyId: string | null;
  readonly societyOthers: boolean;
  readonly customSociety: string;
  /** Saved as plain text before the list existed; valid as it is until the field is changed. */
  readonly societyLegacy: boolean;
  readonly lane: string;
  readonly landmark: string;
  readonly label: AddressLabelKind | null;
  /** The Others name. */
  readonly otherName: string;
  readonly receiverOpen: boolean;
  readonly receiverName: string;
  /** National digits only; the +91 is fixed. */
  readonly receiverPhone: string;
}

export const EMPTY_DETAILS_FORM: AddressDetailsForm = {
  propertyType: 'apartment',
  number: '',
  floor: '',
  tower: '',
  society: '',
  societyId: null,
  societyOthers: false,
  customSociety: '',
  societyLegacy: false,
  lane: '',
  landmark: '',
  label: null,
  otherName: '',
  receiverOpen: false,
  receiverName: '',
  receiverPhone: '',
};

const OTHER_NAME_MAX = 20;
/** The form's text fields, in reading order. */
type FieldKey =
  | 'number'
  | 'floor'
  | 'tower'
  | 'society'
  | 'lane'
  | 'landmark'
  | 'otherName'
  | 'receiverName'
  | 'receiverPhone';

const PHONE_DIGITS = 10;

/** Whether Save may proceed: required fields, a label, and a complete receiver if one is open. */
export function isDetailsFormComplete(form: AddressDetailsForm): boolean {
  const filled = (value: string) => value.trim().length > 0;
  const fields =
    form.propertyType === 'apartment'
      ? filled(form.number) &&
        (form.societyId !== null ||
          (form.societyOthers && filled(form.customSociety)) ||
          (form.societyLegacy && filled(form.society)))
      : filled(form.number);
  const label = form.label !== null && (form.label !== 'others' || filled(form.otherName));
  const receiver =
    !form.receiverOpen ||
    (form.receiverName.trim() === '' && form.receiverPhone === '') ||
    (filled(form.receiverName) && /^[6-9]\d{9}$/.test(form.receiverPhone));
  return fields && label && receiver;
}

/** What Save actually sends, for comparing an edit with what it started from. */
export function detailsFingerprint(form: AddressDetailsForm): string {
  const apartment = form.propertyType === 'apartment';
  const receiver = form.receiverOpen ? [form.receiverName.trim(), form.receiverPhone] : ['', ''];
  return JSON.stringify([
    form.propertyType,
    form.number.trim(),
    form.floor.trim(),
    apartment ? form.tower.trim() : '',
    apartment ? (form.societyId ?? '') : '',
    apartment && form.societyOthers ? form.customSociety.trim() : '',
    apartment ? '' : form.lane.trim(),
    apartment ? '' : form.landmark.trim(),
    form.label,
    form.label === 'others' ? form.otherName.trim() : '',
    ...receiver,
  ]);
}

export interface AddressDetailsScreenProps {
  readonly mode: 'add' | 'edit';
  readonly initial: AddressDetailsForm;
  readonly pinned: { readonly title: string; readonly line: string };
  readonly onBack: () => void;
  /** Back to the map. The host keeps the form alive underneath, so nothing typed is lost. */
  readonly onEditPin: () => void;
  readonly onSave: (form: AddressDetailsForm) => void;
  readonly onRemove?: () => void;
  readonly saving: boolean;
  /** Whether a saveable point exists yet. */
  readonly locationReady: boolean;
  /** Editing: the pin itself was moved on the map, which is a change even with the form as it was. */
  readonly pinMoved?: boolean;
  /** The society dropdown's options at the pin (`GET /v1/societies`), and its retry. */
  readonly societies?: DataState<readonly SocietyDto[]>;
  readonly onRetrySocieties?: () => void;
  readonly testID?: string;
}

export function AddressDetailsScreen({
  mode,
  initial,
  pinned,
  onBack,
  onEditPin,
  onSave,
  onRemove,
  saving,
  locationReady,
  pinMoved = false,
  societies = { status: 'ready', data: [] },
  onRetrySocieties = () => undefined,
  testID = 'address-details',
}: AddressDetailsScreenProps) {
  const { bottom } = useSafeAreaInsets();
  const [form, setForm] = useState(initial);
  const [initialPrint] = useState(() => detailsFingerprint(initial));
  const set = (patch: Partial<AddressDetailsForm>) =>
    setForm((current) => ({ ...current, ...patch }));

  const changed = mode === 'add' || pinMoved || detailsFingerprint(form) !== initialPrint;
  const ready = locationReady && isDetailsFormComplete(form) && changed;
  const apartment = form.propertyType === 'apartment';

  /*
   * The keyboard's return key walks the form: Next on every field moves to the one below it in
   * reading order, and the last field present says Done. Only the fields on screen take part
   * (apartment or house, "Save as" only for Others, the receiver only while it is open).
   */
  const numberRef = useRef<TextInput>(null);
  const floorRef = useRef<TextInput>(null);
  const towerRef = useRef<TextInput>(null);
  const societyRef = useRef<TextInput>(null);
  const laneRef = useRef<TextInput>(null);
  const landmarkRef = useRef<TextInput>(null);
  const otherNameRef = useRef<TextInput>(null);
  const receiverNameRef = useRef<TextInput>(null);
  const receiverPhoneRef = useRef<TextInput>(null);
  const order: FieldKey[] = [
    'number',
    'floor',
    ...(form.propertyType === 'apartment' ? (['tower'] as const) : (['lane', 'landmark'] as const)),
    ...(form.label === 'others' ? (['otherName'] as const) : []),
    ...(form.receiverOpen ? (['receiverName', 'receiverPhone'] as const) : []),
  ];
  // The return key's handler, so the refs are only read on a key press, never while rendering.
  const focusNext = (key: FieldKey) => {
    const next = order[order.indexOf(key) + 1];
    const refs: Record<FieldKey, RefObject<TextInput | null>> = {
      number: numberRef,
      floor: floorRef,
      tower: towerRef,
      society: societyRef,
      lane: laneRef,
      landmark: landmarkRef,
      otherName: otherNameRef,
      receiverName: receiverNameRef,
      receiverPhone: receiverPhoneRef,
    };
    if (next !== undefined) refs[next].current?.focus();
  };
  const returnKey = (key: FieldKey) => {
    const last = order.indexOf(key) === order.length - 1;
    return {
      returnKeyType: last ? ('done' as const) : ('next' as const),
      submitBehavior: last ? ('blurAndSubmit' as const) : ('submit' as const),
    };
  };

  /*
   * The receiver card is the last block of the form. When one of its fields takes focus the form
   * scrolls to its end, so the WHOLE card — both fields, not just the one being typed in — sits
   * above the keyboard. Once on focus (the keyboard is already up when moving between the two
   * fields) and again when the keyboard finishes opening (the form has only then shrunk).
   */
  const scrollRef = useRef<ScrollView>(null);
  const receiverFocused = useRef(false);
  const toReceiver = () => scrollRef.current?.scrollToEnd({ animated: true });
  const showReceiver = () => {
    receiverFocused.current = true;
    setTimeout(toReceiver, 50);
  };
  const receiverOpening = useRef(false);
  const openReceiver = () => {
    receiverOpening.current = true;
    set({ receiverOpen: true });
  };
  const leaveReceiver = () => {
    receiverFocused.current = false;
  };

  /*
   * The society search box: while it is in use the form scrolls it to the top of what the
   * keyboard leaves visible, so neither the box nor the matches under it are cut off by the
   * keyboard and the Save dock (device test, 31 Oct 2026). On focus, when the keyboard finishes
   * opening, and as the typed text changes the list.
   */
  const scrollY = useRef(0);
  const scrollTop = useRef(0);
  const societyBox = useRef<View>(null);
  const societySearching = useRef(false);
  const toSociety = () =>
    societyBox.current?.measureInWindow((_x, y) => {
      const target = scrollY.current + y - (scrollTop.current + SOCIETY_TOP_GAP);
      scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: true });
    });
  const onSocietySearching = (searching: boolean) => {
    societySearching.current = searching;
    if (searching) setTimeout(toSociety, 50);
  };

  useEffect(() => {
    // After a beat: the keyboard avoider pads the form on this same event, and scrolling before
    // that layout lands scrolls a form that has not shrunk yet.
    const shown = Keyboard.addListener('keyboardDidShow', () => {
      if (receiverFocused.current) setTimeout(toReceiver, 150);
      if (societySearching.current) setTimeout(toSociety, 150);
    });
    return () => shown.remove();
  }, []);

  return (
    // `padding` on Android too: the app is edge-to-edge, so the window no longer resizes for the
    // keyboard (`adjustResize` is a no-op) and the receiver fields sat behind it. As OtpScreen.
    <KeyboardAvoidingView style={styles.screen} behavior="padding" testID={testID}>
      <GradientHeader
        title={mode === 'edit' ? 'Edit address' : 'Address details'}
        onBack={onBack}
        testID={`${testID}-header`}
      />
      <ScrollView
        ref={scrollRef}
        // The receiver card just opened: once its fields have laid out, bring the whole card into
        // view rather than leaving them below the fold.
        onContentSizeChange={() => {
          if (!receiverOpening.current) return;
          receiverOpening.current = false;
          toReceiver();
        }}
        onScroll={(event) => {
          scrollY.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        onLayout={(event) => {
          scrollTop.current = event.nativeEvent.layout.y;
        }}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pinned} testID={`${testID}-pinned`}>
          <Image source={ADDRESS_ART.miniMap} style={styles.miniMap} />
          <View style={styles.pinnedText}>
            <Text style={styles.overline}>PINNED LOCATION</Text>
            <Text style={styles.bodyStrong}>{pinned.title}</Text>
            {pinned.line === '' ? null : <Text style={styles.caption}>{pinned.line}</Text>}
          </View>
          <Pressable
            onPress={onEditPin}
            accessibilityRole="button"
            accessibilityLabel="Edit pinned location"
            hitSlop={6}
            style={({ pressed }) => [styles.editPill, pressed && styles.pressed]}
            testID={`${testID}-edit-pin`}
          >
            <Image source={ADDRESS_ART.edit} style={styles.icon18} />
            <Text style={styles.captionStrong}>Edit</Text>
          </Pressable>
        </View>

        <View>
          <Step number={1} title="Property type">
            <View style={styles.tiles}>
              <PropertyTile
                icon={ADDRESS_ART.apartment}
                label="Apartment/ Society"
                selected={apartment}
                onPress={() => set({ propertyType: 'apartment' })}
                testID={`${testID}-type-apartment`}
              />
              <PropertyTile
                icon={ADDRESS_ART.home}
                label="Independent house"
                selected={!apartment}
                onPress={() => set({ propertyType: 'house' })}
                testID={`${testID}-type-house`}
              />
            </View>
          </Step>

          <Step number={2} title={apartment ? 'Flat details' : 'House details'}>
            <View style={styles.fields}>
              <View style={styles.fieldRow}>
                <FieldInput
                  value={form.number}
                  onChangeText={(number) => set({ number })}
                  placeholder={apartment ? 'Flat no. *' : 'House/ Plot no. *'}
                  style={styles.flex}
                  inputRef={numberRef}
                  inputProps={{
                    ...returnKey('number'),
                    onSubmitEditing: () => focusNext('number'),
                  }}
                  testID={`${testID}-number`}
                />
                <FieldInput
                  value={form.floor}
                  onChangeText={(floor) => set({ floor })}
                  placeholder="Floor"
                  style={styles.flex}
                  inputRef={floorRef}
                  inputProps={{
                    ...returnKey('floor'),
                    onSubmitEditing: () => focusNext('floor'),
                  }}
                  testID={`${testID}-floor`}
                />
              </View>
              {apartment ? (
                <>
                  <FieldInput
                    value={form.tower}
                    onChangeText={(tower) => set({ tower })}
                    placeholder="Tower / Block"
                    inputRef={towerRef}
                    inputProps={{
                      ...returnKey('tower'),
                      onSubmitEditing: () => focusNext('tower'),
                    }}
                    testID={`${testID}-tower`}
                  />
                  <View ref={societyBox} collapsable={false}>
                    <SocietyPicker
                      value={form}
                      societies={societies}
                      onRetry={onRetrySocieties}
                      onChange={set}
                      onSearching={onSocietySearching}
                      testID={`${testID}-society`}
                    />
                  </View>
                </>
              ) : (
                <>
                  <FieldInput
                    value={form.lane}
                    onChangeText={(lane) => set({ lane })}
                    placeholder="Street/ Lane"
                    inputRef={laneRef}
                    inputProps={{
                      ...returnKey('lane'),
                      onSubmitEditing: () => focusNext('lane'),
                    }}
                    testID={`${testID}-lane`}
                  />
                  <FieldInput
                    value={form.landmark}
                    onChangeText={(landmark) => set({ landmark })}
                    placeholder="Landmark (optional)"
                    inputRef={landmarkRef}
                    inputProps={{
                      ...returnKey('landmark'),
                      onSubmitEditing: () => focusNext('landmark'),
                    }}
                    testID={`${testID}-landmark`}
                  />
                </>
              )}
            </View>
          </Step>

          <Step number={3} title="Save it as">
            <View style={styles.chips}>
              {LABELS.map((option) => (
                <LabelChip
                  key={option.kind}
                  icon={option.icon}
                  label={option.label}
                  selected={form.label === option.kind}
                  onPress={() => set({ label: option.kind })}
                  testID={`${testID}-label-${option.kind}`}
                />
              ))}
            </View>
            {form.label === 'others' ? (
              <FieldInput
                value={form.otherName}
                onChangeText={(otherName) => set({ otherName })}
                placeholder="Save as *"
                maxLength={OTHER_NAME_MAX}
                inputRef={otherNameRef}
                inputProps={{
                  ...returnKey('otherName'),
                  onSubmitEditing: () => focusNext('otherName'),
                }}
                testID={`${testID}-other-name`}
              />
            ) : null}
          </Step>

          <Step number={4} title="Someone else receiving the service?" last>
            <View style={styles.receiver} testID={`${testID}-receiver`}>
              {/*
                Dev note `2075:11932`: tapping the row expands the receiver; once open, only the X
                collapses it and clears the values — the row itself no longer does anything.
              */}
              <Pressable
                onPress={form.receiverOpen ? undefined : openReceiver}
                disabled={form.receiverOpen}
                accessibilityRole={form.receiverOpen ? undefined : 'button'}
                accessibilityLabel={form.receiverOpen ? undefined : 'Add a receiver (optional)'}
                style={styles.receiverRow}
                testID={`${testID}-receiver-toggle`}
              >
                <View style={styles.receiverWell}>
                  <Image source={ADDRESS_ART.profile} style={styles.icon24} />
                </View>
                <View style={styles.receiverText}>
                  <Text style={styles.bodyStrong}>
                    {form.receiverOpen ? 'Receiver added' : 'Add a receiver (optional)'}
                  </Text>
                  <Text style={styles.caption}>
                    {form.receiverOpen
                      ? 'Helps the cook coordinate better reach without any confusion'
                      : 'So the cook can call them on arrival'}
                  </Text>
                </View>
                {form.receiverOpen ? (
                  <Pressable
                    onPress={() =>
                      set({ receiverOpen: false, receiverName: '', receiverPhone: '' })
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Remove receiver"
                    hitSlop={8}
                    style={[styles.toggleWell, styles.toggleClose]}
                    testID={`${testID}-receiver-remove`}
                  >
                    <Image source={ADDRESS_ART.close} style={styles.icon24} />
                  </Pressable>
                ) : (
                  <View style={[styles.toggleWell, styles.toggleAdd]}>
                    <AddIcon />
                  </View>
                )}
              </Pressable>
              {form.receiverOpen ? (
                <>
                  <FieldInput
                    value={form.receiverName}
                    onChangeText={(receiverName) => set({ receiverName })}
                    placeholder="Receiver’s name"
                    inputRef={receiverNameRef}
                    inputProps={{
                      ...returnKey('receiverName'),
                      onSubmitEditing: () => focusNext('receiverName'),
                      onFocus: showReceiver,
                      onBlur: leaveReceiver,
                    }}
                    testID={`${testID}-receiver-name`}
                  />
                  <FieldInput
                    value={form.receiverPhone}
                    onChangeText={(text) =>
                      set({ receiverPhone: text.replace(/\D/g, '').slice(-PHONE_DIGITS) })
                    }
                    placeholder="Receiver’s contact"
                    keyboardType="phone-pad"
                    leading={
                      form.receiverPhone === '' ? null : <Text style={styles.dial}>+91</Text>
                    }
                    inputRef={receiverPhoneRef}
                    inputProps={{
                      ...returnKey('receiverPhone'),
                      onSubmitEditing: () => focusNext('receiverPhone'),
                      textContentType: 'telephoneNumber',
                      onFocus: showReceiver,
                      onBlur: leaveReceiver,
                    }}
                    testID={`${testID}-receiver-phone`}
                  />
                </>
              ) : null}
            </View>
          </Step>
        </View>
      </ScrollView>

      {/* `1870:2672` — the dock is padded 16/16/8 above the home indicator. */}
      <View style={[styles.dock, { paddingBottom: 8 + bottom }]}>
        <PrimaryButton
          label={mode === 'edit' ? 'Save changes' : 'Save address'}
          onPress={() => onSave(form)}
          disabled={!ready}
          loading={saving}
          style={styles.save}
          testID={`${testID}-save`}
        />
        {mode === 'edit' && onRemove !== undefined ? (
          <Pressable
            onPress={onRemove}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.removeLink}
            testID={`${testID}-remove`}
          >
            <Text style={styles.captionStrong}>Remove this address</Text>
          </Pressable>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const LABELS: readonly {
  readonly kind: AddressLabelKind;
  readonly label: string;
  readonly icon: ImageSourcePropType;
}[] = [
  { kind: 'home', label: 'Home', icon: ADDRESS_ART.home },
  { kind: 'parents', label: 'Parents', icon: ADDRESS_ART.parents },
  { kind: 'friends', label: 'Friends', icon: ADDRESS_ART.friends },
  { kind: 'others', label: 'Others', icon: ADDRESS_ART.location },
];

/** A step on the rail: the 28pt flower badge with its number, the dashed connector, the content. */
function Step({
  number,
  title,
  last = false,
  children,
}: {
  number: number;
  title: string;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.rail}>
        <View style={styles.badge}>
          <Image source={ADDRESS_ART.stepFlower} style={styles.flower} />
          <Text style={styles.captionStrong}>{number}</Text>
        </View>
        {last ? null : <DashedRail />}
      </View>
      <View style={[styles.stepContent, !last && styles.stepContentPad]}>
        <Text style={styles.emphasis}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

/**
 * `1870:2516` — a 2pt `#FFD600` line, dashes 2 on / 5 off with round caps.
 *
 * The dashes are drawn OVER the rail's space, not in it: laid out in flow, the dashes for a tall
 * step (the society list open) held the step at that height after the list closed, leaving a
 * blank gap below the society field (device test, 31 Oct 2026). Now the rail only takes the
 * height the step's content gives it, and the dashes follow.
 */
function DashedRail() {
  const [height, setHeight] = useState(0);
  const count = Math.max(0, Math.floor((height + 3) / 7));
  return (
    <View
      style={styles.dashes}
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      pointerEvents="none"
    >
      <View style={styles.dashesDrawn}>
        {Array.from({ length: count }, (_, index) => (
          <View key={index} style={styles.dash} />
        ))}
      </View>
    </View>
  );
}

function PropertyTile({
  icon,
  label,
  selected,
  onPress,
  testID,
}: {
  icon: ImageSourcePropType;
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  const content = (
    <>
      <View style={styles.tileWell}>
        <Image source={icon} style={styles.icon24} />
      </View>
      {/* `1870:2710` — one line in the 104pt tile; iOS sets Livvic a hair wider than Figma. */}
      <Text
        style={styles.bodyStrong}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
        {label}
      </Text>
    </>
  );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={styles.flex}
      testID={testID}
    >
      {selected ? (
        <LinearGradient colors={GRADIENT.tile} style={styles.tile}>
          {content}
        </LinearGradient>
      ) : (
        <View style={[styles.tile, styles.tileIdle]}>{content}</View>
      )}
    </Pressable>
  );
}

function LabelChip({
  icon,
  label,
  selected,
  onPress,
  testID,
}: {
  icon: ImageSourcePropType;
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.chipSelected]}
      testID={testID}
    >
      <Image source={icon} style={styles.icon24} />
      <Text style={styles.chipLabel}>{label}</Text>
    </Pressable>
  );
}

/** Space kept above the society box when the form scrolls it up for the keyboard. */
const SOCIETY_TOP_GAP = 12;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.base },
  body: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 16, gap: 24 },
  flex: { flex: 1 },
  pinned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 24,
    backgroundColor: C.subtle,
  },
  miniMap: { width: 64, height: 64 },
  pinnedText: { flex: 1, minWidth: 0, gap: 4 },
  overline: { ...T.microStrong, color: C.textSecondary },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
    backgroundColor: C.base,
  },
  step: { flexDirection: 'row', gap: 12 },
  rail: { width: 28, alignItems: 'center', gap: 4 },
  badge: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  flower: { position: 'absolute', left: 0, top: 1.47, width: 28, height: 25.06 },
  dashes: { flex: 1, width: 2, overflow: 'hidden' },
  dashesDrawn: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    gap: 3,
  },
  dash: { width: 2, height: 4, borderRadius: 1, backgroundColor: C.brand },
  stepContent: { flex: 1, minWidth: 0, gap: 12 },
  stepContentPad: { paddingBottom: 24 },
  tiles: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  tile: { flex: 1, gap: 8, padding: 16, borderRadius: 24 },
  tileIdle: { backgroundColor: C.subtle },
  tileWell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fields: { gap: 16 },
  fieldRow: { flexDirection: 'row', gap: 12 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.base,
  },
  chipSelected: { backgroundColor: C.tint },
  chipLabel: { ...T.body, color: C.text, textAlign: 'center' },
  receiver: {
    gap: 16,
    padding: 16,
    borderRadius: 24,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.brand,
    backgroundColor: C.base,
  },
  receiverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  receiverWell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiverText: { flex: 1, minWidth: 0, gap: 4 },
  toggleWell: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleAdd: { backgroundColor: C.brand },
  toggleClose: { backgroundColor: C.subtle },
  dial: { ...T.body, color: C.text },
  dock: { paddingHorizontal: 16, paddingTop: 16, gap: 12, alignItems: 'center' },
  /** The dock centres the "Remove" link; the button itself spans the width. */
  save: { alignSelf: 'stretch' },
  /** `1870:2672` — the link sits in 4pt of padding above and below. */
  removeLink: { paddingVertical: 4 },
  emphasis: { ...T.emphasis, color: C.text },
  bodyStrong: { ...T.bodyStrong, color: C.text },
  caption: { ...T.caption, color: C.textSecondary },
  captionStrong: { ...T.captionStrong, color: C.text },
  icon18: { width: 18, height: 18 },
  icon24: { width: 24, height: 24 },
  pressed: { opacity: 0.85 },
});
