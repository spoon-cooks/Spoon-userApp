import { useMemo } from 'react';
import type { Href } from 'expo-router';

import { ready } from '@core/data';
import { ADDRESS_STEPS_VERSION } from '@features/auth';
import type { ScreenQuery } from '@core/data';

import { EMPTY_ADDRESS_DRAFT, useAddressDraftStore } from '@core/store/addressDraftStore';

import { useAddressLocation } from './location/useAddressLocation';
import type { AddressLocationState } from './location/useAddressLocation';

import { addressListFrom, savedAddressFrom, useAddresses } from './api';
import type { AddressDto } from './api';

import {
  DEMO_ADDRESS_DETAILS,
  DEMO_ADDRESS_EDIT,
  DEMO_ADDRESS_LIST,
  DEMO_ADDRESS_LOCATION,
  DEMO_ADDRESS_OUT_OF_SERVICE,
} from '@/demo/fixtures/screens';
import type {
  AddressDetailsViewModel,
  AddressEditViewModel,
  AddressListViewModel,
  AddressLocationViewModel,
  AddressOutOfServiceViewModel,
} from './types';

/**
 * Saved addresses — `GET /v1/me/addresses`.
 *
 * `DEMO_ADDRESS_LIST` supplies the screen's STATIC COPY only: the title, the add-CTA label, the
 * section heading and the empty-state text. The rows themselves are the customer's real saved
 * addresses, and the "selected" row is the address bookings are made against — the server's
 * `isDefault`, or the oldest row when there is none (`currentAddressOf`). Nothing is written back:
 * the highlight shows what is in use, it does not store a default.
 *
 * The designed empty state is reached naturally: a real account with no addresses returns `[]`,
 * which renders `emptyTitle` / `emptyDescription` exactly as drawn.
 */
export function useSavedAddressesData(): ScreenQuery<AddressListViewModel> {
  const addresses = useAddresses();

  const state = useMemo(() => {
    if (addresses.state.status !== 'ready') return addresses.state;
    return ready(addressListFrom({ base: DEMO_ADDRESS_LIST, addresses: addresses.state.data }));
  }, [addresses.state]);

  return { state, refetch: addresses.refetch };
}

/** Shown while the device is still being asked where it is. */
const LOCATING_TITLE = 'Finding your location…';

/**
 * Shown under "Selected location" while the geocoder is still naming the point the map settled on.
 *
 * FIGMA_PENDING — `53:31` draws the resolved row in one state only, the resolved one. The row has
 * to say SOMETHING for the second or two after every pan, and the two alternatives are both
 * wrong: the previous point's address describes a place the pin has left, and the screen's static
 * copy is fixture text that would read as the customer's real address.
 */
const RESOLVING_LINE = 'Getting the address…';

/**
 * `60:655`'s Area row, for a confirmed point the geocoder could not name.
 *
 * FIGMA_PENDING — the frame draws the resolved state only. It asserts nothing about WHERE the
 * point is, which is the whole difference between this and the fixture line it replaced.
 */
const AREA_UNRESOLVED = 'Pinned on the map';

/**
 * The resolved row before there is ANY point to describe.
 *
 * FIGMA_PENDING — `53:31` draws the row in its resolved state only, so the screen's fixture
 * carries a transcribed sample address ("Street Name" / "Area 124, subarea 2 xyz, city efg").
 * That copy may never be shown: it is a real-looking address for a place the customer has never
 * been, and the one moment it used to appear was the worst possible one — a first-time customer,
 * straight out of OTP, who declined the location permission. They were met by a saved-looking
 * address they had never entered.
 *
 * It says what is true instead — there is no point yet — and the helper pill beside it already
 * names both ways to produce one (allow location, or search above).
 */
const NO_POINT_TITLE = 'No location selected';
const NO_POINT_LINE = 'Search above, or allow location, to place the pin';

/**
 * `60:655`'s Area row when the form has no point behind it at all.
 *
 * Same rule as `AREA_UNRESOLVED` and the same reason: the fixture's "Street name, Area 124,
 * subarea xyz, city" is artboard copy, and printing it in the Area row of a form the customer is
 * about to SAVE would put a place they have never been into their address book.
 */
const AREA_MISSING = 'No location pinned yet';

/**
 * The map step — the screen's static copy composed with the device's real position.
 *
 * `DEMO_ADDRESS_LOCATION` supplies COPY only: the title, the search label and placeholder, the
 * helper text and the CTA. The resolved row and the message are real — the point comes from the
 * device and the verdict from `POST /v1/serviceability/check`.
 *
 * CONFIGURATION_GAP (was FRONTEND_GAP: map/geocoding provider): without a Maps key the canvas and
 * the search field have no provider, so the map cannot be panned and search does not resolve. No
 * coordinate is faked to cover for that — `useAddressLocation` reports a failure instead.
 */
export function useAddressLocationData(): ScreenQuery<AddressLocationViewModel> & {
  readonly location: AddressLocationState;
} {
  const location = useAddressLocation();
  const base = DEMO_ADDRESS_LOCATION;

  const state = useMemo(() => {
    const resolved = location.geocoded;

    return ready<AddressLocationViewModel>({
      ...base,
      /**
       * "Finding your location…" belongs to the state where there is NOTHING to show — not to
       * every moment the hook is busy. Choosing a Places suggestion hands us the address up
       * front and then runs the serviceability check; blanking the row for that second would
       * replace the place the customer just picked with a spinner caption and put it back.
       */
      resolvedTitle:
        resolved?.title ??
        (location.locating
          ? LOCATING_TITLE
          : location.coordinates === null
            ? NO_POINT_TITLE
            : 'Selected location'),
      /**
       * The static line is the SCREEN'S copy and it is NEVER shown.
       *
       * It used to be the "no point yet" fallback, on the reading that fixture copy is harmless
       * while the screen has nothing of its own to say. It is not: `53:31` is the first screen
       * after OTP for a new account, and a customer who declines the location permission has no
       * point at all — so the fixture's "Street Name / Area 124, subarea 2 xyz, city efg" was
       * drawn in the resolved row, on the very first run, reading exactly like an address the app
       * already had for them. Nothing on the screen distinguished it from one.
       *
       * The same rule the settled case already followed now covers the empty case too: this row
       * describes the pin, and with no pin it says so.
       */
      resolvedLine:
        resolved?.line ??
        (location.locating
          ? ''
          : location.coordinates === null
            ? NO_POINT_LINE
            : location.resolving
              ? RESOLVING_LINE
              : ''),
      ...(location.message === undefined ? {} : { serviceabilityMessage: location.message }),
    });
  }, [
    base,
    location.coordinates,
    location.geocoded,
    location.locating,
    location.message,
    location.resolving,
  ]);

  return { state, refetch: location.locate, location };
}

/**
 * The details form's STATIC copy, with the resolved Area filled in from the point just pinned.
 *
 * The placeholders, the label chips and the CTA are design content. The AREA is not: it is the
 * OS geocoder's reading of the coordinates the map step obtained, and showing the fixture's
 * "Street name, Area 124, subarea xyz, city" beside a real pin would tell the customer their
 * address is somewhere it is not — the same class of defect as FE-6 on Home.
 *
 * The geocoded line is display only. What gets SAVED is the coordinate pair plus whatever the
 * customer types; no field is silently submitted on the strength of a geocoder's guess.
 */
export interface AddressDetailsData extends ScreenQuery<AddressDetailsViewModel> {
  /**
   * The coordinates already stored against the address being edited, or `null` when adding.
   *
   * `PUT /v1/me/addresses/:id` requires a point, so an edit that never revisited the map has to
   * send one. It sends THIS one - the address's own - because the alternative is the draft, which
   * belongs to whatever the customer last pinned and would silently relocate an address they were
   * only renaming.
   */
  readonly savedPoint: { readonly latitude: number; readonly longitude: number } | null;
  /** The saved Places identity, if the address originally came from Places search. */
  readonly savedPlaceId: string | null;
  /**
   * The AREA already stored against the address being edited, or `null` when adding.
   *
   * Exists for the same reason as `savedPoint`, and was missing for the same case it covers.
   * `PUT /v1/me/addresses/:id` requires `street` and `pincode`, and an edit that never revisited
   * the map has no draft to take them from — the draft only carries an area the map step wrote.
   * Without this the save sent `pincode: ''` and the backend refused the whole request with a
   * 400, so renaming an address, or correcting its flat number, could not be done at all.
   */
  readonly savedArea: {
    readonly street: string;
    readonly pincode: string;
    readonly city: string | null;
    readonly state: string | null;
  } | null;
  /**
   * Whether a CONFIRMED, server-approved coordinate exists for the address about to be saved.
   *
   * ADDING: the map step's draft, and only once `POST /v1/serviceability/check` answered
   * `serviceable` for that exact point — a draft carrying a point nobody checked, or one the
   * server refused, is not a location this form may save against.
   *
   * EDITING: the record's own saved point, which the backend already accepted. A customer who
   * walked back to `53:31` and re-confirmed supersedes it with the fresh draft.
   *
   * Nothing here evaluates coverage; it reads the verdict the map step recorded.
   */
  readonly locationReady: boolean;
}

export function useAddressDetailsData(addressId?: string | null): AddressDetailsData {
  const draft = useAddressDraftStore((store) => store.draft);
  /**
   * The form's STATIC COPY — placeholders, the label chips, the CTA. Design content, exactly like
   * `DEMO_ADDRESS_LIST` on the list seam, so it is `ready` unconditionally.
   *
   * It used to route through `useDevFixture`, which reports LOADING outside `__DEV__`. That made
   * `60:655` a permanent spinner in a release build — survivable while the screen was optional,
   * and NOT survivable now that task §4 sends every new customer straight to it: onboarding would
   * hang on the one screen that has to work. No endpoint is involved; there is nothing to wait for.
   */
  const copy: AddressDetailsViewModel = DEMO_ADDRESS_DETAILS;
  const editing = addressId !== null && addressId !== undefined && addressId !== '';
  /**
   * The normalised form of `addressId` (`null` while adding), used to check the draft's
   * `editingId` tag — see the `source` comment below and `locationReady`, its other consumer.
   */
  const currentEditingId = typeof addressId === 'string' && addressId !== '' ? addressId : null;
  // Only an EDIT needs the list; adding an address must not wait on a read it has no use for.
  const addresses = useAddresses({ enabled: editing });

  const existing = useMemo(() => {
    if (!editing || addresses.state.status !== 'ready') return null;
    return addresses.state.data.find((address) => address.id === addressId) ?? null;
  }, [editing, addresses.state, addressId]);

  const state = useMemo(() => {
    /**
     * An EDIT waits for its record.
     *
     * `60:655` is reached with the saved address already in its fields, and the fields are local
     * state seeded ONCE when the form mounts. Rendering the form before `GET /v1/me/addresses`
     * has answered therefore seeds it EMPTY and the arriving record never reaches the inputs —
     * the customer would be asked to retype an address they already gave us, and Confirm would
     * sit grey over a form that looks like it should be valid. The boundary's loader covers the
     * gap instead; adding an address waits for nothing, because there is nothing to wait for.
     */
    if (editing && addresses.state.status !== 'ready') return addresses.state;

    /**
     * The draft is trusted only when it is TAGGED for this exact address (`editingId` — null
     * while adding, the record's id while editing). Untagged or tagged for something else, it is
     * a leftover from an unrelated attempt (this store persists until a save succeeds, so an
     * abandoned add or a "Change area" on a different address can leave one behind) — the saved
     * record wins instead, or, adding with no matching draft, a blank form.
     */
    const source = draft.editingId === currentEditingId ? draft : (existing ?? EMPTY_ADDRESS_DRAFT);
    const area = [source.street, source.city, source.state, source.pincode]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join(', ');

    /**
     * The fixture's "Street name, Area 124, subarea xyz, city" is SCREEN COPY for an artboard,
     * and it may only be shown while the screen has no point of its own. Once the map step has
     * produced one, drawing it would tell the customer their address is somewhere it is not —
     * the same defect the map step's resolved row was corrected for.
     *
     * FIGMA_PENDING: `60:655` draws no state for a point the geocoder could not name, which is
     * reachable (a new layout, a rural point, a geocoder outage). The Area row says what it
     * honestly can, and "Change" is right beside it.
     */
    const pinned = source.latitude !== null && source.longitude !== null;
    const base =
      area !== ''
        ? { ...copy, areaValue: area }
        : // With NO point either — which is only reachable by deep-linking straight to the form —
          // the Area row still may not fall back to the fixture's sample address. It reports the
          // absence, and "Change" beside it is the way back to the map.
          { ...copy, areaValue: pinned ? AREA_UNRESOLVED : AREA_MISSING };

    // Adding: no record to prefill from, so every field starts empty as drawn.
    if (existing === null) return ready<AddressDetailsViewModel>(base);

    /**
     * EDITING (`18d` -> Edit -> `18b`, task §5). `60:655` is reached with the saved record
     * already in its fields so the customer REVIEWS and confirms rather than retyping an address
     * they already gave us.
     *
     * `label` is matched against the drawn chips; a label the customer typed themselves is not a
     * chip, so it lands in "Save as" instead of silently selecting the wrong chip.
     */
    const chip = base.labelOptions.find(
      (option) => option.label.toLowerCase() === existing.label.toLowerCase(),
    );

    /**
     * A custom name selects **Others** as well as filling the field.
     *
     * "Save as" is now drawn only under Others (V7 founder comment, task §6), so a saved address
     * called "Simran's pg" that set only `saveAsValue` would open with no chip selected AND the
     * field hidden — the customer's own label invisible, and Save about to overwrite it. Selecting
     * the chip is what makes the field it belongs to appear.
     */
    const others = base.labelOptions.find((option) => option.label.toLowerCase() === 'others');

    return ready<AddressDetailsViewModel>({
      ...base,
      ...(existing.flat === null ? {} : { flatValue: existing.flat }),
      ...(existing.society === null ? {} : { buildingValue: existing.society }),
      ...(chip === undefined
        ? {
            saveAsValue: existing.label,
            ...(others === undefined ? {} : { selectedLabelId: others.id }),
          }
        : { selectedLabelId: chip.id }),
      ...(existing.receiverName === null ? {} : { receiverName: existing.receiverName }),
      ...(existing.receiverPhone === null ? {} : { receiverPhone: existing.receiverPhone }),
    });
  }, [copy, draft, editing, existing, addresses.state, currentEditingId]);

  const savedPoint =
    existing === null ? null : { latitude: existing.latitude, longitude: existing.longitude };
  const savedPlaceId = existing?.placeId ?? null;
  const savedArea =
    existing === null
      ? null
      : {
          street: existing.street,
          pincode: existing.pincode,
          city: existing.city,
          state: existing.state,
        };

  return {
    state,
    savedPoint,
    savedPlaceId,
    savedArea,
    /**
     * The draft's verdict is the SERVER's, recorded by `53:31` on Confirm. `serviceable === true`
     * is required explicitly: `null` means the point was never checked and `false` means it was
     * refused, and neither may enable a write.
     *
     * Gated on `editingId` for the same reason `source` above is: without it, a leftover draft
     * from an unrelated attempt could enable the CTA here while `address/details.tsx`'s own
     * `editingId` check correctly refuses to use that same draft on Save — a button that looks
     * live but does nothing when pressed.
     */
    locationReady:
      (draft.editingId === currentEditingId &&
        draft.latitude !== null &&
        draft.longitude !== null &&
        draft.serviceable === true) ||
      savedPoint !== null,
    refetch: () => {
      if (editing) addresses.refetch();
    },
  };
}

/**
 * `215:1472`. The screen renders a server verdict — the client never decides that an address is
 * unserviceable, so this hook has no input and computes nothing.
 */
export function useAddressOutOfServiceData(): ScreenQuery<AddressOutOfServiceViewModel> {
  // Copy only — the client never decides that an address is unserviceable, and `215:1472` has no
  // payload behind it. Ready unconditionally, for the same reason as the details form above.
  return {
    state: ready<AddressOutOfServiceViewModel>(DEMO_ADDRESS_OUT_OF_SERVICE),
    refetch: () => undefined,
  };
}

/**
 * `228:1801` — the Edit / Delete sheet, for ONE saved address.
 *
 * `DEMO_ADDRESS_EDIT` supplies the sheet's STATIC COPY only — the title, the card heading and the
 * two action labels. The address block is the customer's real row, looked up by id in the list
 * that is already cached, so the sheet cannot show one address while the actions operate on
 * another. Returns `null` for an id that is not in the list (a stale selection after a delete),
 * which the route reads as "nothing to open".
 */
export function useAddressEditData(addressId: string | null): {
  readonly edit: AddressEditViewModel | null;
} {
  const addresses = useAddresses();

  const edit = useMemo(() => {
    if (addressId === null || addresses.state.status !== 'ready') return null;
    const found = addresses.state.data.find((address) => address.id === addressId);
    if (found === undefined) return null;
    return { ...DEMO_ADDRESS_EDIT, address: savedAddressFrom(found) };
  }, [addressId, addresses.state]);

  return { edit };
}

/**
 * Whether a freshly authenticated customer still has to give us somewhere to cook (task section 4).
 *
 * `GET /v1/me/addresses` is the whole test: an account with no saved address cannot book, cannot
 * be quoted and cannot be shown an ETA, because every one of those reads takes an `addressId`.
 * Landing such a customer on Home leaves them looking at a header that says "Add address" beside
 * two tiles whose CTA can never enable - which is the state section 4 rejects.
 *
 * FAIL-OPEN, deliberately. A read that ERRORS answers `satisfied`, not `required`: a customer
 * whose address list failed to load still has their addresses, and redirecting them into
 * onboarding on the strength of a network error would hide real data behind a form that would
 * create a duplicate. Home surfaces the read failure itself.
 *
 * ## What "usable" means, now that the server says
 *
 * It used to be read as "no address at all", because the only signal available was `hub_id`, and
 * a null there means "not matched to a hub when last saved" - operational bookkeeping, not a
 * verdict. Treating it as unusable would have trapped a customer in onboarding the day a hub was
 * reconfigured, so it was recorded as a backend question instead of enforced.
 *
 * `GET /v1/me/addresses` now carries an EVALUATED `serviceability` verdict per row, computed at
 * read time against the live hub, society and gate rows. So the question can be asked properly,
 * and the distinction the contract draws is the one that matters here:
 *
 *   `serviceable`             - Spoon can cook there now.
 *   `temporarily_unavailable` - a hub polygon covers it, but the hub is paused. "Expected to
 *                               work again", in the contract's own words.
 *   `outside_service_area`    - "not a matter of waiting".
 *
 * Only the third is a reason to demand another address. A paused hub must NOT push anybody into
 * the address flow: the address is fine, the pause is temporary, and the map would refuse every
 * new pin in the same area anyway - which is the original trap wearing a different hat. So the
 * gate asks whether ANY saved address is something other than `outside_service_area`.
 *
 * The rule is the contract's semantics read back, not a client policy: nothing here computes
 * coverage, ranks hubs or looks at `hub_id`. If the server's verdict changes, this changes with
 * it and no release is needed.
 */

/**
 * Whether a saved address is one the customer could still book against.
 *
 * `temporarily_unavailable` counts as usable - see the gate's note. Exported because the same
 * question is asked by tests, and a second copy of it would be the thing that drifts.
 */
export function isAddressUsable(address: AddressDto): boolean {
  return address.serviceability.status !== 'outside_service_area';
}

export type AddressGate = 'resolving' | 'required' | 'satisfied';

export function useAddressGate(options: { enabled?: boolean } = {}): AddressGate {
  /**
   * `enabled` exists for the BOOT gate, which asks this question at `/` before the session has
   * been proved. A `GET /v1/me/addresses` fired while signed out 401s and burns a refresh, so the
   * caller that does not yet know whether there is a session passes `false` and reads `resolving`.
   */
  const addresses = useAddresses({ enabled: options.enabled ?? true });

  if (options.enabled === false) return 'resolving';
  if (addresses.state.status === 'loading') return 'resolving';
  if (addresses.state.status !== 'ready') return 'satisfied';

  const saved = addresses.state.data;
  if (saved.length === 0) return 'required';
  return saved.some(isAddressUsable) ? 'satisfied' : 'required';
}

/* ------------------------------------------------------------------------ redoing old addresses */

/**
 * Whether a saved address was last saved by an older version of the address steps (owner, 31 Oct
 * 2026: every customer goes through the new steps again for every saved address). An address from
 * a V0 that does not record versions is never outdated.
 */
export function isAddressOutdated(address: AddressDto): boolean {
  return address.detailsVersion !== undefined && address.detailsVersion < ADDRESS_STEPS_VERSION;
}

/**
 * Old addresses this app run will not ask about again. V0 refuses any edit to an address an
 * upcoming booking uses (R-AREA-10), so such an address cannot be redone yet; asking again on the
 * next launch, once the booking is over, is what keeps the customer from being stuck on it now.
 */
const deferredRedos = new Set<string>();

export function deferAddressRedo(addressId: string): void {
  deferredRedos.add(addressId);
}

/** The first saved address still owed the current address steps, or `null` when none is. */
export function addressToRedo(addresses: readonly AddressDto[]): string | null {
  return (
    addresses.find((address) => isAddressOutdated(address) && !deferredRedos.has(address.id))?.id ??
    null
  );
}

/**
 * Where the customer must go to redo an old address: the edit flow for it, map first, with no way
 * back out (`onboarding=1`). Saving lands on Home, whose gate opens the next one, until none is
 * left. `resolving` while the list is read; `null` when nothing is owed.
 */
export function useAddressRedo(options: { enabled?: boolean } = {}): 'resolving' | Href | null {
  const addresses = useAddresses({ enabled: options.enabled ?? true });
  if (options.enabled === false) return 'resolving';
  if (addresses.state.status === 'loading') return 'resolving';
  if (addresses.state.status !== 'ready') return null;
  const id = addressToRedo(addresses.state.data);
  return id === null ? null : addressRedoHref(id);
}

export function addressRedoHref(addressId: string): Href {
  return `/address/location?onboarding=1&addressId=${encodeURIComponent(addressId)}` as Href;
}
