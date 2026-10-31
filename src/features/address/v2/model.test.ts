import type { AddressDto } from '../api';

import {
  EMPTY_DETAILS_FORM,
  detailsFingerprint,
  isDetailsFormComplete,
} from './AddressDetailsScreen';
import type { AddressDetailsForm } from './AddressDetailsScreen';
import {
  cardLineOf,
  detailsFieldsFrom,
  detailsFormFrom,
  pinnedSummaryOf,
  savedListFrom,
} from './model';

function address(overrides: Partial<AddressDto> = {}): AddressDto {
  return {
    id: 'addr-1',
    label: 'Home',
    flat: '402',
    tower: 'B',
    society: 'Purva Skydale',
    societyId: 'soc-purva',
    customSociety: null,
    street: 'Silver County Road',
    pincode: '560102',
    city: 'Bengaluru',
    state: 'Karnataka',
    hub_id: 'hub-1',
    receiverName: null,
    receiverPhone: null,
    isDefault: false,
    latitude: 12.9,
    longitude: 77.6,
    placeId: null,
    serviceability: { status: 'serviceable', reason: 'AVAILABLE' },
    propertyType: 'apartment',
    floor: null,
    lane: null,
    landmark: null,
    lastUsedAt: null,
    ...overrides,
  } as AddressDto;
}

const form = (overrides: Partial<AddressDetailsForm> = {}): AddressDetailsForm => ({
  ...EMPTY_DETAILS_FORM,
  ...overrides,
});

describe('savedListFrom (1870:2770, dev note 2075:11950)', () => {
  const list = [
    address({ id: 'a', label: 'Home', isDefault: true, lastUsedAt: '2026-09-01T10:00:00Z' }),
    address({ id: 'b', label: 'Parents', lastUsedAt: '2026-10-01T10:00:00Z' }),
    address({ id: 'c', label: 'Simran’s pg', lastUsedAt: null }),
    address({ id: 'd', label: 'Friends', lastUsedAt: null }),
  ];

  it('sorts by most recently used, keeping never-used addresses in saved order after them', () => {
    expect(savedListFrom(list, 'browse').map((item) => item.id)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('tags the address in use "Current selection", whether choosing or browsing', () => {
    for (const context of ['choose', 'browse'] as const) {
      const tags = savedListFrom(list, context).map((item) => [item.id, item.tag]);
      expect(tags).toEqual([
        ['b', null],
        ['a', 'Current selection'],
        ['c', null],
        ['d', null],
      ]);
    }
  });

  it('reads a label that is not a drawn chip as Others', () => {
    expect(savedListFrom(list, 'browse').find((item) => item.id === 'c')?.kind).toBe('others');
  });
});

describe('cardLineOf', () => {
  it('prefixes an apartment’s number with "Flat"', () => {
    expect(cardLineOf(address())).toBe(
      'Flat 402, B, Purva Skydale, Silver County Road, Bengaluru, 560102',
    );
  });

  it('prefixes a house’s number with "No." and includes its lane', () => {
    expect(
      cardLineOf(
        address({
          propertyType: 'house',
          flat: '27',
          tower: null,
          society: null,
          lane: '5th Cross',
          street: 'Indiranagar',
        }),
      ),
    ).toBe('No. 27, 5th Cross, Indiranagar, Bengaluru, 560102');
  });

  it('shows everything entered on Address details: floor, lane, landmark and pincode too', () => {
    expect(
      cardLineOf(
        address({
          propertyType: 'house',
          flat: '27',
          floor: '2',
          tower: null,
          society: null,
          lane: '5th Cross',
          landmark: 'Near Metro',
          street: 'Indiranagar',
        }),
      ),
    ).toBe('No. 27, Floor 2, 5th Cross, Near Metro, Indiranagar, Bengaluru, 560102');
    // A floor typed with words is kept as typed.
    expect(cardLineOf(address({ floor: 'Ground floor' }))).toBe(
      'Flat 402, Ground floor, B, Purva Skydale, Silver County Road, Bengaluru, 560102',
    );
  });

  it('shows the number as typed for an address saved before property types existed', () => {
    expect(cardLineOf(address({ propertyType: null, flat: 'E102', tower: null }))).toBe(
      'E102, Purva Skydale, Silver County Road, Bengaluru, 560102',
    );
  });
});

describe('detailsFormFrom — Edit opens prefilled (1870:2672)', () => {
  it('reads an apartment back into its fields', () => {
    expect(detailsFormFrom(address({ floor: '4' }))).toEqual(
      form({
        propertyType: 'apartment',
        number: '402',
        floor: '4',
        tower: 'B',
        society: 'Purva Skydale',
        societyId: 'soc-purva',
        label: 'home',
      }),
    );
  });

  it('reads a society typed under Others back as Others with its name', () => {
    const read = detailsFormFrom(
      address({ society: 'Green Acres', societyId: null, customSociety: 'Green Acres' }),
    );
    expect(read.societyId).toBeNull();
    expect(read.societyOthers).toBe(true);
    expect(read.customSociety).toBe('Green Acres');
    expect(read.societyLegacy).toBe(false);
  });

  it('marks a society saved before the list as legacy, neither listed nor Others', () => {
    const read = detailsFormFrom(address({ societyId: null, customSociety: null }));
    expect(read.societyId).toBeNull();
    expect(read.societyOthers).toBe(false);
    expect(read.societyLegacy).toBe(true);
  });

  it('opens an address saved before property types as an Apartment', () => {
    expect(detailsFormFrom(address({ propertyType: null })).propertyType).toBe('apartment');
  });

  it('selects Others with the customer’s own name for a custom label', () => {
    const read = detailsFormFrom(address({ label: 'Simran’s pg' }));
    expect(read.label).toBe('others');
    expect(read.otherName).toBe('Simran’s pg');
  });

  it('opens the receiver with its national digits when one is saved', () => {
    const read = detailsFormFrom(address({ receiverName: 'Asha', receiverPhone: '+919876543210' }));
    expect(read.receiverOpen).toBe(true);
    expect(read.receiverPhone).toBe('9876543210');
  });
});

describe('detailsFieldsFrom — what Save sends', () => {
  it('sends an apartment’s own fields, its type and the chip’s word as the label', () => {
    expect(
      detailsFieldsFrom(
        form({
          number: ' 402 ',
          floor: '4',
          tower: 'B',
          society: 'Purva Skydale',
          societyId: 'soc-purva',
          lane: 'left over from a house',
          label: 'parents',
        }),
      ),
    ).toEqual({
      label: 'Parents',
      propertyType: 'apartment',
      flat: '402',
      floor: '4',
      tower: 'B',
      society: 'Purva Skydale',
      societyId: 'soc-purva',
      lane: '',
      landmark: '',
    });
  });

  it('sends a house’s own fields and not the apartment’s', () => {
    expect(
      detailsFieldsFrom(
        form({
          propertyType: 'house',
          number: '27',
          floor: '1',
          tower: 'B',
          society: 'Purva',
          lane: '5th Cross',
          landmark: 'Near the temple',
          label: 'home',
        }),
      ),
    ).toEqual({
      label: 'Home',
      propertyType: 'house',
      flat: '27',
      floor: '1',
      lane: '5th Cross',
      landmark: 'Near the temple',
    });
  });

  it('sends an emptied Floor as cleared, not as absent', () => {
    expect(detailsFieldsFrom(form({ number: '402', floor: ' ' }))).toEqual(
      expect.objectContaining({ floor: '' }),
    );
  });

  it('labels Others with the typed name', () => {
    expect(detailsFieldsFrom(form({ label: 'others', otherName: ' Simran’s pg ' })).label).toBe(
      'Simran’s pg',
    );
  });

  it('sends the receiver in the +91 form the backend requires, and only while open', () => {
    const open = form({ receiverOpen: true, receiverName: 'Asha', receiverPhone: '9876543210' });
    expect(detailsFieldsFrom(open)).toEqual(
      expect.objectContaining({ receiverName: 'Asha', receiverPhone: '+919876543210' }),
    );
    expect(detailsFieldsFrom({ ...open, receiverOpen: false })).not.toHaveProperty('receiverPhone');
  });
});

describe('isDetailsFormComplete — Save’s gate (dev notes 2075:11932, 2075:11941)', () => {
  const apartment = form({
    number: '402',
    society: 'Purva',
    societyId: 'soc-purva',
    label: 'home',
  });

  it('needs Flat no. and Society for an apartment, and a label', () => {
    expect(isDetailsFormComplete(apartment)).toBe(true);
    expect(isDetailsFormComplete({ ...apartment, societyId: null })).toBe(false);
    expect(
      isDetailsFormComplete({
        ...apartment,
        societyId: null,
        societyOthers: true,
        customSociety: ' ',
      }),
    ).toBe(false);
    expect(
      isDetailsFormComplete({
        ...apartment,
        societyId: null,
        societyOthers: true,
        customSociety: 'Green Acres',
      }),
    ).toBe(true);
    expect(isDetailsFormComplete({ ...apartment, number: '' })).toBe(false);
    expect(isDetailsFormComplete({ ...apartment, label: null })).toBe(false);
  });

  it('needs only House/ Plot no. for a house', () => {
    expect(
      isDetailsFormComplete(form({ propertyType: 'house', number: '27', label: 'home' })),
    ).toBe(true);
  });

  it('needs a name when Others is chosen', () => {
    expect(isDetailsFormComplete({ ...apartment, label: 'others' })).toBe(false);
    expect(isDetailsFormComplete({ ...apartment, label: 'others', otherName: 'Pg' })).toBe(true);
  });

  it('accepts an open but empty receiver, and refuses a half-filled one', () => {
    expect(isDetailsFormComplete({ ...apartment, receiverOpen: true })).toBe(true);
    expect(isDetailsFormComplete({ ...apartment, receiverOpen: true, receiverName: 'Asha' })).toBe(
      false,
    );
    expect(
      isDetailsFormComplete({
        ...apartment,
        receiverOpen: true,
        receiverName: 'Asha',
        receiverPhone: '9876543210',
      }),
    ).toBe(true);
  });
});

describe('detailsFingerprint — Edit’s "only when changed"', () => {
  const start = form({ number: '402', society: 'Purva', label: 'home' });

  it('ignores whitespace and the other type’s leftovers', () => {
    expect(detailsFingerprint({ ...start, number: ' 402 ', lane: 'typed then abandoned' })).toBe(
      detailsFingerprint(start),
    );
  });

  it('changes with any field that is sent', () => {
    expect(detailsFingerprint({ ...start, floor: '2' })).not.toBe(detailsFingerprint(start));
    expect(detailsFingerprint({ ...start, label: 'friends' })).not.toBe(detailsFingerprint(start));
  });
});

describe('pinnedSummaryOf (1870:2495)', () => {
  it('names the place by the first part of the street, over the rest of the area', () => {
    expect(
      pinnedSummaryOf({
        street: '100 Feet Road, HAL 2nd Stage',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560038',
      }),
    ).toEqual({ title: '100 Feet Road', line: 'HAL 2nd Stage, Bengaluru, Karnataka, 560038' });
  });

  it('falls back to the city when there is no street', () => {
    expect(pinnedSummaryOf({ street: '', city: 'Bengaluru', state: null, pincode: null })).toEqual({
      title: 'Bengaluru',
      line: '',
    });
  });
});
