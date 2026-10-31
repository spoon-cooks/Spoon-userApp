import { fireEvent, render, screen } from '@testing-library/react-native';

import { CookAssignedCard } from './CookAssignedCard';

const MENU = [
  {
    id: 'veg',
    title: 'Curries/ sabzis- Veg',
    dishes: [
      { id: 'V-001', name: 'Dahi bhindi' },
      { id: 'V-002', name: 'Aloo gobi' },
    ],
  },
];

/**
 * The hearts on a booking's cook card (device test, 31 Oct 2026): they were a picture, so a cook
 * seen on a booking could not have a dish liked while the Cook Pool profile could.
 */
describe('CookAssignedCard dish hearts', () => {
  it('likes and unlikes a dish by its code, and shows which are liked', () => {
    const toggle = jest.fn();
    render(<CookAssignedCard menu={MENU} dishLikes={{ liked: new Set(['V-002']), toggle }} />);
    const first = screen.getByTestId('visit-cook-assigned-dish-V-001-favourite');
    const second = screen.getByTestId('visit-cook-assigned-dish-V-002-favourite');
    expect(first.props.accessibilityState).toMatchObject({ selected: false });
    expect(second.props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(first);
    expect(toggle).toHaveBeenCalledWith('V-001');
  });

  it('draws an idle heart with no button when there are no likes to save to', () => {
    render(<CookAssignedCard menu={MENU} />);
    expect(screen.queryByTestId('visit-cook-assigned-dish-V-001-favourite')).toBeNull();
  });
});
