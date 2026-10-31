import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';

import {
  AddressDetailsScreen,
  EMPTY_DETAILS_FORM,
  RemoveAddressSheet,
  addressCreateScope,
  cardLineOf,
  detailsFieldsFrom,
  detailsFormFrom,
  googleReverseGeocode,
  labelKindOf,
  pinnedSummaryOf,
  resolveAddressSavePoint,
  useAddressDetailsData,
  useAddresses,
  useCreateAddress,
  useDeleteAddress,
  useUpdateAddress,
  useSocieties,
  AddressToast,
} from '@features/address';
import type { AddressDetailsForm, AddressToastNotice, SavedAddressItem } from '@features/address';
import { useAddressDraftStore } from '@core/store/addressDraftStore';
import { getUserMessage, isAppError } from '@core/errors';
import { useNavigationGuard, useSafeBack } from '@core/navigation';
import { InfoDialog, QueryBoundary } from '@ui';

/**
 * Address details — Figma `1870:2485` / `1870:2576` (adding) and `1870:2672` (Edit address), for
 * BOTH adding and editing.
 *
 * With `?addressId=<id>` this is the edit destination of the saved list's kebab: the form opens
 * PREFILLED with the saved record and Save issues `PUT /v1/me/addresses/:id`, so the address keeps
 * its identity and anything referencing it — a live booking's address — still resolves. Without
 * the parameter it is the add flow. The distinction is made by the PRESENCE OF AN ID rather than a
 * mode flag: an id is the only thing that makes an update addressable.
 *
 * Serviceability was already checked against the pinned coordinates on the map step, and the
 * backend checks again on the write — the client asserts nothing about coverage either time.
 */
/** A pin this close to the saved one is the same place: the map's settle, not the customer. */
const PIN_MOVED_METRES = 5;

/** Metres between two nearby points (equirectangular; ample at a few hundred metres). */
function metresBetween(
  a: { readonly latitude: number; readonly longitude: number },
  b: { readonly latitude: number; readonly longitude: number },
): number {
  const metresPerDegree = 111_320;
  const north = (a.latitude - b.latitude) * metresPerDegree;
  const east =
    (a.longitude - b.longitude) * metresPerDegree * Math.cos((b.latitude * Math.PI) / 180);
  return Math.hypot(north, east);
}

export default function AddressDetailsRoute() {
  const router = useRouter();
  const { addressId, onboarding, from } = useLocalSearchParams<{
    addressId?: string;
    onboarding?: string;
    from?: string;
  }>();
  const editingId = typeof addressId === 'string' && addressId !== '' ? addressId : null;
  const { savedPoint, savedPlaceId, savedArea, locationReady } = useAddressDetailsData(editingId);
  // The edit's own record. Only an edit needs the list; adding must not wait on a read.
  const addresses = useAddresses({ enabled: editingId !== null });
  const draft = useAddressDraftStore((store) => store.draft);
  const clearDraft = useAddressDraftStore((store) => store.clear);
  const create = useCreateAddress();
  const update = useUpdateAddress();
  const remove = useDeleteAddress();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<AddressToastNotice | null>(null);
  const [removing, setRemoving] = useState<SavedAddressItem | null>(null);

  /**
   * An address saved without a pincode gets one back the next time it is edited (566688b). Its
   * point is known, so Google is asked for the postcode in the background while the form is open;
   * the save sends it if it arrived, and the address simply keeps none if it did not.
   */
  const [recoveredPincode, setRecoveredPincode] = useState<string | null>(null);
  const needsPincode = editingId !== null && savedArea?.pincode === '';
  // Primitives, so a re-render that rebuilds the point object does not ask Google again.
  const pointLat = savedPoint?.latitude ?? null;
  const pointLng = savedPoint?.longitude ?? null;
  useEffect(() => {
    if (!needsPincode || pointLat === null || pointLng === null) return undefined;
    let live = true;
    void googleReverseGeocode({ latitude: pointLat, longitude: pointLng }).then((result) => {
      if (live && result.ok && result.value.pincode !== null) {
        setRecoveredPincode(result.value.pincode);
      }
    });
    return () => {
      live = false;
    };
  }, [needsPincode, pointLat, pointLng]);

  /**
   * An EDIT waits for its record: the form's fields are seeded ONCE when it mounts, so rendering
   * before `GET /v1/me/addresses` answers would seed it empty and the record would never reach the
   * inputs. Adding waits for nothing.
   */
  const state = useMemo(() => {
    if (editingId === null) return { status: 'ready' as const, data: null };
    if (addresses.state.status !== 'ready') return addresses.state;
    return {
      status: 'ready' as const,
      data: addresses.state.data.find((address) => address.id === editingId) ?? null,
    };
  }, [editingId, addresses.state]);

  /**
   * The draft is this screen's only when TAGGED for this exact address (`editingId`): this store
   * persists until a save succeeds, so an abandoned attempt can leave a point behind.
   */
  const draftIsOurs =
    draft.editingId === editingId && draft.latitude !== null && draft.longitude !== null;
  const pinned = pinnedSummaryOf(draftIsOurs ? draft : (savedArea ?? draft));
  /** The society dropdown's options: the societies at the pin being saved (R-AREA-19). */
  const societies = useSocieties(
    draftIsOurs && draft.latitude !== null && draft.longitude !== null
      ? { latitude: draft.latitude, longitude: draft.longitude }
      : savedPoint,
  );
  // Moved means moved by the customer: Edit now passes through the map, and the map's settled
  // centre comes back a hair off the saved point, which alone enabled Save on an untouched address
  // (device test, 31 Oct 2026).
  const pinMoved =
    editingId !== null &&
    draftIsOurs &&
    savedPoint !== null &&
    draft.latitude !== null &&
    draft.longitude !== null &&
    metresBetween({ latitude: draft.latitude, longitude: draft.longitude }, savedPoint) >
      PIN_MOVED_METRES;

  /**
   * "Edit" on the pinned card is a DIGRESSION to the map, unconditional however this screen was
   * reached. PUSH, not `dismissAll` + `replace` (cc8c36b): this exact screen, with whatever was
   * typed, stays alive underneath, and `resume=1` tells the map's Confirm to pop back to it rather
   * than push a second, blank form. `addressId` travels with it so the round trip stays an UPDATE.
   */
  const goToLocation = () => {
    router.push(
      [
        'resume=1',
        onboarding === '1' ? 'onboarding=1' : null,
        editingId === null ? null : `addressId=${encodeURIComponent(editingId)}`,
        from === undefined ? null : `from=${from}`,
      ]
        .filter((part): part is string => part !== null)
        .reduce<string>(
          (href, part, index) => `${href}${index === 0 ? '?' : '&'}${part}`,
          '/address/location',
        ) as Href,
    );
  };

  /**
   * BACK pops to whichever screen really sits underneath — the map (adding) or the saved list
   * (Edit pushes here directly, skipping the map) — via `useSafeBack` (3ff4297, cc8c36b).
   */
  const listHref = (from === undefined ? '/address' : `/address?from=${from}`) as Href;
  const goBack = useSafeBack(listHref);
  // One screen per tap: a quick double tap must not open the same screen twice.
  const guard = useNavigationGuard();

  /**
   * Leaves the flow: the map/details pair collapses, then Home (onboarding) or the saved list,
   * which shows the "Address saved" toast (dev note `2075:11932`).
   */
  const exit = () => {
    // Guarded: a deep link straight here has nothing to dismiss, and popping an only-child throws.
    if (router.canDismiss()) router.dismissAll();
    router.replace(
      onboarding === '1'
        ? '/home'
        : ((from === undefined ? '/address?saved=1' : `/address?from=${from}&saved=1`) as Href),
    );
  };

  const save = (form: AddressDetailsForm) => {
    // The CTA is disabled while a write is out; a press can still race the state that disabled it.
    if (create.isPending || update.isPending) return;

    /**
     * The POINT this address is saved at (bc7e2f9): adding, the draft's; editing, the record's own
     * unless the customer pinned a new one. `null` means there is nothing to save.
     */
    const point = resolveAddressSavePoint(draft, editingId, savedPoint, savedPlaceId);
    if (point === null) return;

    /**
     * AREA: the draft's, then the address's own (4962f3f). An edit that never went through the
     * map has an empty draft, and `PUT` requires a pincode.
     */
    const area = draftIsOurs ? draft : null;
    const city = area?.city ?? savedArea?.city ?? null;
    const stateName = area?.state ?? savedArea?.state ?? null;
    const input = {
      ...detailsFieldsFrom(form),
      // With no road name (common inside a society) the pin's locality is the street, not the
      // society the customer typed, so the address keeps its area (R-AREA-15).
      street: area?.street ?? savedArea?.street ?? area?.locality ?? form.society.trim(),
      pincode:
        area?.pincode ?? (savedArea?.pincode === '' ? recoveredPincode : savedArea?.pincode) ?? '',
      ...(city === null ? {} : { city }),
      ...(stateName === null ? {} : { state: stateName }),
      /*
       * The whole area the map read, sent only with a pin placed on this visit. An edit that never
       * went through the map leaves it untouched (absent = unchanged); a new pin replaces all
       * three, `''` clearing what that point did not have.
       */
      ...(area === null
        ? {}
        : {
            placeName: area.placeName ?? '',
            locality: area.locality ?? '',
            areaLine: area.areaLine ?? '',
          }),
      ...point,
    };

    const saved =
      editingId === null
        ? create.mutateAsync({
            // A new address comes back as the one in use (dev note `2075:11950`).
            input: { ...input, isDefault: true },
            /*
             * Scoped to the WHOLE submission: an unchanged retry reuses the `Idempotency-Key` so
             * the backend can replay an ambiguous timeout, and any edit mints a new one.
             */
            scope: addressCreateScope({ ...input, isDefault: true }),
          })
        : update.mutateAsync({ id: editingId, input });

    saved
      .then(() => {
        // The server owns the address now. The draft has done its job.
        clearDraft();
        exit();
      })
      .catch((thrown: unknown) => {
        // An upcoming booking uses this address, so the backend refuses any edit (R-AREA-10).
        // Not a failure to retry: a toast, and the customer stays on the form.
        if (isAppError(thrown) && thrown.code === 'ADDRESS_IN_USE') {
          setNotice((previous) => ({
            id: (previous?.id ?? 0) + 1,
            message: 'This address is already used in an upcoming booking',
          }));
          return;
        }
        // The backend refuses an unserviceable point here too; its own message is shown.
        setError(isAppError(thrown) ? getUserMessage(thrown) : 'We could not save this address.');
      });
  };

  return (
    <>
      <QueryBoundary state={state} onRetry={addresses.refetch} loadingVariant="screen">
        {(existing) => (
          <AddressDetailsScreen
            mode={existing === null ? 'add' : 'edit'}
            initial={existing === null ? EMPTY_DETAILS_FORM : detailsFormFrom(existing)}
            pinned={pinned}
            onBack={guard(goBack)}
            onEditPin={guard(goToLocation)}
            onSave={save}
            {...(existing === null
              ? {}
              : {
                  onRemove: () =>
                    setRemoving({
                      id: existing.id,
                      label: existing.label,
                      kind: labelKindOf(existing.label),
                      line: cardLineOf(existing),
                      tag: null,
                    }),
                })}
            saving={create.isPending || update.isPending}
            societies={societies.state}
            onRetrySocieties={societies.refetch}
            locationReady={locationReady}
            pinMoved={pinMoved}
          />
        )}
      </QueryBoundary>

      <RemoveAddressSheet
        address={removing}
        onClose={() => setRemoving(null)}
        onRemove={async (id) => {
          try {
            await remove.mutateAsync(id);
            clearDraft();
            setRemoving(null);
            exit();
            return 'removed';
          } catch (thrown: unknown) {
            return isAppError(thrown) && thrown.code === 'ADDRESS_IN_USE' ? 'in_use' : 'failed';
          }
        }}
        testID="address-details-remove-sheet"
      />

      {/* Not drawn in the file: the save's failure state. */}
      <InfoDialog
        visible={error !== null}
        onClose={() => setError(null)}
        title="Couldn’t save address"
        body={error ?? ''}
        testID="address-save-error"
      />
      <AddressToast notice={notice} testID="address-details-toast" />
    </>
  );
}
