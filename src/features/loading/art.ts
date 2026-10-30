import type { ImageSourcePropType } from 'react-native';

/**
 * Artwork for the payment confirmation screen on Figma page `2539:15531` (file `cCQlzTeiObQkpVBzwI8mZi`),
 * in `assets/figma/loading/`. Every layer is a vector in Figma; the app has no SVG renderer, so
 * each was rasterised at 3× its box from the layer's own SVG (the MCP PNG export flattens the
 * frame's gradient behind a layer, and draws a layer that rests at opacity 0 as nothing).
 */
const img = (source: unknown) => source as ImageSourcePropType;

/** `2702:855` "Payment confirmation · Loading (dish carousel)" — 170 × 170 each. */
export const CAROUSEL_ART = {
  rajma: img(require('../../../assets/figma/loading/dish-rajma.webp')),
  chole: img(require('../../../assets/figma/loading/dish-chole.webp')),
  parathe: img(require('../../../assets/figma/loading/dish-parathe.webp')),
  salad: img(require('../../../assets/figma/loading/dish-salad.webp')),
  pasta: img(require('../../../assets/figma/loading/dish-pasta.webp')),
  biryani: img(require('../../../assets/figma/loading/dish-biryani.webp')),
  /** `2712:5840` — `Icon/Lock` (`827:115`) at 16pt, on the "Do not close" pill. */
  lock: img(require('../../../assets/figma/loading/lock.webp')),
};
