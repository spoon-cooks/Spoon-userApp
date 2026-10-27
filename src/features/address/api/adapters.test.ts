import { addressListFrom, addressWriteInputFrom, currentAddressOf } from './adapters';
import type { AddressDto } from './schemas';

/**
 * `addressWriteInputFrom` — a stored address, back into a write body.
 *
 * It exists for one caller: making an address the account default is a full `PUT`, so the record
 * has to be replayed whole. That makes these tests about LOSS, not about mapping — every field
 * the DTO carries and the write accepts has to survive the round trip, because anything dropped
 * here is silently erased from the customer's saved address the moment they tap a row.
 */

const SAVED: AddressDto = {
  id: 'addr-1',
  label: 'Home',
  flat: 'E102',
  tower: null,
  society: 'Purva Skydale',
  street: 'Silver County Road',
  pincode: '560102',
  city: 'Bengaluru',
  state: 'Karnataka',
  hub_id: 'hub-1',
  receiverName: 'Asha',
  receiverPhone: '+919876543210',
  isDefault: false,
  latitude: 12.902746,
  longitude: 77.648817,
  placeId: 'place-1',
  serviceability: {
    status: 'serviceable',
    reason: 'AVAILABLE',
    hub: { id: 'hub-1', name: 'Bengaluru Hub' },
  },
  propertyType: null,
  floor: null,
  lane: null,
  landmark: null,
  placeName: null,
  locality: null,
  areaLine: null,
  lastUsedAt: null,
};

describe('addressWriteInputFrom', () => {
  it('replays every field the write accepts, unchanged', () => {
    expect(addressWriteInputFrom(SAVED)).toEqual({
      label: 'Home',
      flat: 'E102',
      society: 'Purva Skydale',
      street: 'Silver County Road',
      pincode: '560102',
      city: 'Bengaluru',
      state: 'Karnataka',
      latitude: 12.902746,
      longitude: 77.648817,
      placeId: 'place-1',
      receiverName: 'Asha',
      receiverPhone: '+919876543210',
    });
  });

  it('OMITS nullable columns rather than sending null', () => {
    // The write schemas are `additionalProperties: false` with typed optionals, so an explicit
    // null is a 400 — `tower` is null on the fixture and must not appear at all.
    expect(addressWriteInputFrom(SAVED)).not.toHaveProperty('tower');

    const bare = addressWriteInputFrom({
      ...SAVED,
      flat: null,
      tower: null,
      society: null,
      city: null,
      state: null,
      placeId: null,
      receiverName: null,
      receiverPhone: null,
    });

    expect(bare).toEqual({
      label: 'Home',
      street: 'Silver County Road',
      pincode: '560102',
      latitude: 12.902746,
      longitude: 77.648817,
    });
  });

  it('omits placeId when the column is absent as well as when it is null', () => {
    const { placeId: _dropped, ...withoutPlaceId } = SAVED;
    expect(addressWriteInputFrom(withoutPlaceId)).not.toHaveProperty('placeId');
  });

  it('carries no isDefault of its own — the caller sets it', () => {
    // The mapper describes the address; it does not decide the account's default. `isDefault`
    // riding along here would make every ordinary edit silently promote its own row.
    expect(addressWriteInputFrom({ ...SAVED, isDefault: true })).not.toHaveProperty('isDefault');
  });

  it('keeps the stored receiver phone in E.164, which is what the backend accepted', () => {
    // `bodyOf` runs `toE164` on the way out and passes a number that already carries its country
    // code through untouched, so replaying the stored value is a no-op rather than a reformat.
    expect(addressWriteInputFrom(SAVED).receiverPhone).toBe('+919876543210');
  });
});

/**
 * `currentAddressOf` / `addressListFrom` — which row Saved addresses marks as selected.
 *
 * The marked row has to be the address bookings are actually made against. An account frequently
 * has NO stored default (the add flow never sends one; delete clears it without promoting another),
 * and bookings fall back to the oldest row — so the list must fall back the same way.
 */
describe('the selected address', () => {
  const first: AddressDto = { ...SAVED, id: 'addr-1' };
  const second: AddressDto = { ...SAVED, id: 'addr-2' };
  const third: AddressDto = { ...SAVED, id: 'addr-3' };
  const base = {
    title: '',
    addCtaLabel: '',
    sectionTitle: '',
    emptyTitle: '',
    emptyDescription: '',
    addresses: [],
  };
  const selectedIds = (addresses: readonly AddressDto[]) =>
    addressListFrom({ base, addresses })
      .addresses.filter((row) => row.selected === true)
      .map((row) => row.id);

  it('is the stored default when there is one', () => {
    const list = [first, { ...second, isDefault: true }, third];
    expect(currentAddressOf(list)?.id).toBe('addr-2');
    expect(selectedIds(list)).toEqual(['addr-2']);
  });

  it('falls back to the oldest row when no default is stored', () => {
    const list = [first, second, third];
    expect(currentAddressOf(list)?.id).toBe('addr-1');
    expect(selectedIds(list)).toEqual(['addr-1']);
  });

  it('moves to the next row once the selected one is deleted', () => {
    // DELETE clears `isDefault` and archives the row; the refetched list simply lacks it.
    expect(selectedIds([second, third])).toEqual(['addr-2']);
  });

  it('is nothing for an account with no addresses', () => {
    expect(currentAddressOf([])).toBeNull();
    expect(selectedIds([])).toEqual([]);
  });
});
