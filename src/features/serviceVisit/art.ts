import type { ImageSourcePropType } from 'react-native';

/**
 * Artwork for the redesigned visit-details states (Figma "Service flow", `2165:11841`),
 * rasterised at 3× from each layer's own SVG into `assets/figma/service-v2/`. The banner's sky
 * (halos, sun, clouds) is the same art the cancelled banner uses, in `cancel-v2/`.
 */
const img = (source: unknown) => source as ImageSourcePropType;

export const SERVICE_ART = {
  stateAssigned: img(require('../../../assets/figma/service-v2/state-assigned.png')),
  stateArriving: img(require('../../../assets/figma/service-v2/state-arriving.png')),
  stateArrived: img(require('../../../assets/figma/service-v2/state-arrived.png')),
  stateInProgress: img(require('../../../assets/figma/service-v2/state-in-progress.png')),
  stateTimesUp: img(require('../../../assets/figma/service-v2/state-times-up.png')),
  tileHaloA: img(require('../../../assets/figma/service-v2/tile-halo-a.png')),
  tileHaloB: img(require('../../../assets/figma/service-v2/tile-halo-b.png')),
  heroWave: img(require('../../../assets/figma/service-v2/hero-wave.png')),
  heroHaloA: img(require('../../../assets/figma/service-v2/hero-halo-a.png')),
  heroHaloB: img(require('../../../assets/figma/service-v2/hero-halo-b.png')),
  heroHaloC: img(require('../../../assets/figma/service-v2/hero-halo-c.png')),
  briefDish: img(require('../../../assets/figma/service-v2/brief-dish.png')),
  briefClock: img(require('../../../assets/figma/service-v2/brief-clock.png')),
  briefPot: img(require('../../../assets/figma/service-v2/brief-pot.png')),
  checkOff: img(require('../../../assets/figma/service-v2/prep-check-off.png')),
  timeAdd: img(require('../../../assets/figma/service-v2/time-add.png')),
  calendarAdd: img(require('../../../assets/figma/service-v2/calendar-add.png')),
  extendedBadge: img(require('../../../assets/figma/service-v2/extended-badge.png')),
  doneRound: img(require('../../../assets/figma/service-v2/done-round.png')),
  close: img(require('../../../assets/figma/service-v2/close.png')),
  tipDeco: img(require('../../../assets/figma/service-v2/tip-deco.png')),
  favoriteFill: img(require('../../../assets/figma/service-v2/favorite-fill.png')),
  /** `2349:846` Icon/Cook changed — the reassigned note's 24pt glyph (`2353:17570`). */
  cookChanged: img(require('../../../assets/figma/service-v2/cook-changed.png')),
  /** `2879:846` Icon/Arriving early — the early note's 24pt glyph (`2878:7738`). */
  arrivingEarly: img(require('../../../assets/figma/service-v2/arriving-early.png')),
  /** `2879:848` Icon/Arriving late — the late note's 24pt glyph (`2878:7967`). */
  arrivingLate: img(require('../../../assets/figma/service-v2/arriving-late.png')),
  /** `2342:4344` — the apology card's 260pt warm glow (radial `#FFED99` 90% → clear). */
  apologyGlow: img(require('../../../assets/figma/service-v2/apology-glow.png')),
  skyHalo3: img(require('../../../assets/figma/cancel-v2/banner-halo-3.png')),
  skyHalo2: img(require('../../../assets/figma/cancel-v2/banner-halo-2.png')),
  skySun: img(require('../../../assets/figma/cancel-v2/banner-sun.png')),
  skyCloudA: img(require('../../../assets/figma/cancel-v2/banner-cloud-a.png')),
  skyCloudB: img(require('../../../assets/figma/cancel-v2/banner-cloud-b.png')),
  check: img(require('../../../assets/figma/cancel-v2/icon-check.png')),
  exclamation: img(require('../../../assets/figma/cancel-v2/icon-exclamation.png')),
} as const;
