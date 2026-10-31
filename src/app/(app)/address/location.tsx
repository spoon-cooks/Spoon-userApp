import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';

import {
  AddressMapScreen,
  currentAddressOf,
  useAddresses,
  rememberTriedPlace,
  useAddressLocation,
  useNotServiceableStore,
} from '@features/address';
import { useMe } from '@features/auth';
import { useAddressDraftStore } from '@core/store/addressDraftStore';
import { useAndroidBackHandler, useNavigationGuard, useSafeBack } from '@core/navigation';

/**
 * Where the map opens when the device cannot say where the customer is (dev note `2075:11925`):
 * the last saved pin, else the city centre. MG Road, Bengaluru — the city Spoon serves.
 */
const CITY_CENTRE = { latitude: 12.9756, longitude: 77.6066 };

/**
 * Map location — Figma `1870:2379` with Search location `1870:2436` as a layer over it.
 *
 * The map is REAL: Google Maps through `react-native-maps`, Places (New) behind search, and a pin
 * fixed to the centre that the customer drags the CITY beneath. Every one of those produces the
 * same thing — a coordinate.
 *
 * ## Selecting is not confirming
 *
 *   search / PAN  ->  the map settles, the point under the pin updates, its address follows.
 *                     NO network decision, NO navigation.
 *   CONFIRM       ->  one serviceability call, and the answer decides where to go:
 *                       outside_service_area     -> `/address/out-of-service`
 *                       temporarily_unavailable  -> inline ("not right now" is not "not here")
 *                       offline / timeout / 5xx  -> inline; a failure is not a verdict
 *
 * The client evaluates no coverage: it reads `status` off the server's response and routes.
 * Confirm carries the approved coordinates forward in the address draft, because the details
 * form is a separate route and the coordinates are what make the address real.
 */
export default function AddressLocationRoute() {
  const router = useRouter();
  /**
   * `onboarding=1` is the first-run flow context set by Home's address gate. `addressId` is present
   * only when the customer came here from an EDIT — it keeps the edit addressed to the same
   * record. `from` is the saved list's entry point (Home or Profile). `resume=1` marks this visit
   * as an "Edit" digression from an already-open details form — see the Confirm handler.
   */
  const { onboarding, addressId, from, resume } = useLocalSearchParams<{
    onboarding?: string;
    addressId?: string;
    from?: string;
    resume?: string;
  }>();
  const firstRun = onboarding === '1';
  const editingId = typeof addressId === 'string' && addressId !== '' ? addressId : null;
  const location = useAddressLocation();
  // A first run has no addresses to read, except when it is redoing a saved one (`addressId`):
  // the map then opens on that address's own pin.
  const addresses = useAddresses({ enabled: !firstRun || editingId !== null });
  const setPoint = useAddressDraftStore((store) => store.setPoint);
  const setNotServiceable = useNotServiceableStore((store) => store.set);
  const me = useMe();
  const userId = me.state.status === 'ready' ? me.state.data.id : null;
  const [searchOpen, setSearchOpen] = useState(false);
  /** The device failure the fallback point was chosen for, kept until the customer moves the map. */
  const [fallbackNotice, setFallbackNotice] = useState<string | undefined>(undefined);

  /**
   * FIRST-TIME: no back control at all (V7 founder comment, task §4/§15) — the screen is reached
   * by `<Redirect>`s that replace, so there is genuinely nothing behind it.
   *
   * REPEAT: back pops to the saved list it was opened from, `useSafeBack` for the platform's
   * reverse-of-push animation (ec0f39e, 3ff4297).
   */
  const goBackToList = useSafeBack(
    (from === undefined ? '/address' : `/address?from=${from}`) as Href,
  );
  const goBack = firstRun ? undefined : goBackToList;
  // One screen per tap: a quick double tap must not open the same screen twice.
  const guard = useNavigationGuard();

  /**
   * The device gave no fix (denied, location off, none to be had): open on the last saved pin,
   * else the city centre, so there is a map to drag rather than a blank panel. The reason stays
   * in the hint until the customer moves the pin themselves.
   */
  const savedFallback =
    addresses.state.status === 'ready' ? currentAddressOf(addresses.state.data) : null;
  const failed =
    !location.locating && location.coordinates === null && location.message !== undefined;
  // Adjusted while rendering, not in the effect: the reason is known now, the point follows.
  if (failed && fallbackNotice !== location.message) setFallbackNotice(location.message);
  const { selectPoint } = location;
  useEffect(() => {
    if (!failed) return;
    selectPoint(
      savedFallback === null || savedFallback === undefined
        ? CITY_CENTRE
        : { latitude: savedFallback.latitude, longitude: savedFallback.longitude },
    );
  }, [failed, savedFallback, selectPoint]);

  /**
   * An EDIT opens on the address's saved pin, not wherever the phone is: the customer is moving
   * THAT pin. Placed once, as the customer's own point, so a device fix still in flight is dropped
   * rather than dragging the map away; from there the pin moves only when they move it.
   */
  // Not on a `resume` visit: that one returns to a form whose point may already have moved.
  const editing =
    editingId === null || resume !== undefined || addresses.state.status !== 'ready'
      ? undefined
      : addresses.state.data.find((address) => address.id === editingId);
  const placedEditPin = useRef(false);
  useEffect(() => {
    if (editing === undefined || placedEditPin.current) return;
    placedEditPin.current = true;
    selectPoint({ latitude: editing.latitude, longitude: editing.longitude });
  }, [editing, selectPoint]);

  /** Android back closes the Search layer before it touches the stack. */
  useAndroidBackHandler(() => {
    if (!searchOpen) return false;
    location.dismissSuggestions();
    setSearchOpen(false);
    return true;
  });

  const confirm = () => {
    void location.confirm().then((outcome) => {
      /**
       * `blocked` — no point, a check already in flight, or the map settled somewhere new while
       * this one was out. `error` — the hook has put a retry message in the hint. Nothing moves.
       */
      if (outcome.kind === 'blocked' || outcome.kind === 'error') return;

      if (outcome.kind === 'refused') {
        // The parameters that describe WHICH address is being placed travel with it, so "Choose
        // another location" returns to a map that still knows.
        const query = [
          firstRun ? 'onboarding=1' : null,
          editingId === null ? null : `addressId=${encodeURIComponent(editingId)}`,
          from === undefined ? null : `from=${from}`,
          resume === undefined ? null : `resume=${resume}`,
        ]
          .filter((part): part is string => part !== null)
          .join('&');
        // PUSH, not replace: coming back returns to exactly the point they were looking at.
        if (outcome.status === 'outside_service_area') {
          // What the Not serviceable screen names (`2214:4260`): the server's answer first.
          const place = {
            title: outcome.geocoded?.title ?? 'Selected location',
            line: outcome.geocoded?.line ?? '',
            locality:
              outcome.verdict.demand?.locality ??
              outcome.geocoded?.locality ??
              outcome.geocoded?.city ??
              null,
            liveAreas: outcome.verdict.liveAreas ?? [],
            neighbours: outcome.verdict.demand?.neighbours ?? 0,
          };
          setNotServiceable(place);
          // Remembered on the device, so a customer with no saved address lands on the
          // inactive-pincode Home for it rather than back on this map (`1302:3539`).
          if (userId !== null) void rememberTriedPlace(userId, place);
          router.push(
            (query === '' ? '/address/out-of-service' : `/address/out-of-service?${query}`) as Href,
          );
        }
        // `temporarily_unavailable` is already in the hint. Not a place-based refusal: no screen.
        return;
      }

      /**
       * Serviceable. The coordinates the SERVER approved are the ones carried forward — read off
       * the OUTCOME, never off `location.coordinates`, which can be one settle behind.
       */
      setPoint({
        latitude: outcome.coordinates.latitude,
        longitude: outcome.coordinates.longitude,
        placeId: outcome.geocoded?.placeId ?? null,
        serviceable: true,
        // Tags this point as belonging to THIS edit (or to no address, while adding) — c695638.
        editingId,
        street: outcome.geocoded?.street ?? null,
        city: outcome.geocoded?.city ?? null,
        state: outcome.geocoded?.region ?? null,
        pincode: outcome.geocoded?.pincode ?? null,
        // The whole area, not only the parts above (R-AREA-15). "Selected location" is the
        // geocoder's placeholder for an unnamed point, not a place name.
        placeName:
          outcome.geocoded?.title === undefined || outcome.geocoded.title === 'Selected location'
            ? null
            : outcome.geocoded.title,
        locality: outcome.geocoded?.locality ?? null,
        areaLine: outcome.geocoded?.line ?? null,
      });

      /**
       * `resume=1`: the details form that sent the customer here is still underneath, holding
       * what they typed, and it reads the point just written. Pop back to it rather than push a
       * second, blank form (cc8c36b).
       */
      if (resume !== undefined) {
        router.back();
        return;
      }

      // The details form, with the SAME context — `addressId` keeps an edit a `PUT`.
      const forward = [
        firstRun ? 'onboarding=1' : null,
        editingId === null ? null : `addressId=${encodeURIComponent(editingId)}`,
        from === undefined ? null : `from=${from}`,
      ]
        .filter((part): part is string => part !== null)
        .join('&');

      router.push((forward === '' ? '/address/details' : `/address/details?${forward}`) as Href);
    });
  };

  return (
    <AddressMapScreen
      coordinates={location.coordinates}
      place={
        location.geocoded === null
          ? null
          : { title: location.geocoded.title, line: location.geocoded.line }
      }
      locating={location.locating}
      resolving={location.resolving}
      message={location.message ?? fallbackNotice}
      canConfirm={location.canConfirm}
      confirming={location.confirming}
      onBack={goBack === undefined ? undefined : guard(goBack)}
      onSettle={(point) => {
        setFallbackNotice(undefined);
        location.selectPoint(point);
      }}
      onLocate={() => {
        setFallbackNotice(undefined);
        location.locate();
      }}
      onConfirm={confirm}
      search={{
        open: searchOpen,
        onOpen: () => setSearchOpen(true),
        onClose: () => {
          location.dismissSuggestions();
          setSearchOpen(false);
        },
        query: location.query,
        suggestions: location.suggestions,
        state: location.searchState,
        onQuery: location.search,
        onChoose: (placeId) => {
          setFallbackNotice(undefined);
          location.chooseSuggestion(placeId);
          setSearchOpen(false);
        },
        onUseCurrentLocation: () => {
          setFallbackNotice(undefined);
          location.locate();
          setSearchOpen(false);
        },
      }}
    />
  );
}
