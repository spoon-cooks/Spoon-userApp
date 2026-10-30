import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  DEMO_COOK_KAVITA,
  DEMO_COOK_MINIMAL,
  DEMO_COOK_PARTIAL_BADGES,
  DEMO_COOK_ASHA,
} from '@/demo/fixtures/cooks';
import { CookCard } from './CookCard';

/** Concatenates every string leaf in a rendered tree. */
function renderedText(node: unknown): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(renderedText).join(' ');
  if (node !== null && typeof node === 'object' && 'children' in node) {
    return renderedText((node as { children: unknown }).children);
  }
  return '';
}

describe('CookCard — standard', () => {
  it('renders a languages attribute when the payload carries one', () => {
    // `289:7392` (Kavita) is the card that DOES list languages; `289:8388` (Asha) does not.
    render(<CookCard cook={DEMO_COOK_KAVITA} />);
    expect(screen.getByText('Hindi, Odiya')).toBeTruthy();
  });

  it('renders identity, attributes and the specialty grid', () => {
    render(<CookCard cook={DEMO_COOK_ASHA} />);

    expect(screen.getByText('Cook Asha')).toBeTruthy();
    expect(screen.getByText('Female')).toBeTruthy();
    expect(screen.getByText('North Indian')).toBeTruthy();
    expect(screen.getByText('West Bengal')).toBeTruthy();
    expect(screen.getByText('Chicken biryani')).toBeTruthy();
  });

  it('interpolates the cook name into the heading instead of hardcoding "asha"', () => {
    // The Figma file says "What asha cooks best?" on 6 of 8 cards (defect D-4).
    render(<CookCard cook={DEMO_COOK_PARTIAL_BADGES} />);

    expect(screen.getByText('What Meera cooks best?')).toBeTruthy();
    expect(screen.queryByText('What asha cooks best?')).toBeNull();
  });
});

describe('CookCard — pureVeg variant', () => {
  it('shows the pure-veg dish list instead of the standard one', () => {
    render(<CookCard cook={DEMO_COOK_ASHA} variant="pureVeg" />);

    expect(screen.getByText('Matar paneer')).toBeTruthy();
    // Chicken biryani is a standard-only dish.
    expect(screen.queryByText('Chicken biryani')).toBeNull();
  });

  it('changes nothing but the dish list — same cook, same identity, same badges', () => {
    // Confirmed C-6: pure veg is a dish filter on the same cook, not a second roster.
    const standard = render(<CookCard cook={DEMO_COOK_ASHA} />);
    const standardName = screen.getByText('Cook Asha');
    const standardBadges = screen.getByTestId('cook-card-badges');
    expect(standardName).toBeTruthy();
    expect(standardBadges).toBeTruthy();
    standard.unmount();

    render(<CookCard cook={DEMO_COOK_ASHA} variant="pureVeg" />);

    expect(screen.getByText('Cook Asha')).toBeTruthy();
    expect(screen.getByText('West Bengal')).toBeTruthy();
    expect(screen.getByTestId('cook-card-badges-spoonTrained')).toBeTruthy();
  });

  it('renders nothing for the grid when the variant has no dishes', () => {
    render(<CookCard cook={DEMO_COOK_PARTIAL_BADGES} variant="pureVeg" />);

    expect(screen.queryByTestId('cook-card-specialties')).toBeNull();
    expect(screen.getByText('Cook Meera')).toBeTruthy();
  });
});

describe('CookCard — trust badges are conditional', () => {
  it('renders only the badges that are earned', () => {
    render(<CookCard cook={DEMO_COOK_PARTIAL_BADGES} />);

    expect(screen.getByTestId('cook-card-badges-spoonTrained')).toBeTruthy();
    expect(screen.queryByTestId('cook-card-badges-backgroundVerified')).toBeNull();
    // Hygienic must never be assumed true.
    expect(screen.queryByTestId('cook-card-badges-hygienic')).toBeNull();
  });

  it('hides the row entirely when nothing is earned', () => {
    render(<CookCard cook={DEMO_COOK_MINIMAL} />);

    expect(screen.queryByTestId('cook-card-badges')).toBeNull();
  });

  it('never shows Hygienic for a cook whose flag is explicitly false', () => {
    render(
      <CookCard
        cook={{
          ...DEMO_COOK_ASHA,
          badges: { spoonTrained: true, backgroundVerified: true, hygienic: false },
        }}
      />,
    );

    expect(screen.queryByTestId('cook-card-badges-hygienic')).toBeNull();
    expect(screen.getByTestId('cook-card-badges-backgroundVerified')).toBeTruthy();
  });
});

describe('CookCard — optional fields', () => {
  it('renders with only a name supplied', () => {
    render(<CookCard cook={DEMO_COOK_MINIMAL} />);

    expect(screen.getByText('Cook Kavita')).toBeTruthy();
    expect(screen.queryByTestId('cook-card-attributes')).toBeNull();
    expect(screen.queryByTestId('cook-card-specialties')).toBeNull();
  });

  it('falls back to initials when no photo is supplied', () => {
    render(<CookCard cook={DEMO_COOK_MINIMAL} />);

    expect(screen.getByText('CK')).toBeTruthy();
  });

  it('hides the specialty grid when suppressed', () => {
    render(<CookCard cook={DEMO_COOK_ASHA} showSpecialties={false} />);

    expect(screen.queryByTestId('cook-card-specialties')).toBeNull();
  });
});

describe('CookCard — calling', () => {
  it('invokes the callback and labels the action with the cook name', () => {
    const onCallCook = jest.fn();
    render(<CookCard cook={DEMO_COOK_ASHA} onCallCook={onCallCook} />);

    const call = screen.getByTestId('cook-card-call');
    expect(call.props.accessibilityLabel).toBe('Call Asha');

    fireEvent.press(call);
    expect(onCallCook).toHaveBeenCalledTimes(1);
  });

  it('hides the action when no callback is supplied', () => {
    render(<CookCard cook={DEMO_COOK_ASHA} />);

    expect(screen.queryByTestId('cook-card-call')).toBeNull();
  });

  it('exposes no phone number anywhere in the rendered tree', () => {
    // The view model has no phone field at all: the component cannot leak one.
    const onCallCook = jest.fn();
    render(<CookCard cook={DEMO_COOK_ASHA} onCallCook={onCallCook} />);

    // Scan the rendered TEXT, not the style tree (which legitimately contains long numbers).
    const text = renderedText(screen.toJSON());
    expect(text).not.toMatch(/(?:\+91[\s-]?)?[6-9]\d{9}/);
    expect(text).not.toMatch(/tel:/);
    // And the view model has no phone field at all, so there is nothing to leak.
    expect(Object.keys(DEMO_COOK_ASHA)).not.toContain('phone');
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/"(phone|mobile|tel)"\s*:/i);
  });
});
