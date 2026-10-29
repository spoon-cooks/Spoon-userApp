import type { AddressDto, AddressWriteInput, ServiceabilityStatus } from './schemas';
import type { AddressListViewModel, SavedAddressViewModel } from '../types';

/**
 * Address DTO -> view model.
 *
 * The only judgement here is TYPOGRAPHIC: which of the seven address parts go on the single line
 * `6:700` draws, and in what order. That is presentation, and it is done once rather than in
 * every screen that shows an address.
 */

/**
 * `6:700` — the one-line address under the label.
 *
 * Parts are joined in postal order and empties are dropped, so a real address with no tower or
 * no city does not render "E102, , Silver County Road, , 560102". The line is deliberately NOT
 * truncated here: the designed card owns its own `numberOfLines`, and truncating twice loses
 * information the layout could have shown.
 */
export function addressLineOf(dto: AddressDto): string {
  return [dto.flat, dto.tower, dto.society, dto.street, dto.city, dto.pincode]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join(', ');
}

/**
 * The address the app is actually using — the one every booking read is made against.
 *
 * The server's default when there is one, otherwise the first row of the list, which
 * `GET /v1/me/addresses` orders by `created_at` (the oldest saved address).
 *
 * An account often HAS no default: the add flow never sends `isDefault`, so nothing is marked until
 * the customer taps a row, and `DELETE` clears the flag without promoting another (the backend
 * declines to invent a reassignment order). Bookings carried on regardless by falling back to
 * `list[0]` — but Saved addresses highlighted only `isDefault`, so the address in use showed no
 * selection at all, and deleting the selected one left the list with nothing marked. Every screen
 * now asks this one function, so the highlighted row and the booked address cannot disagree.
 */
export function currentAddressOf<T extends Pick<AddressDto, 'isDefault'>>(
  list: readonly T[],
): T | null {
  return list.find((address) => address.isDefault) ?? list[0] ?? null;
}

export function savedAddressFrom(
  dto: AddressDto,
  selected: boolean = dto.isDefault,
): SavedAddressViewModel {
  return {
    id: dto.id,
    label: dto.label,
    line: addressLineOf(dto),
    ...(selected ? { selected: true } : {}),
  };
}

export function addressListFrom(input: {
  readonly base: AddressListViewModel;
  readonly addresses: readonly AddressDto[];
}): AddressListViewModel {
  // The selection is the address in use, not only a stored default — see `currentAddressOf`.
  const currentId = currentAddressOf(input.addresses)?.id ?? null;
  return {
    ...input.base,
    addresses: input.addresses.map((dto) => savedAddressFrom(dto, dto.id === currentId)),
  };
}

/**
 * A saved address, back into the body `PUT /v1/me/addresses/:id` accepts.
 *
 * The inverse of `savedAddressFrom`: that maps a stored row to what a screen draws, this maps it
 * to what a write sends. It exists because the API has no endpoint that flips a single field —
 * making an address the account default is a FULL REPLACE, so the record has to be replayed
 * whole with `isDefault` alongside it.
 *
 * Nullable columns become OMITTED optionals rather than nulls: `bodyOf` drops `undefined`, and
 * the backend's write schemas are `additionalProperties: false` with typed optionals, so an
 * explicit null is rejected.
 *
 * `receiverPhone` is replayed exactly as stored. It is already E.164 — the value the backend
 * accepted when it was written — and `bodyOf`'s `toE164` passes a number that already carries
 * its country code through untouched.
 *
 * Nothing here is computed or guessed. Every field is the server's own value, read back from the
 * list the screen is already rendering, which is what keeps a "make this my address" tap from
 * quietly rewriting the address it was meant to leave alone.
 */
export function addressWriteInputFrom(dto: AddressDto): AddressWriteInput {
  return {
    label: dto.label,
    street: dto.street,
    pincode: dto.pincode,
    latitude: dto.latitude,
    longitude: dto.longitude,
    ...(dto.flat === null ? {} : { flat: dto.flat }),
    ...(dto.tower === null ? {} : { tower: dto.tower }),
    ...(dto.society === null ? {} : { society: dto.society }),
    ...(dto.city === null ? {} : { city: dto.city }),
    ...(dto.state === null ? {} : { state: dto.state }),
    ...(dto.placeId === null || dto.placeId === undefined ? {} : { placeId: dto.placeId }),
    ...(dto.receiverName === null ? {} : { receiverName: dto.receiverName }),
    ...(dto.receiverPhone === null ? {} : { receiverPhone: dto.receiverPhone }),
    // Replayed only when the server returned them. A backend that predates these fields never
    // returns them, so this never sends a key it would refuse; one that has them gets them back.
    ...(dto.propertyType === null ? {} : { propertyType: dto.propertyType }),
    ...(dto.floor === null ? {} : { floor: dto.floor }),
    ...(dto.lane === null ? {} : { lane: dto.lane }),
    ...(dto.landmark === null ? {} : { landmark: dto.landmark }),
    ...(dto.placeName === null ? {} : { placeName: dto.placeName }),
    ...(dto.locality === null ? {} : { locality: dto.locality }),
    ...(dto.areaLine === null ? {} : { areaLine: dto.areaLine }),
    ...(dto.societyId === null ? {} : { societyId: dto.societyId }),
    ...(dto.customSociety === null ? {} : { customSociety: dto.customSociety }),
  };
}

/**
 * The serviceability verdict as the map step's inline message (ruling R-4).
 *
 * `undefined` for a serviceable point means the screen draws no message at all, which is what
 * the frame does. The two refusal messages are distinct because they mean different things to a
 * customer: one is "not yet", the other is "not now".
 *
 * FIGMA_PENDING: this copy is not in the design file — `215:1472` supplies a headline for the
 * dedicated out-of-service SCREEN, but the inline message on the map step has no drawn text.
 * These are neutral placeholders and are expected to be replaced when copy lands.
 */
export function serviceabilityMessageFor(status: ServiceabilityStatus): string | undefined {
  switch (status) {
    case 'serviceable':
      return undefined;
    case 'temporarily_unavailable':
      return 'We are not serving this area right now. Please try again later.';
    case 'outside_service_area':
      return 'We do not serve this area yet.';
  }
}

/** Whether the "Check Availability & Save" CTA may proceed. The SERVER decided this. */
export function isServiceable(status: ServiceabilityStatus): boolean {
  return status === 'serviceable';
}
