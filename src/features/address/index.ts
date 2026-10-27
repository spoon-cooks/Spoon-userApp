/**
 * Feature: address.
 *
 * Screens: `68:214` Saved addresses (list) → `53:31` map/pin step → `60:655` address details.
 *
 * NEW in `1kd1u3WEc00SENkToIPloW`: `228:1801` the Edit/Delete sheet over the list, and `215:1472`
 * a full "Address out of service" screen.
 *
 * Boundary: serviceability is a BACKEND decision. The client never evaluates coverage, distance
 * or geofences. Ruling R-4 said the map step surfaces the result and that there is no separate
 * rejection flow; `215:1472` now draws exactly such a screen, so the ruling and the file
 * disagree — flagged PRODUCT_DESIGN_CONFLICT. Both surfaces exist in code and neither is chosen
 * by the client.
 *
 * The address endpoints, their payloads and the serviceability response all exist and are wired:
 * `GET/POST /v1/me/addresses`, `PUT/DELETE /v1/me/addresses/:id` and `POST /v1/serviceability/check`,
 * plus the per-address `serviceability` verdict every saved row now carries.
 * TODO(product B-13): whether `receiver { name, phone }` is per-address (as drawn) or
 * overridable per booking is unanswered.
 */

export {
  isAddressUsable,
  useAddressGate,
  useAddressDetailsData,
  useAddressEditData,
  useAddressLocationData,
  useAddressOutOfServiceData,
  useSavedAddressesData,
} from './data';
export { AddressOutOfServiceView } from './screens/AddressScreens';
export type { AddressOutOfServiceViewProps } from './screens/AddressScreens';
export type { AddressGate, AddressDetailsData } from './data';
export {
  canSubmitAddress,
  isAddressFormComplete,
  isOthersSelected,
  missingAddressFields,
  othersLabelIdOf,
  resolveAddressSavePoint,
} from './validation';
export type {
  AddressFormShape,
  AddressFormValues,
  AddressRequiredField,
  AddressSavePoint,
  AddressSubmitGate,
} from './validation';
export type * from './types';
export { RemoveAddressSheet, SavedAddressesScreen } from './v2/SavedAddressesScreen';
export { labelKindOf } from './v2/components';
export { AddressMapScreen } from './v2/AddressMapScreen';
export { NotServiceableScreen, joinAreas } from './v2/NotServiceableScreen';
export {
  hydrateTriedPlace,
  rememberTriedPlace,
  useNotServiceableStore,
  useTriedPlace,
} from './v2/notServiceableStore';
export type { NotServiceablePlace } from './v2/notServiceableStore';
export type { AddressMapScreenProps, AddressSearchProps } from './v2/AddressMapScreen';
export type { SavedAddressesScreenProps } from './v2/SavedAddressesScreen';
export {
  savedListFrom,
  cardLineOf,
  detailsFieldsFrom,
  detailsFormFrom,
  pinnedSummaryOf,
} from './v2/model';
export {
  AddressDetailsScreen,
  EMPTY_DETAILS_FORM,
  detailsFingerprint,
  isDetailsFormComplete,
} from './v2/AddressDetailsScreen';
export type { AddressDetailsForm, AddressDetailsScreenProps } from './v2/AddressDetailsScreen';
export type { SavedAddressItem, SavedListContext } from './v2/model';
export type { ToastNotice as AddressToastNotice } from '@ui/v2/Toast';
export { AddressToast } from '@ui/v2/Toast';
export * from './api';
export { useAddressLocation } from './location/useAddressLocation';
export type { AddressLocationState } from './location/useAddressLocation';
export { getCurrentCoordinates, reverseGeocode } from './location/deviceLocation';
export { googleReverseGeocode } from './location/googlePlaces';
export type {
  DeviceCoordinates,
  DeviceLocationFailure,
  DeviceLocationResult,
  ReverseGeocodedAddress,
} from './location/deviceLocation';
