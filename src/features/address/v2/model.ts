import { currentAddressOf } from '../api';
import type { AddressDto } from '../api';

import type { AddressDetailsForm } from './AddressDetailsScreen';
import { labelKindOf } from './components';
import type { AddressLabelKind } from './components';

/**
 * How the Saved addresses list was opened.
 *
 * `choose` — from somewhere that is picking the address for a booking (Home's address switcher):
 *            tapping a row selects it.
 * `browse` — from the profile: tapping a row does nothing (dev note `2075:11950`).
 *
 * Either way the address in use carries "Current selection", as `1870:2770` draws it (product's
 * call, over the dev note's "Last used").
 */
export type SavedListContext = 'choose' | 'browse';

export interface SavedAddressItem {
  readonly id: string;
  readonly label: string;
  readonly kind: AddressLabelKind;
  /** One line; the card truncates it. */
  readonly line: string;
  readonly tag: 'Current selection' | null;
}

/**
 * The saved list as the redesign draws it (Figma `1870:2770`, dev note `2075:11950`).
 *
 * "Sorted by most recently used": newest order first by `lastUsedAt`. Addresses never ordered at
 * keep the server's saved order after them — the server deliberately returns saved order, and a
 * stable position is how a customer finds an address again.
 */
export function savedListFrom(
  addresses: readonly AddressDto[],
  // Kept so callers say how the list was opened; the tag no longer depends on it.
  _context: SavedListContext,
): readonly SavedAddressItem[] {
  const sorted = addresses
    .map((address, index) => ({ address, index }))
    .sort((a, b) => {
      const at = a.address.lastUsedAt;
      const bt = b.address.lastUsedAt;
      if (at !== null && bt !== null && at !== bt) return at < bt ? 1 : -1;
      if (at !== null && bt === null) return -1;
      if (at === null && bt !== null) return 1;
      return a.index - b.index;
    })
    .map(({ address }) => address);

  const tagged = currentAddressOf(addresses)?.id;

  return sorted.map((address) => ({
    id: address.id,
    label: address.label,
    kind: labelKindOf(address.label),
    line: cardLineOf(address),
    tag: address.id === tagged ? 'Current selection' : null,
  }));
}

/**
 * The card's address, everything the customer entered on Address details and in the order they
 * entered it (owner, 31 Oct 2026: Saved addresses shows the exact address saved), then where the
 * pin is: "Flat 402, Floor 4, B, Purva Skydale, Silver County Road, Bengaluru, 560037" for an
 * apartment and "No. 27, Floor 2, 5th Cross, Near Metro, Indiranagar, Bengaluru, 560038" for a
 * house. The number takes its "Flat" / "No." prefix and a bare floor number its "Floor"; every
 * other part is shown as typed. Empty parts are dropped; an address saved before property types
 * existed shows its number as it was typed.
 */
export function cardLineOf(address: AddressDto): string {
  const number = address.flat?.trim() ?? '';
  const numbered =
    number === ''
      ? ''
      : address.propertyType === 'apartment'
        ? `Flat ${number}`
        : address.propertyType === 'house'
          ? `No. ${number}`
          : number;
  const floor = address.floor?.trim() ?? '';
  const floored = /^\d+$/u.test(floor) ? `Floor ${floor}` : floor;
  return [
    numbered,
    floored,
    address.tower,
    address.society,
    address.lane,
    address.landmark,
    address.street,
    address.city,
    address.pincode,
  ]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join(', ');
}

/**
 * A saved address read back into the Details form (`1870:2672`, Edit address).
 *
 * An address saved before property types existed has none; it opens as an Apartment, the drawn
 * default, with its number, tower and society where they were. A label that is not one of the
 * three drawn chips selects Others with the label as its name, so a customer's own name is never
 * hidden behind an unselected chip. The receiver opens expanded only when one is saved.
 */
export function detailsFormFrom(address: AddressDto): AddressDetailsForm {
  const kind = labelKindOf(address.label);
  const phone = (address.receiverPhone ?? '').replace(/\D/g, '');
  const receiverPhone = phone.length > 10 && phone.startsWith('91') ? phone.slice(2) : phone;
  const receiverName = address.receiverName ?? '';
  return {
    propertyType: address.propertyType ?? 'apartment',
    number: address.flat ?? '',
    floor: address.floor ?? '',
    tower: address.tower ?? '',
    society: address.society ?? '',
    // A society saved before the list existed has neither: it must be picked again from the list.
    societyId: address.societyId,
    societyOthers: address.customSociety !== null,
    customSociety: address.customSociety ?? '',
    societyLegacy:
      address.societyId === null &&
      address.customSociety === null &&
      (address.society ?? '').trim() !== '',
    lane: address.lane ?? '',
    landmark: address.landmark ?? '',
    label: kind,
    otherName:
      kind === 'others' && address.label.trim().toLowerCase() !== 'others'
        ? address.label.trim()
        : '',
    receiverOpen: receiverName !== '' || receiverPhone !== '',
    receiverName,
    receiverPhone,
  };
}

const LABEL_WORDS = { home: 'Home', parents: 'Parents', friends: 'Friends' } as const;

/**
 * The form's own fields as the write sends them. Only the fields of the chosen property type carry
 * values — switching type and saving must not leave the other type's values on the record.
 */
export function detailsFieldsFrom(form: AddressDetailsForm): {
  readonly label: string;
  readonly propertyType: AddressDetailsForm['propertyType'];
  readonly flat?: string;
  readonly floor: string;
  readonly tower?: string;
  readonly society?: string;
  readonly societyId?: string;
  readonly customSociety?: string;
  readonly lane: string;
  readonly landmark: string;
  readonly receiverName?: string;
  readonly receiverPhone?: string;
} {
  const apartment = form.propertyType === 'apartment';
  const optional = <K extends string>(key: K, value: string, include = true) => {
    const trimmed = value.trim();
    return include && trimmed !== '' ? ({ [key]: trimmed } as Record<K, string>) : {};
  };
  const receiver =
    form.receiverOpen && form.receiverName.trim() !== '' && form.receiverPhone !== '';
  return {
    label:
      form.label === 'others' || form.label === null
        ? form.otherName.trim()
        : LABEL_WORDS[form.label],
    propertyType: form.propertyType,
    ...optional('flat', form.number),
    ...optional('tower', form.tower, apartment),
    // A listed society by id (the server names it); "Others" as its typed name, kept apart.
    ...(apartment && form.societyId !== null
      ? { society: form.society.trim(), societyId: form.societyId }
      : {}),
    ...(apartment && form.societyId === null && form.societyOthers
      ? { society: form.customSociety.trim(), customSociety: form.customSociety.trim() }
      : {}),
    // Saved before the list existed and left as it was: the text goes back unchanged.
    ...(apartment && form.societyId === null && !form.societyOthers && form.societyLegacy
      ? optional('society', form.society)
      : {}),
    /*
     * The redesign's own fields are ALWAYS sent, empty as `''`. `PUT` reads an absent key as
     * "unchanged" (so older builds replaying a row cannot erase them), which means clearing Floor,
     * or switching an address to an apartment, has to say so explicitly; the server stores `''`
     * as cleared.
     */
    floor: form.floor.trim(),
    lane: apartment ? '' : form.lane.trim(),
    landmark: apartment ? '' : form.landmark.trim(),
    ...(receiver
      ? { receiverName: form.receiverName.trim(), receiverPhone: `+91${form.receiverPhone}` }
      : {}),
  };
}

/**
 * The pinned-location card's two lines (`1870:2495`): the place — the first part of the pinned
 * street, as the map's pin tooltip names it — over the rest of the area.
 */
export function pinnedSummaryOf(area: {
  readonly street: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly pincode: string | null;
}): { readonly title: string; readonly line: string } {
  const streetParts = (area.street ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  const rest = [...streetParts.slice(1), area.city, area.state, area.pincode]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '');
  const title = streetParts[0] ?? rest.shift() ?? 'Pinned location';
  return { title, line: [...new Set(rest)].join(', ') };
}
