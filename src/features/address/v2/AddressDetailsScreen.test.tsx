import { fireEvent, render, screen } from '@testing-library/react-native';

import { AddressDetailsScreen, EMPTY_DETAILS_FORM } from './AddressDetailsScreen';

function renderForm() {
  render(
    <AddressDetailsScreen
      mode="add"
      initial={EMPTY_DETAILS_FORM}
      pinned={{ title: '100 Feet Road', line: 'Indiranagar, Bengaluru' }}
      onBack={jest.fn()}
      onEditPin={jest.fn()}
      onSave={jest.fn()}
      saving={false}
      locationReady
    />,
  );
}

/** Dev note `2075:11932`: tap expands the receiver; only the X collapses it and clears it. */
describe('Address details · receiver', () => {
  it('opens from the row, and the row does nothing more once it is open', () => {
    renderForm();
    fireEvent.press(screen.getByTestId('address-details-receiver-toggle'));
    fireEvent.changeText(screen.getByTestId('address-details-receiver-name'), 'Asha');
    fireEvent.press(screen.getByTestId('address-details-receiver-toggle'));
    expect(screen.getByTestId('address-details-receiver-name').props.value).toBe('Asha');
  });

  it('collapses and clears from the X only', () => {
    renderForm();
    fireEvent.press(screen.getByTestId('address-details-receiver-toggle'));
    fireEvent.changeText(screen.getByTestId('address-details-receiver-name'), 'Asha');
    fireEvent.press(screen.getByTestId('address-details-receiver-remove'));
    expect(screen.queryByTestId('address-details-receiver-name')).toBeNull();
    fireEvent.press(screen.getByTestId('address-details-receiver-toggle'));
    expect(screen.getByTestId('address-details-receiver-name').props.value).toBe('');
  });
});

/**
 * The keyboard's return key walks the typed fields on screen; only the last one says Done. Society
 * is picked from a list (R-AREA-18), so it is not one of them.
 */
describe('Address details · return key', () => {
  const returnKeys = () =>
    ['number', 'floor', 'tower', 'receiver-name', 'receiver-phone']
      .map((id) => screen.queryByTestId(`address-details-${id}`))
      .filter((input) => input !== null)
      .map((input) => input.props.returnKeyType as string);

  it('says Next down the form and Done on its last field', () => {
    renderForm();
    expect(returnKeys()).toEqual(['next', 'next', 'done']);
  });

  it('moves Done to the receiver phone once the receiver is open', () => {
    renderForm();
    fireEvent.press(screen.getByTestId('address-details-receiver-toggle'));
    expect(returnKeys()).toEqual(['next', 'next', 'next', 'next', 'done']);
  });
});
