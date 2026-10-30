import { render, screen } from '@testing-library/react-native';
import { Image } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import { DEMO_COOK_ASHA } from '@/demo/fixtures/cooks';
import type { DishViewModel } from '@ui/types/viewModels';

import { DISH_GLYPHS } from './dishGlyphs';
import { SpecialtyGrid } from './SpecialtyGrid';

/**
 * The specialty grid used to draw an EMPTY disc for every dish, because the only glyph source was
 * a `glyphUrl` the payload never carries. These tests pin the catalogue behaviour that replaced
 * it, and — importantly — pin that the component still does NOT choose a glyph itself.
 */

/** `UNSAFE_getAllByType` throws on an empty match; the absence case is a real assertion here. */
function images(): readonly ReactTestInstance[] {
  return screen.UNSAFE_queryAllByType(Image);
}

describe('SpecialtyGrid — dish glyphs', () => {
  it('draws the bundled Figma mark for every dish the fixture keys', () => {
    render(<SpecialtyGrid dishes={DEMO_COOK_ASHA.specialties ?? []} />);

    // `94:947` keys all nine of Asha's chips, so all nine discs must be filled.
    expect(images()).toHaveLength(9);
  });

  it('resolves the key to the catalogue entry, not to an arbitrary image', () => {
    const dish: DishViewModel = { id: 'momo', label: 'Momo variants', glyph: 'dimSum' };
    render(<SpecialtyGrid dishes={[dish]} />);

    expect(images()[0]?.props.source).toBe(DISH_GLYPHS.dimSum);
  });

  it('lets a server-supplied glyphUrl override the bundled catalogue', () => {
    const dish: DishViewModel = {
      id: 'momo',
      label: 'Momo variants',
      glyph: 'dimSum',
      glyphUrl: 'https://cdn.example.invalid/momo.png',
    };
    render(<SpecialtyGrid dishes={[dish]} />);

    expect(images()[0]?.props.source).toEqual({ uri: 'https://cdn.example.invalid/momo.png' });
  });

  it('draws the Fish Food mark at its own 28pt box, not the shared 26', () => {
    render(
      <SpecialtyGrid
        dishes={[
          { id: 'fish', label: 'Fish curries', glyph: 'fish' },
          { id: 'meat', label: 'Mutton curries', glyph: 'meat' },
        ]}
      />,
    );

    expect(images()[0]?.props.style).toEqual({ width: 28, height: 28 });
    expect(images()[1]?.props.style).toEqual({ width: 26, height: 26 });
  });

  it('invents no glyph when the data supplies none', () => {
    render(<SpecialtyGrid dishes={[{ id: 'unknown', label: 'Something new' }]} />);

    expect(screen.getByText('Something new')).toBeTruthy();
    expect(images()).toHaveLength(0);
  });

  it('caps the display at nine without assuming the server sends nine', () => {
    const many: readonly DishViewModel[] = Array.from({ length: 14 }, (_, i) => ({
      id: `dish-${i}`,
      label: `Dish ${i}`,
      glyph: 'peas' as const,
    }));
    render(<SpecialtyGrid dishes={many} />);

    expect(images()).toHaveLength(9);
    expect(screen.queryByText('Dish 9')).toBeNull();
  });
});
