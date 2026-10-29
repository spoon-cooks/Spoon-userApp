import type { ImageSourcePropType } from 'react-native';

/**
 * Static artwork for the redesigned address flow, from Figma `cCQlzTeiObQkpVBzwI8mZi` (page
 * "V1: booking flow"), rasterised at 3× from each layer's own SVG into `assets/figma/address-v2/`
 * (the app has no SVG renderer). Transparent backgrounds throughout.
 */
const img = (source: unknown) => source as ImageSourcePropType;

export const ADDRESS_ART = {
  /** The not-live map art Home's inactive-pincode card draws, reused on `2355:6094`. */
  notLiveMap: img(require('../../../../assets/figma/home2/map-art.png')),
  /** `43:63` Icon/Chevron left. */
  chevronLeft: img(require('../../../../assets/figma/address-v2/icon-chevron-left.png')),
  /** `167:23` Icon/Chevron right. */
  chevronRight: img(require('../../../../assets/figma/address-v2/icon-chevron-right.png')),
  /** `43:65` Icon/Search. */
  search: img(require('../../../../assets/figma/address-v2/icon-search.png')),
  /** `1005:127` Icon/Location — also the "Others" label icon. */
  location: img(require('../../../../assets/figma/address-v2/icon-location.png')),
  /** `1008:127` Icon/Location_fill. */
  locationFill: img(require('../../../../assets/figma/address-v2/icon-location-fill.png')),
  /** `1346:455` Icon/Touch — the map's drag hint. */
  touch: img(require('../../../../assets/figma/address-v2/icon-touch.png')),
  /** `1820:1018` Icon/Apartment. */
  apartment: img(require('../../../../assets/figma/address-v2/icon-apartment.png')),
  /** `1791:1016` Icon/Home. */
  home: img(require('../../../../assets/figma/address-v2/icon-home.png')),
  /** `1791:1018` Icon/Parents. */
  parents: img(require('../../../../assets/figma/address-v2/icon-parents.png')),
  /** `1791:1020` Icon/Friends. */
  friends: img(require('../../../../assets/figma/address-v2/icon-friends.png')),
  /** `1005:125` Icon/Profile. */
  profile: img(require('../../../../assets/figma/address-v2/icon-profile.png')),
  /** `43:67` Icon/Close. */
  close: img(require('../../../../assets/figma/address-v2/icon-close.png')),
  /** `497:2045` Edit_light. */
  edit: img(require('../../../../assets/figma/address-v2/icon-edit.png')),
  /** `1843:1305` Icon/More — the kebab. */
  more: img(require('../../../../assets/figma/address-v2/icon-more.png')),
  /** Icon/Trash, 16pt, in the kebab menu. */
  trash: img(require('../../../../assets/figma/address-v2/icon-trash.png')),
  /** `543:2307` General / Trash Simple, 28pt in the Remove sheet's badge. */
  trashGeneral: img(require('../../../../assets/figma/address-v2/trash-general.png')),
  /** `1870:2952` — the Remove sheet's 80pt `#FFE666` circle. */
  trashCircle: img(require('../../../../assets/figma/address-v2/trash-circle.png')),
  /** `1870:2409` — the map pin's 52pt badge. */
  pinBadge: img(require('../../../../assets/figma/address-v2/pin-badge.png')),
  /** `1870:2413` — the 16 × 6 shadow under the pin. */
  pinShadow: img(require('../../../../assets/figma/address-v2/pin-shadow.png')),
  /** `1870:2428` — the sheet's 48pt pinned-place badge. */
  placeBadge: img(require('../../../../assets/figma/address-v2/place-badge.png')),
  /** `1870:2496` — the details screen's 64pt mini map. */
  miniMap: img(require('../../../../assets/figma/address-v2/mini-map.png')),
  /** `1870:2514` — the step badge's flower. */
  stepFlower: img(require('../../../../assets/figma/address-v2/step-flower.png')),
  /** `1870:2782` — the white circle behind "Add a new address"'s plus. */
  addCircle: img(require('../../../../assets/figma/address-v2/add-circle.png')),
  /** `1870:2794` / `1870:2818` / `1870:2840` — saved-card label wells. */
  labelHome: img(require('../../../../assets/figma/address-v2/label-home.png')),
  labelParents: img(require('../../../../assets/figma/address-v2/label-parents.png')),
  labelFriends: img(require('../../../../assets/figma/address-v2/label-friends.png')),
  /** Not serviceable (`2214:4260`): the hero map's art, halos, hub pins and badges. */
  nsMapArt: img(require('../../../../assets/figma/address-v2/ns-map-art.png')),
  nsHaloA: img(require('../../../../assets/figma/address-v2/ns-halo-a.png')),
  nsHaloB: img(require('../../../../assets/figma/address-v2/ns-halo-b.png')),
  nsHubPin: img(require('../../../../assets/figma/address-v2/ns-hub-pin.png')),
  nsLiveDot: img(require('../../../../assets/figma/address-v2/ns-live-dot.png')),
  nsCookVisit: img(require('../../../../assets/figma/address-v2/ns-cook-visit.png')),
  nsDone: img(require('../../../../assets/figma/address-v2/ns-done-round.png')),
} as const;
