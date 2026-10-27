import { create } from 'zustand';

/**
 * The address being added, between the map step and the details step.
 *
 * ## Why this exists at all
 *
 * `53:31` produces a POINT and `60:655` collects the rest of the address, and they are two
 * routes. The coordinates have to survive that navigation, and they are exactly what §20 permits
 * a client to own: a temporary pre-submit selection. The moment `POST /v1/me/addresses` succeeds
 * the server owns the address and this store is cleared — nothing here is ever read back as
 * though it were the saved address.
 *
 * ## What is authoritative and what is not
 *
 * `latitude`/`longitude` come from the device and ARE what gets saved; they are the reason this
 * store exists. `serviceable` is the SERVER's verdict for that point, carried forward only so
 * the details step does not offer to save a point the map step already learned is refused — it
 * is not re-derived here, and the create call is refused by the backend regardless.
 *
 * The geocoded strings are a PREFILL. The customer edits them, and the backend stores what they
 * submit; an OS geocoder's wording has no authority over anyone's address.
 */
export interface AddressDraft {
  readonly latitude: number | null;
  readonly longitude: number | null;
  /** Optional Places identity; coordinates remain the serviceability authority. */
  readonly placeId: string | null;
  /** The server's `serviceable` verdict for this exact point. Null means "not asked yet". */
  readonly serviceable: boolean | null;
  readonly street: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly pincode: string | null;
  /**
   * The rest of the area the map read at the pin (R-AREA-15: the whole area is saved): the place
   * name it showed as the title, the locality ("HAL 2nd Stage") and the full address line.
   */
  readonly placeName: string | null;
  readonly locality: string | null;
  readonly areaLine: string | null;
  /**
   * WHICH address this point belongs to — `null` while adding, the record's id while editing.
   *
   * This store persists across an entire add/edit round trip and is cleared only on a successful
   * save, so a customer who abandons one attempt and later opens an unrelated address can find
   * this draft still holding a point from that earlier attempt. `editingId` is what lets a reader
   * tell "a point I just picked for THIS address" apart from "a leftover from something else
   * entirely" — see `useAddressDetailsData` in `features/address/data.ts`.
   */
  readonly editingId: string | null;
}

export const EMPTY_ADDRESS_DRAFT: AddressDraft = {
  latitude: null,
  longitude: null,
  placeId: null,
  serviceable: null,
  street: null,
  city: null,
  state: null,
  pincode: null,
  placeName: null,
  locality: null,
  areaLine: null,
  editingId: null,
};

interface AddressDraftState {
  readonly draft: AddressDraft;
  setPoint: (patch: Partial<AddressDraft>) => void;
  clear: () => void;
}

export const useAddressDraftStore = create<AddressDraftState>((set) => ({
  draft: EMPTY_ADDRESS_DRAFT,
  setPoint: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),
  clear: () => set({ draft: EMPTY_ADDRESS_DRAFT }),
}));

export const addressDraftStore = {
  get: (): AddressDraft => useAddressDraftStore.getState().draft,
  clear: (): void => useAddressDraftStore.getState().clear(),
};
