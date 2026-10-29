import { useState } from 'react';
import { Image } from 'react-native';
import type { ImageLoadEventData, NativeSyntheticEvent } from 'react-native';

import type { CookPoolImage } from '../types';

/**
 * A cook's cut-out portrait in a square: always as tall as the square, standing on its foot, and
 * centred across it. A portrait wider than it is tall is trimmed at the sides (its edges are mostly
 * empty) rather than shrunk to float above the foot — `contain` drew a 300×248 cut-out 17pt
 * short of the others. The parent clips.
 */
export interface CookPortraitProps {
  readonly source: CookPoolImage;
  readonly size: number;
}

export function CookPortrait({ source, size }: CookPortraitProps) {
  const [aspect, setAspect] = useState(() => knownAspect(source));
  const width = size * (aspect ?? 1);

  const onLoad = ({ nativeEvent }: NativeSyntheticEvent<ImageLoadEventData>) => {
    const { width: w, height: h } = nativeEvent.source;
    if (w > 0 && h > 0 && aspect === undefined) setAspect(w / h);
  };

  return (
    <Image
      source={source}
      onLoad={onLoad}
      resizeMode={aspect === undefined ? 'contain' : 'stretch'}
      style={{ position: 'absolute', top: 0, left: (size - width) / 2, width, height: size }}
    />
  );
}

/** A bundled image knows its size up front; a hosted one only once it has loaded. */
function knownAspect(source: CookPoolImage): number | undefined {
  const resolved = Image.resolveAssetSource(source);
  return resolved?.width && resolved.height ? resolved.width / resolved.height : undefined;
}
