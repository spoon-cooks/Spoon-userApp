import type { ImageSourcePropType } from 'react-native';

/**
 * Artwork for the redesigned Accounts flow (Figma "V1: booking flow" — Account `2202:4311`,
 * Manage account `1517:10267`, Account & data `1517:10315`, Delete account `1517:10413` and
 * My bookings `2192:4371`), rasterised at 3× from each layer's own SVG into
 * `assets/figma/accounts-v2/`. Shared by the account hub (`@features/profile`), the account
 * screens here and My bookings (`@features/history`).
 */
const img = (source: unknown) => source as ImageSourcePropType;

export const ACCOUNTS_ART = {
  tagSparkle: img(require('../../../assets/figma/accounts-v2/tag-sparkle.png')),
  pillChevron: img(require('../../../assets/figma/accounts-v2/pill-chevron.png')),
  decoFood: img(require('../../../assets/figma/accounts-v2/deco-food.png')),
  decoPool: img(require('../../../assets/figma/accounts-v2/deco-pool.png')),
  poolPlus: img(require('../../../assets/figma/accounts-v2/pool-plus.png')),
  poolSlot1: img(require('../../../assets/figma/accounts-v2/pool-slot-1.png')),
  poolSlot2: img(require('../../../assets/figma/accounts-v2/pool-slot-2.png')),
  poolSlot3: img(require('../../../assets/figma/accounts-v2/pool-slot-3.png')),
  tileBookings: img(require('../../../assets/figma/accounts-v2/tile-bookings.png')),
  tileAddresses: img(require('../../../assets/figma/accounts-v2/tile-addresses.png')),
  tileHelp: img(require('../../../assets/figma/accounts-v2/tile-help.png')),
  rowChevron: img(require('../../../assets/figma/accounts-v2/row-chevron.png')),
  listChevron: img(require('../../../assets/figma/accounts-v2/list-chevron.png')),
  chevronLeft: img(require('../../../assets/figma/accounts-v2/icon-chevron-left.png')),
  profile: img(require('../../../assets/figma/accounts-v2/icon-profile.png')),
  lock: img(require('../../../assets/figma/accounts-v2/icon-lock.png')),
  doc: img(require('../../../assets/figma/accounts-v2/icon-doc.png')),
  logout: img(require('../../../assets/figma/accounts-v2/icon-logout.png')),
  phone: img(require('../../../assets/figma/accounts-v2/icon-phone.png')),
  dish: img(require('../../../assets/figma/accounts-v2/icon-dish.png')),
  location: img(require('../../../assets/figma/accounts-v2/icon-location.png')),
  bookings: img(require('../../../assets/figma/accounts-v2/icon-bookings.png')),
  favorite: img(require('../../../assets/figma/accounts-v2/icon-favorite.png')),
  trash: img(require('../../../assets/figma/accounts-v2/icon-trash.png')),
  calendar: img(require('../../../assets/figma/accounts-v2/icon-calendar.png')),
  recurring: img(require('../../../assets/figma/accounts-v2/icon-recurring.png')),
  stateConfirmed: img(require('../../../assets/figma/accounts-v2/state-confirmed.png')),
  /** My bookings card wells (`2980:15304` / `2980:15308` / `2980:15300`): the booking's status. */
  wellCheck: img(require('../../../assets/figma/accounts-v2/well-check.png')),
  wellCheckSmall: img(require('../../../assets/figma/accounts-v2/well-check-small.png')),
  wellClose: img(require('../../../assets/figma/accounts-v2/well-close.png')),
  skyGlow: img(require('../../../assets/figma/accounts-v2/sky-glow.png')),
  skyRays: img(require('../../../assets/figma/accounts-v2/sky-rays.png')),
  skySun: img(require('../../../assets/figma/accounts-v2/sky-sun.png')),
  skySunRim: img(require('../../../assets/figma/accounts-v2/sky-sun-rim.png')),
  emptyFlower: img(require('../../../assets/figma/accounts-v2/empty-flower.png')),
  /** `2192:4553` — the Past tab's empty flower, with the bookings glyph. */
  emptyFlowerPast: img(require('../../../assets/figma/accounts-v2/empty-flower-past.png')),
} as const;
