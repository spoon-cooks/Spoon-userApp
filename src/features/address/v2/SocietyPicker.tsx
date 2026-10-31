import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { DataState } from '@core/data';
import { Icon } from '@ui';

import type { SocietyDto } from '../api';

import { FieldInput } from './components';
import { C, T } from './theme';

/** The society part of the Apartment form; `AddressDetailsForm` carries the same four fields. */
export interface SocietyChoice {
  readonly society: string;
  readonly societyId: string | null;
  readonly societyOthers: boolean;
  readonly customSociety: string;
  /** A society saved as plain text before the list existed: kept as it is until changed here. */
  readonly societyLegacy: boolean;
}

/**
 * Where `needle` starts a word of `name` (its first letter or one after a space), or -1. A society
 * is matched by the start of any of its words: "pres" finds Prestige Shantiniketan, "lake" Prestige
 * Lakeside Habitat — never the middle of a word.
 */
export function wordMatchAt(name: string, needle: string): number {
  if (needle === '') return -1;
  const lower = name.toLowerCase();
  for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, at + 1)) {
    if (at === 0 || /\s/u.test(lower.charAt(at - 1))) return at;
  }
  return -1;
}

/**
 * Society / Building name — Figma `2825:4858` (searching), `2825:4996` (selected), `2825:5126`
 * (no match) and `2829:4973` (Others), built to dev note `2075:11932`:
 *
 * - a required single-select dropdown with type-to-filter, its options the backend's active
 *   societies at the pin (`GET /v1/societies`), each shown by its display name only. The list
 *   appears only once a first letter is typed, and then holds EVERY society with a word starting
 *   with what was typed (owner, 31 Oct 2026); an empty field shows no list;
 * - tapping an option IS the selection: it fills the field and closes the list. There is no tick
 *   or confirm step, and the list closes only through a selection;
 * - "Others" is always the last row and the fallback when nothing matches (no "no result" error).
 *   Picking it reveals a required "Enter society / building name *";
 * - reopening and picking another option hides the custom input; X clears the filter text;
 * - loading shows a spinner row; an error or offline shows a retry message, Others still offered.
 */
export function SocietyPicker({
  value,
  societies,
  onRetry,
  onChange,
  testID,
}: {
  readonly value: SocietyChoice;
  readonly societies: DataState<readonly SocietyDto[]>;
  readonly onRetry: () => void;
  readonly onChange: (patch: Partial<SocietyChoice>) => void;
  readonly testID: string;
}) {
  const chosen = value.societyId !== null || value.societyOthers || value.societyLegacy;
  // Unchosen (a new address, or one saved before the list existed) starts open on its old text.
  const [open, setOpen] = useState(!chosen);
  const [query, setQuery] = useState(chosen ? '' : value.society);

  const pick = (patch: Partial<SocietyChoice>) => {
    // The search box unmounts while it still has focus; closing the keyboard first lets the
    // screen's keyboard avoider drop its padding, which otherwise stayed as a blank gap on Android
    // after a society was picked (device test, 31 Oct 2026).
    Keyboard.dismiss();
    onChange(patch);
    setOpen(false);
    setQuery('');
  };

  if (!open) {
    return (
      <>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Society: ${value.societyOthers ? 'Others' : value.society}. Change`}
          style={({ pressed }) => [styles.field, pressed && styles.pressed]}
          testID={testID}
        >
          <Text style={styles.value} numberOfLines={1}>
            {value.societyOthers ? 'Others' : value.society}
          </Text>
          <Icon name="down" size={20} color="textPrimary" />
        </Pressable>
        {value.societyOthers ? (
          <FieldInput
            value={value.customSociety}
            onChangeText={(customSociety) => onChange({ customSociety })}
            placeholder="Enter society / building name *"
            maxLength={200}
            testID={`${testID}-custom`}
          />
        ) : null}
      </>
    );
  }

  const needle = query.trim().toLowerCase();
  const matches =
    societies.status === 'ready'
      ? societies.data.filter((society) => wordMatchAt(society.name, needle) >= 0)
      : [];

  return (
    <View>
      <View style={[styles.field, styles.fieldOpen]}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Society / Building name *"
          placeholderTextColor={C.textSecondary}
          autoFocus={chosen}
          style={styles.input}
          accessibilityLabel="Society / Building name"
          testID={`${testID}-input`}
        />
        {query === '' ? null : (
          <Pressable
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel="Clear"
            hitSlop={8}
            testID={`${testID}-clear`}
          >
            <Icon name="close" size={20} color="textPrimary" />
          </Pressable>
        )}
      </View>
      {needle === '' ? null : (
        <View style={styles.list} testID={`${testID}-list`}>
          {societies.status === 'loading' ? (
            <View style={styles.row} testID={`${testID}-loading`}>
              <ActivityIndicator color={C.text} />
            </View>
          ) : null}
          {societies.status === 'error' ? (
            <Pressable
              onPress={onRetry}
              accessibilityRole="button"
              style={styles.row}
              testID={`${testID}-retry`}
            >
              <Text style={styles.muted}>Couldn’t load societies. Tap to retry.</Text>
            </Pressable>
          ) : null}
          {matches.map((society, index) => (
            <Pressable
              key={society.id}
              onPress={() =>
                pick({
                  societyId: society.id,
                  society: society.name,
                  societyOthers: false,
                  customSociety: '',
                  societyLegacy: false,
                })
              }
              accessibilityRole="button"
              accessibilityLabel={society.name}
              style={({ pressed }) => [styles.row, (pressed || index === 0) && styles.rowActive]}
              testID={`${testID}-option-${society.id}`}
            >
              <Highlighted text={society.name} needle={needle} />
            </Pressable>
          ))}
          {matches.length > 0 || societies.status !== 'ready' ? <View style={styles.rule} /> : null}
          <Pressable
            onPress={() =>
              pick({ societyId: null, society: '', societyOthers: true, societyLegacy: false })
            }
            accessibilityRole="button"
            accessibilityLabel="Others"
            style={({ pressed }) => [
              styles.row,
              (pressed || matches.length === 0) && styles.rowActive,
            ]}
            testID={`${testID}-others`}
          >
            <Text style={styles.strong}>Others</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** The name with the typed part in bold, as `2825:4858` draws it. */
function Highlighted({ text, needle }: { readonly text: string; readonly needle: string }) {
  const at = wordMatchAt(text, needle);
  if (at < 0) return <Text style={styles.body}>{text}</Text>;
  return (
    <Text style={styles.body}>
      {text.slice(0, at)}
      <Text style={styles.strong}>{text.slice(at, at + needle.length)}</Text>
      {text.slice(at + needle.length)}
    </Text>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.base,
  },
  fieldOpen: { borderColor: C.borderStrong },
  input: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    paddingVertical: 0,
    paddingHorizontal: 0,
    fontFamily: T.body.fontFamily,
    fontSize: T.body.fontSize,
    color: C.text,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  value: { ...T.body, color: C.text, flex: 1 },
  list: {
    marginTop: 4,
    padding: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.base,
  },
  row: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8 },
  rowActive: { backgroundColor: C.subtle },
  rule: { height: 1, backgroundColor: C.border, marginVertical: 4, marginHorizontal: 6 },
  body: { ...T.body, color: C.text },
  strong: { ...T.bodyStrong, color: C.text },
  muted: { ...T.body, color: C.textSecondary },
  pressed: { opacity: 0.85 },
});
