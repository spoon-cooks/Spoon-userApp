import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import {
  DEFAULT_API_STUBS,
  createStubApi,
  createTestRuntime,
  renderWithRuntime,
} from '@/test/renderWithRuntime';
import type { AppError } from '@core/errors';
import { useAddressDraftStore } from '@core/store/addressDraftStore';

/**
 * The details form (`1870:2485` / `1870:2576` / `1870:2672`) as a WRITE contract: what Save sends,
 * for an add and for an edit, and where the customer lands afterwards.
 */

import AddressDetailsRoute from '@/app/(app)/address/details';

let mockRouter: {
  push: jest.Mock;
  back: jest.Mock;
  replace: jest.Mock;
  dismissAll: jest.Mock;
  canGoBack: jest.Mock;
  canDismiss: jest.Mock;
};
let mockSearchParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockSearchParams,
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(effect, [effect]);
  },
  Redirect: () => null,
  Stack: () => null,
}));

let writes: { method: string; body: unknown }[] = [];

const WRITTEN = {
  id: 'addr-new',
  receiverName: null,
  receiverPhone: null,
  placeId: null,
  latitude: 12.9716,
  longitude: 77.6412,
  isDefault: true,
  serviceability: { status: 'serviceable', reason: 'AVAILABLE' },
};

function render(stubs: Parameters<typeof createStubApi>[0] = {}) {
  const api = createStubApi({
    ...DEFAULT_API_STUBS,
    'GET /v1/societies': () => ({
      societies: [
        { id: 'soc-purva', name: 'Purva Skydale' },
        { id: 'soc-prestige', name: 'Prestige Shantiniketan' },
      ],
    }),
    'POST /v1/me/addresses': (body) => {
      writes.push({ method: 'POST', body });
      return { address: WRITTEN };
    },
    'PUT /v1/me/addresses/addr-1': (body) => {
      writes.push({ method: 'PUT', body });
      return { address: { ...WRITTEN, id: 'addr-1' } };
    },
    ...stubs,
  });
  return renderWithRuntime(<AddressDetailsRoute />, { runtime: createTestRuntime({ api }) });
}

beforeEach(() => {
  mockRouter = {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    dismissAll: jest.fn(),
    canGoBack: jest.fn(() => true),
    canDismiss: jest.fn(() => true),
  };
  mockSearchParams = {};
  writes = [];
  useAddressDraftStore.getState().clear();
});

const save = () => screen.getByTestId('address-details-save');
async function pickSociety(typed: string, id: string) {
  fireEvent.changeText(screen.getByTestId('address-details-society-input'), typed);
  fireEvent.press(await screen.findByTestId(`address-details-society-option-${id}`));
}
const isDisabled = () => save().props.accessibilityState.disabled as boolean;

describe('adding an address', () => {
  beforeEach(() => {
    useAddressDraftStore.getState().setPoint({
      latitude: 12.9716,
      longitude: 77.6412,
      placeId: null,
      serviceable: true,
      editingId: null,
      street: '100 Feet Road, HAL 2nd Stage',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560038',
      placeName: 'Purva Skydale',
      locality: 'HAL 2nd Stage',
      areaLine: '100 Feet Road, HAL 2nd Stage, Bengaluru, Karnataka 560038',
    });
  });

  it('shows the pinned place the map confirmed', async () => {
    render();
    await screen.findByTestId('address-details');

    expect(screen.getByText('Address details')).toBeTruthy();
    expect(screen.getByText('100 Feet Road')).toBeTruthy();
    expect(screen.getByText('HAL 2nd Stage, Bengaluru, Karnataka, 560038')).toBeTruthy();
  });

  it('holds Save until the required fields and a label are filled', async () => {
    render();
    await screen.findByTestId('address-details');
    expect(isDisabled()).toBe(true);

    fireEvent.changeText(screen.getByTestId('address-details-number'), '402');
    await pickSociety('Purva', 'soc-purva');
    expect(isDisabled()).toBe(true);

    fireEvent.press(screen.getByTestId('address-details-label-home'));
    expect(isDisabled()).toBe(false);
  });

  it('sends every field of the chosen type, the tower included, as the address in use', async () => {
    render();
    await screen.findByTestId('address-details');

    fireEvent.changeText(screen.getByTestId('address-details-number'), '402');
    fireEvent.changeText(screen.getByTestId('address-details-floor'), '4');
    fireEvent.changeText(screen.getByTestId('address-details-tower'), 'B');
    await pickSociety('Purva', 'soc-purva');
    fireEvent.press(screen.getByTestId('address-details-label-parents'));
    fireEvent.press(screen.getByTestId('address-details-receiver-toggle'));
    fireEvent.changeText(screen.getByTestId('address-details-receiver-name'), 'Asha');
    fireEvent.changeText(screen.getByTestId('address-details-receiver-phone'), '98765 43210');
    fireEvent.press(save());

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      method: 'POST',
      body: {
        label: 'Parents',
        propertyType: 'apartment',
        flat: '402',
        floor: '4',
        tower: 'B',
        society: 'Purva Skydale',
        societyId: 'soc-purva',
        lane: '',
        landmark: '',
        receiverName: 'Asha',
        receiverPhone: '+919876543210',
        street: '100 Feet Road, HAL 2nd Stage',
        pincode: '560038',
        city: 'Bengaluru',
        state: 'Karnataka',
        // The whole area the map read (R-AREA-15).
        placeName: 'Purva Skydale',
        locality: 'HAL 2nd Stage',
        areaLine: '100 Feet Road, HAL 2nd Stage, Bengaluru, Karnataka 560038',
        latitude: 12.9716,
        longitude: 77.6412,
        isDefault: true,
      },
    });
    // Back to the list, which shows the Address saved toast.
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/address?saved=1'));
  });

  it('swaps to the house fields, keeping Floor', async () => {
    render();
    await screen.findByTestId('address-details');

    fireEvent.changeText(screen.getByTestId('address-details-floor'), '1');
    fireEvent.press(screen.getByTestId('address-details-type-house'));

    expect(screen.queryByTestId('address-details-society')).toBeNull();
    expect(screen.getByTestId('address-details-lane')).toBeTruthy();
    expect(screen.getByTestId('address-details-landmark')).toBeTruthy();
    expect(screen.getByTestId('address-details-floor').props.value).toBe('1');
  });

  it('ends the first-run flow at Home', async () => {
    mockSearchParams = { onboarding: '1' };
    render();
    await screen.findByTestId('address-details');

    fireEvent.press(screen.getByTestId('address-details-type-house'));
    fireEvent.changeText(screen.getByTestId('address-details-number'), '27');
    fireEvent.press(screen.getByTestId('address-details-label-home'));
    fireEvent.press(save());

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/home'));
  });
});

describe('the society dropdown (2825:4858, 2825:5126, 2829:4973)', () => {
  beforeEach(() => {
    useAddressDraftStore.getState().setPoint({
      latitude: 12.9716,
      longitude: 77.6412,
      placeId: null,
      serviceable: true,
      editingId: null,
      street: '100 Feet Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560038',
    });
  });

  const fillRest = () => {
    fireEvent.changeText(screen.getByTestId('address-details-number'), '402');
    fireEvent.press(screen.getByTestId('address-details-label-home'));
  };

  it('lists matches with Others last, and holds Save until a society is picked', async () => {
    render();
    await screen.findByTestId('address-details');
    fillRest();
    fireEvent.changeText(screen.getByTestId('address-details-society-input'), 'pres');
    expect(await screen.findByTestId('address-details-society-option-soc-prestige')).toBeTruthy();
    expect(screen.queryByTestId('address-details-society-option-soc-purva')).toBeNull();
    expect(screen.getByTestId('address-details-society-others')).toBeTruthy();
    expect(isDisabled()).toBe(true);

    fireEvent.press(screen.getByTestId('address-details-society-option-soc-prestige'));
    expect(screen.queryByTestId('address-details-society-list')).toBeNull();
    expect(isDisabled()).toBe(false);
  });

  it('offers only Others when nothing matches, and saves the typed name apart', async () => {
    render();
    await screen.findByTestId('address-details');
    fillRest();
    fireEvent.changeText(screen.getByTestId('address-details-society-input'), 'Prestage Shanti');
    await screen.findByTestId('address-details-society-others');
    expect(screen.queryByTestId('address-details-society-option-soc-prestige')).toBeNull();

    fireEvent.press(screen.getByTestId('address-details-society-others'));
    expect(isDisabled()).toBe(true);
    fireEvent.changeText(screen.getByTestId('address-details-society-custom'), 'Green Acres');
    expect(isDisabled()).toBe(false);
    fireEvent.press(save());

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.body).toEqual(
      expect.objectContaining({ society: 'Green Acres', customSociety: 'Green Acres' }),
    );
    expect(writes[0]?.body).not.toHaveProperty('societyId');
  });
});

describe('editing an address (1870:2672)', () => {
  beforeEach(() => {
    mockSearchParams = { addressId: 'addr-1', from: 'profile' };
  });

  it('opens prefilled, titled "Edit address", with Remove beneath Save changes', async () => {
    render();
    await screen.findByTestId('address-details');

    expect(screen.getByText('Edit address')).toBeTruthy();
    expect(screen.getByText('Save changes')).toBeTruthy();
    expect(screen.getByTestId('address-details-remove')).toBeTruthy();
    expect(screen.getByTestId('address-details-number').props.value).toBe('E102');
    // Saved before the list existed: shown as it is, valid until changed.
    expect(screen.getByText('Purva Skydale')).toBeTruthy();
  });

  it('enables Save changes only once something changed', async () => {
    render();
    await screen.findByTestId('address-details');
    expect(isDisabled()).toBe(true);

    fireEvent.changeText(screen.getByTestId('address-details-floor'), '2');
    expect(isDisabled()).toBe(false);

    fireEvent.changeText(screen.getByTestId('address-details-floor'), '');
    expect(isDisabled()).toBe(true);
  });

  it('updates the same address at its own point, and returns to the list it came from', async () => {
    render();
    await screen.findByTestId('address-details');

    fireEvent.changeText(screen.getByTestId('address-details-floor'), '2');
    fireEvent.press(save());

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.method).toBe('PUT');
    expect(writes[0]?.body).toEqual(
      expect.objectContaining({
        label: 'Home',
        flat: 'E102',
        floor: '2',
        society: 'Purva Skydale',
        street: 'Silver County Road',
        pincode: '560102',
        latitude: 12.902746,
        longitude: 77.648817,
      }),
    );
    expect(writes[0]?.body).not.toHaveProperty('isDefault');
    // Never through the map on this visit: the stored area is left as it is.
    expect(writes[0]?.body).not.toHaveProperty('locality');
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith('/address?from=profile&saved=1'),
    );
  });

  it('shows a toast and stays on the form when an upcoming booking uses the address', async () => {
    const inUse: AppError = {
      kind: 'validation',
      status: 409,
      message: 'This address is used in an upcoming booking.',
      code: 'ADDRESS_IN_USE',
    };
    render({
      'PUT /v1/me/addresses/addr-1': () => {
        throw inUse;
      },
    });
    await screen.findByTestId('address-details');

    fireEvent.changeText(screen.getByTestId('address-details-floor'), '2');
    fireEvent.press(save());

    expect(
      await screen.findByText('This address is already used in an upcoming booking'),
    ).toBeTruthy();
    expect(screen.queryByTestId('address-save-error')).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('keeps a text-only society as it was when something else is edited', async () => {
    render();
    await screen.findByTestId('address-details');
    fireEvent.changeText(screen.getByTestId('address-details-floor'), '2');
    fireEvent.press(save());
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.body).toEqual(expect.objectContaining({ society: 'Purva Skydale' }));
    expect(writes[0]?.body).not.toHaveProperty('societyId');
    expect(writes[0]?.body).not.toHaveProperty('customSociety');
  });

  it('opens the remove sheet from "Remove this address"', async () => {
    render();
    await screen.findByTestId('address-details');

    fireEvent.press(screen.getByTestId('address-details-remove'));

    expect(await screen.findByText('Remove this address?')).toBeTruthy();
  });
});
