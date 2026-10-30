import { BackHandler } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';

import {
  DEFAULT_API_STUBS,
  createStubApi,
  createTestRuntime,
  renderWithRuntime,
} from '@/test/renderWithRuntime';

import BootGate from '@/app/index';
import ProfileDetailsRoute from '@/app/(app)/profile/details';
import { sessionStore } from '@core/store';

/**
 * The taste-profile wizard (Figma page `1405:448`) and the flow around it.
 *
 * The first-run sequence is Login -> OTP -> **taste profile** -> Address -> Home, and the wizard is
 * NON-SKIPPABLE. Both halves are asserted here: the order the boot gate produces, and that nothing
 * on screen or on the device lets a first-run customer past it without saving.
 *
 * The router is mocked for the same reason `navigation.test.tsx` mocks it — a real navigator needs
 * the whole app mounted, and what matters is which router METHOD each path reaches.
 */

let mockRouter: {
  push: jest.Mock;
  back: jest.Mock;
  replace: jest.Mock;
  dismissAll: jest.Mock;
  canGoBack: jest.Mock;
  canDismiss: jest.Mock;
};
let mockSearchParams: Record<string, string> = {};
let mockRedirected: string[] = [];

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockSearchParams,
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(effect, [effect]);
  },
  Redirect: ({ href }: { href: string }) => {
    mockRedirected.push(href);
    return null;
  },
  Stack: () => null,
}));

const ME_INCOMPLETE = {
  id: 'user-1',
  role: 'user',
  status: 'active',
  phone: '+919876543210',
  name: null,
  householdStructure: null,
  mealStructure: null,
  pressingIssue: null,
  dietaryPreference: null,
  grownUpEating: null,
  regionPreference: null,
  genderPreference: null,
  householdAdults: null,
  householdKids: null,
  householdElders: null,
  nonVegPreferences: null,
  oilLevel: null,
  gheeOnly: null,
  mealHassles: null,
  profileComplete: false,
};

const ME_COMPLETE = { ...ME_INCOMPLETE, name: 'Aarav Mehta', profileComplete: true };

const DRAFT_KEY = 'spoon.profile.draft.user-1';

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
  mockRedirected = [];
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
});

function runtimeWith(handlers: Record<string, (body: unknown) => unknown>) {
  return createTestRuntime({ api: createStubApi({ ...DEFAULT_API_STUBS, ...handlers }) });
}

/** What `PUT /v1/me/profile` answers with: the committed projection, not an echo. */
function savedProfile(overrides: Record<string, unknown> = {}) {
  const { id: _id, role: _role, status: _status, phone: _phone, ...profile } = ME_COMPLETE;
  return {
    ...profile,
    mealStructure: 'regular-cook',
    dietaryPreference: 'vegetarian',
    ...overrides,
  };
}

/**
 * The body a customer who answers only what is required produces. Every question travels: the
 * defaults (one adult, Light oil, ghee off) and the empty lists are answers the screens showed.
 */
const REQUIRED_ONLY_PAYLOAD = {
  name: 'Aarav Mehta',
  householdAdults: 1,
  householdKids: 0,
  householdElders: 0,
  dietaryPreference: 'vegetarian',
  nonVegPreferences: null,
  grownUpEating: [],
  oilLevel: 'light',
  gheeOnly: false,
  genderPreference: null,
  regionPreference: null,
  mealStructure: 'regular-cook',
  mealHassles: [],
  pressingIssue: null,
};

const cta = () => screen.getByTestId('taste-profile-continue');
const isDisabled = (testID: string) =>
  screen.getByTestId(testID).props.accessibilityState?.disabled === true;
const isChecked = (testID: string) =>
  screen.getByTestId(testID).props.accessibilityState?.checked === true;

/** Walks all four steps answering only what is required. */
async function answerRequiredSteps(name = 'Aarav Mehta') {
  fireEvent.changeText(await screen.findByTestId('taste-profile-name'), name);
  fireEvent.press(cta());
  fireEvent.press(await screen.findByTestId('taste-profile-diet-vegetarian'));
  fireEvent.press(cta());
  await screen.findByTestId('taste-profile-oil');
  fireEvent.press(cta());
  fireEvent.press(await screen.findByTestId('taste-profile-meal-regular-cook'));
}

/* ------------------------------------------------------------------------- the boot order */

describe('the boot gate', () => {
  beforeEach(() => {
    sessionStore.reset();
    sessionStore.dispatch({ type: 'BOOTSTRAP_FOUND_SESSION' });
  });

  afterEach(() => {
    sessionStore.reset();
  });

  it('sends an authenticated customer with an incomplete profile to the wizard, not Address', async () => {
    renderWithRuntime(<BootGate />, {
      runtime: runtimeWith({
        'GET /v1/me': () => ME_INCOMPLETE,
        'GET /v1/me/addresses': () => [],
      }),
    });

    await waitFor(() => expect(mockRedirected.length).toBeGreaterThan(0));
    expect(mockRedirected[mockRedirected.length - 1]).toBe('/profile/details?context=onboarding');
    expect(mockRedirected).not.toContain('/address/location?onboarding=1');
  });

  it('sends a complete profile with no address to the address flow', async () => {
    renderWithRuntime(<BootGate />, {
      runtime: runtimeWith({
        'GET /v1/me': () => ME_COMPLETE,
        'GET /v1/me/addresses': () => [],
      }),
    });

    await waitFor(() => expect(mockRedirected).toContain('/address/location?onboarding=1'));
    expect(mockRedirected).not.toContain('/profile/details?context=onboarding');
  });

  it('sends a complete profile with a saved address to Home', async () => {
    renderWithRuntime(<BootGate />, {
      runtime: runtimeWith({ 'GET /v1/me': () => ME_COMPLETE }),
    });

    await waitFor(() => expect(mockRedirected).toContain('/home'));
  });

  it('redirects nowhere at all while the gates are still resolving', () => {
    renderWithRuntime(<BootGate />, {
      runtime: runtimeWith({
        'GET /v1/me': () => ME_INCOMPLETE,
        'GET /v1/me/addresses': () => [],
      }),
    });

    expect(mockRedirected).toEqual([]);
    expect(screen.getByTestId('splash-loading')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------------ the wizard */

describe('the taste-profile wizard', () => {
  it('draws no back control on step 1 of the first run', async () => {
    mockSearchParams = { context: 'onboarding' };
    renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({ 'GET /v1/me': () => ME_INCOMPLETE }),
    });

    await screen.findByTestId('taste-profile-header');
    expect(screen.queryByTestId('taste-profile-header-back')).toBeNull();
  });

  it('draws a back control on step 1 of an edit', async () => {
    renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({ 'GET /v1/me': () => ME_COMPLETE }),
    });

    expect(await screen.findByTestId('taste-profile-header-back')).toBeTruthy();
  });

  it('swallows Android back on step 1 of the first run and lets it through when editing', async () => {
    const spy = jest.spyOn(BackHandler, 'addEventListener');

    mockSearchParams = { context: 'onboarding' };
    const onboarding = renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({ 'GET /v1/me': () => ME_INCOMPLETE }),
    });
    await screen.findByTestId('taste-profile-header');
    const onboardingHandler = spy.mock.calls.at(-1)?.[1] as () => boolean;
    expect(onboardingHandler()).toBe(true);

    onboarding.unmount();
    spy.mockClear();

    mockSearchParams = {};
    renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({ 'GET /v1/me': () => ME_COMPLETE }),
    });
    await screen.findByTestId('taste-profile-header');
    const editHandler = spy.mock.calls.at(-1)?.[1] as () => boolean;
    expect(editHandler()).toBe(false);
  });

  it('gates each step on its required answer only', async () => {
    mockSearchParams = { context: 'onboarding' };
    renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({ 'GET /v1/me': () => ME_INCOMPLETE }),
    });

    // Family: the name (one adult is already counted).
    await screen.findByTestId('taste-profile-name');
    expect(isDisabled('taste-profile-continue')).toBe(true);
    fireEvent.changeText(screen.getByTestId('taste-profile-name'), '   ');
    expect(isDisabled('taste-profile-continue')).toBe(true);
    fireEvent.changeText(screen.getByTestId('taste-profile-name'), 'Aarav');
    expect(isDisabled('taste-profile-continue')).toBe(false);
    fireEvent.press(cta());

    // Diet: a tile, no default.
    await screen.findByTestId('taste-profile-diet-vegetarian');
    expect(isDisabled('taste-profile-continue')).toBe(true);
    fireEvent.press(screen.getByTestId('taste-profile-diet-jain'));
    expect(isDisabled('taste-profile-continue')).toBe(false);
    fireEvent.press(cta());

    // Taste: everything optional.
    await screen.findByTestId('taste-profile-oil');
    expect(isDisabled('taste-profile-continue')).toBe(false);
    fireEvent.press(cta());

    // Cook: the meal setup.
    await screen.findByTestId('taste-profile-meals');
    expect(isDisabled('taste-profile-continue')).toBe(true);
    fireEvent.press(screen.getByTestId('taste-profile-meal-tiffin'));
    expect(isDisabled('taste-profile-continue')).toBe(false);
  });

  it('keeps Adults at one or more and the others at zero or more', async () => {
    mockSearchParams = { context: 'onboarding' };
    renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({ 'GET /v1/me': () => ME_INCOMPLETE }),
    });

    await screen.findByTestId('taste-profile-householdAdults-minus');
    expect(isDisabled('taste-profile-householdAdults-minus')).toBe(true);
    expect(isDisabled('taste-profile-householdKids-minus')).toBe(true);
    fireEvent.press(screen.getByTestId('taste-profile-householdKids-plus'));
    expect(isDisabled('taste-profile-householdKids-minus')).toBe(false);
    expect(screen.getByLabelText('1 kids')).toBeTruthy();
  });

  it('goes back a step, keeping what was answered', async () => {
    mockSearchParams = { context: 'onboarding' };
    renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({ 'GET /v1/me': () => ME_INCOMPLETE }),
    });

    fireEvent.changeText(await screen.findByTestId('taste-profile-name'), 'Aarav');
    fireEvent.press(cta());
    fireEvent.press(await screen.findByTestId('taste-profile-header-back'));

    expect((await screen.findByTestId('taste-profile-name')).props.value).toBe('Aarav');
    expect(screen.queryByTestId('taste-profile-header-back')).toBeNull();
  });

  it('asks the meat question only for Non-veg and Mixed home, and clears it otherwise', async () => {
    mockSearchParams = { context: 'onboarding' };
    renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({ 'GET /v1/me': () => ME_INCOMPLETE }),
    });

    fireEvent.changeText(await screen.findByTestId('taste-profile-name'), 'Aarav');
    fireEvent.press(cta());
    fireEvent.press(await screen.findByTestId('taste-profile-diet-vegetarian'));
    expect(screen.queryByTestId('taste-profile-meats')).toBeNull();

    fireEvent.press(screen.getByTestId('taste-profile-diet-non-vegetarian'));
    fireEvent.press(screen.getByTestId('taste-profile-meat-chicken'));
    expect(isChecked('taste-profile-meat-chicken')).toBe(true);

    fireEvent.press(screen.getByTestId('taste-profile-diet-eggetarian'));
    expect(screen.queryByTestId('taste-profile-meats')).toBeNull();
    fireEvent.press(screen.getByTestId('taste-profile-diet-mixed'));
    expect(isChecked('taste-profile-meat-chicken')).toBe(false);
  });

  it('does not deselect the chosen diet when it is tapped again', async () => {
    mockSearchParams = { context: 'onboarding' };
    renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({ 'GET /v1/me': () => ME_INCOMPLETE }),
    });

    fireEvent.changeText(await screen.findByTestId('taste-profile-name'), 'Aarav');
    fireEvent.press(cta());
    fireEvent.press(await screen.findByTestId('taste-profile-diet-vegan'));
    fireEvent.press(screen.getByTestId('taste-profile-diet-vegan'));
    expect(isChecked('taste-profile-diet-vegan')).toBe(true);
  });

  it('adds a cuisine only from the list, at most five', async () => {
    mockSearchParams = { context: 'onboarding' };
    renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({ 'GET /v1/me': () => ME_INCOMPLETE }),
    });

    fireEvent.changeText(await screen.findByTestId('taste-profile-name'), 'Aarav');
    fireEvent.press(cta());
    fireEvent.press(await screen.findByTestId('taste-profile-diet-vegan'));
    fireEvent.press(cta());

    // Typing filters the FULL list, including the search-only cuisines.
    fireEvent.changeText(await screen.findByTestId('taste-profile-cuisine-search'), 'pars');
    fireEvent.press(screen.getByTestId('taste-profile-cuisine-result-Parsi'));
    expect(isChecked('taste-profile-cuisine-Parsi')).toBe(true);

    fireEvent.changeText(screen.getByTestId('taste-profile-cuisine-search'), 'Grandma');
    expect(screen.getByTestId('taste-profile-cuisine-none')).toBeTruthy();

    for (const label of ['Punjabi', 'Gujarati', 'Bengali', 'Tamil']) {
      fireEvent.press(screen.getByTestId(`taste-profile-cuisine-${label}`));
    }
    expect(isDisabled('taste-profile-cuisine-Kerala')).toBe(true);
  });

  it('shows the hassle list for the chosen meal setup and swaps it on a change', async () => {
    mockSearchParams = { context: 'onboarding' };
    renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({ 'GET /v1/me': () => ME_INCOMPLETE }),
    });

    await answerRequiredSteps();
    expect(screen.getByText('What’s hardest with your regular cook?')).toBeTruthy();
    fireEvent.press(screen.getByTestId('taste-profile-hassle-cook-skips-or-late'));
    expect(isChecked('taste-profile-hassle-cook-skips-or-late')).toBe(true);

    fireEvent.press(screen.getByTestId('taste-profile-meal-order-in'));
    expect(screen.queryByTestId('taste-profile-hassle-cook-skips-or-late')).toBeNull();
    expect(isChecked('taste-profile-hassle-order-costs')).toBe(false);
  });

  it('counts the hassle note and stops it at 150', async () => {
    mockSearchParams = { context: 'onboarding' };
    renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({ 'GET /v1/me': () => ME_INCOMPLETE }),
    });

    await answerRequiredSteps();
    fireEvent.changeText(screen.getByTestId('taste-profile-hassle-note'), 'x'.repeat(170));
    expect(screen.getByTestId('taste-profile-hassle-note-count').props.children).toBe('150/150');
  });
});

/* ------------------------------------------------------------------------------ saving */

describe('saving', () => {
  it('saves every answer once, then opens the address step on a first run', async () => {
    mockSearchParams = { context: 'onboarding' };
    const put = jest.fn(() => savedProfile());

    renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({
        'GET /v1/me': () => ME_INCOMPLETE,
        'GET /v1/me/addresses': () => [],
        'PUT /v1/me/profile': put,
      }),
    });

    await answerRequiredSteps();
    // Nothing is saved while moving between steps.
    expect(put).not.toHaveBeenCalled();
    fireEvent.press(cta());

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledWith(REQUIRED_ONLY_PAYLOAD);
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith('/address/location?onboarding=1'),
    );
    // The draft is gone once the save lands.
    await waitFor(async () => expect(await SecureStore.getItemAsync(DRAFT_KEY)).toBeNull());
  });

  it('sends the optional answers it collected, trimmed', async () => {
    mockSearchParams = { context: 'onboarding' };
    const put = jest.fn(() => savedProfile());

    renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({
        'GET /v1/me': () => ME_INCOMPLETE,
        'GET /v1/me/addresses': () => [],
        'PUT /v1/me/profile': put,
      }),
    });

    fireEvent.changeText(await screen.findByTestId('taste-profile-name'), '  Aarav Mehta ');
    fireEvent.press(screen.getByTestId('taste-profile-householdKids-plus'));
    fireEvent.press(cta());
    fireEvent.press(await screen.findByTestId('taste-profile-diet-mixed'));
    fireEvent.press(screen.getByTestId('taste-profile-meat-prawns'));
    fireEvent.press(cta());
    fireEvent.press(await screen.findByTestId('taste-profile-cuisine-Bengali'));
    fireEvent.press(screen.getByTestId('taste-profile-oil-moderate'));
    fireEvent.press(screen.getByTestId('taste-profile-ghee'));
    fireEvent.press(cta());
    fireEvent.press(await screen.findByTestId('taste-profile-gender-either'));
    fireEvent.press(screen.getByTestId('taste-profile-region-south-indian'));
    fireEvent.press(screen.getByTestId('taste-profile-meal-office-meals'));
    fireEvent.press(screen.getByTestId('taste-profile-hassle-office-weekends'));
    fireEvent.changeText(screen.getByTestId('taste-profile-hassle-note'), '  Too salty  ');
    fireEvent.press(cta());

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith({
        name: 'Aarav Mehta',
        householdAdults: 1,
        householdKids: 1,
        householdElders: 0,
        dietaryPreference: 'mixed',
        nonVegPreferences: ['prawns'],
        grownUpEating: ['Bengali'],
        oilLevel: 'moderate',
        gheeOnly: true,
        genderPreference: 'either',
        regionPreference: 'south-indian',
        mealStructure: 'office-meals',
        mealHassles: ['office-weekends'],
        pressingIssue: 'Too salty',
      }),
    );
  });

  it('finishes at Home when the first-run customer already has an address', async () => {
    mockSearchParams = { context: 'onboarding' };
    const put = jest.fn(() => savedProfile());

    renderWithRuntime(<ProfileDetailsRoute />, {
      // DEFAULT_API_STUBS returns one saved address.
      runtime: runtimeWith({ 'GET /v1/me': () => ME_INCOMPLETE, 'PUT /v1/me/profile': put }),
    });

    await answerRequiredSteps();
    fireEvent.press(cta());

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/home'));
    expect(mockRouter.replace).not.toHaveBeenCalledWith('/address/location?onboarding=1');
  });

  it('stays on the last step when the save is rejected, keeping every answer', async () => {
    mockSearchParams = { context: 'onboarding' };

    renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({
        'GET /v1/me': () => ME_INCOMPLETE,
        'PUT /v1/me/profile': () => {
          throw new Error('network down');
        },
      }),
    });

    await answerRequiredSteps();
    fireEvent.press(cta());

    await waitFor(() => expect(screen.getByTestId('taste-profile-continue-error')).toBeTruthy());
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(isChecked('taste-profile-meal-regular-cook')).toBe(true);

    fireEvent.press(screen.getByTestId('taste-profile-header-back'));
    fireEvent.press(screen.getByTestId('taste-profile-header-back'));
    expect(isChecked('taste-profile-diet-vegetarian')).toBe(true);
  });

  it('keeps a first-run draft on the device and resumes from it', async () => {
    mockSearchParams = { context: 'onboarding' };
    await SecureStore.setItemAsync(
      DRAFT_KEY,
      JSON.stringify({
        version: 1,
        step: 'taste',
        values: { name: 'Aarav', dietaryPreference: 'vegan', householdKids: 2 },
      }),
    );

    renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({ 'GET /v1/me': () => ME_INCOMPLETE }),
    });

    expect(await screen.findByTestId('taste-profile-oil')).toBeTruthy();
    fireEvent.press(screen.getByTestId('taste-profile-header-back'));
    expect(isChecked('taste-profile-diet-vegan')).toBe(true);

    fireEvent.press(screen.getByTestId('taste-profile-diet-jain'));
    await waitFor(async () => {
      const stored = await SecureStore.getItemAsync(DRAFT_KEY);
      expect(JSON.parse(stored ?? '{}').values.dietaryPreference).toBe('jain');
    });
  });

  it('never resumes a draft past a step whose required answer is missing', async () => {
    mockSearchParams = { context: 'onboarding' };
    await SecureStore.setItemAsync(
      DRAFT_KEY,
      JSON.stringify({ version: 1, step: 'cook', values: { name: 'Aarav' } }),
    );

    renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({ 'GET /v1/me': () => ME_INCOMPLETE }),
    });

    expect(await screen.findByTestId('taste-profile-diet-vegetarian')).toBeTruthy();
  });

  it('prefills every saved answer on an edit', async () => {
    renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({
        'GET /v1/me': () => ({
          ...ME_COMPLETE,
          householdAdults: 2,
          householdElders: 1,
          dietaryPreference: 'non-vegetarian',
          nonVegPreferences: ['mutton'],
          grownUpEating: ['Rajasthani food', 'Odiya food'],
          oilLevel: 'none',
          gheeOnly: true,
          genderPreference: 'female',
          regionPreference: 'north-indian',
          mealStructure: 'tiffin',
          mealHassles: ['tiffin-timings'],
          pressingIssue: 'Late lunch',
        }),
      }),
    });

    await waitFor(() =>
      expect(screen.getByTestId('taste-profile-name').props.value).toBe('Aarav Mehta'),
    );
    expect(screen.getByLabelText('2 adults')).toBeTruthy();
    expect(screen.getByLabelText('1 elders')).toBeTruthy();
    fireEvent.press(cta());
    expect(isChecked('taste-profile-diet-non-vegetarian')).toBe(true);
    expect(isChecked('taste-profile-meat-mutton')).toBe(true);
    fireEvent.press(cta());
    // V8's " food" labels read back as today's chips.
    expect(isChecked('taste-profile-cuisine-Rajasthani')).toBe(true);
    expect(isChecked('taste-profile-cuisine-Odia')).toBe(true);
    expect(screen.getByTestId('taste-profile-ghee').props.accessibilityState.checked).toBe(true);
    fireEvent.press(cta());
    expect(isChecked('taste-profile-gender-female')).toBe(true);
    expect(isChecked('taste-profile-region-north-indian')).toBe(true);
    expect(isChecked('taste-profile-meal-tiffin')).toBe(true);
    expect(isChecked('taste-profile-hassle-tiffin-timings')).toBe(true);
    expect(screen.getByTestId('taste-profile-hassle-note').props.value).toBe('Late lunch');
  });

  it('asks again for a meal setup saved under the V8 wording', async () => {
    renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({
        'GET /v1/me': () => ({
          ...ME_COMPLETE,
          dietaryPreference: 'vegetarian',
          mealStructure: 'daily-cook-2x',
        }),
      }),
    });

    await screen.findByTestId('taste-profile-name');
    fireEvent.press(cta());
    fireEvent.press(cta());
    fireEvent.press(cta());
    await screen.findByTestId('taste-profile-meals');
    expect(isDisabled('taste-profile-continue')).toBe(true);
  });

  it('returns to the Account hub after an edit, and never diverts to Address', async () => {
    const put = jest.fn(() => savedProfile({ name: 'Asha S' }));
    renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({ 'GET /v1/me': () => ME_COMPLETE, 'PUT /v1/me/profile': put }),
    });

    await answerRequiredSteps('Asha S');
    fireEvent.press(cta());

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith({ ...REQUIRED_ONLY_PAYLOAD, name: 'Asha S' }),
    );
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(mockRouter.replace).not.toHaveBeenCalled();
    // An edit keeps no draft.
    expect(await SecureStore.getItemAsync(DRAFT_KEY)).toBeNull();
  });

  it('falls back to the Account hub after an edit with no history to pop', async () => {
    mockRouter.canGoBack = jest.fn(() => false);
    mockRouter.canDismiss = jest.fn(() => false);
    renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({
        'GET /v1/me': () => ME_COMPLETE,
        'PUT /v1/me/profile': () => savedProfile(),
      }),
    });

    await answerRequiredSteps();
    fireEvent.press(cta());

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/profile'));
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('re-reads the identity after a save so the hub cannot show a stale verdict', async () => {
    const get = jest.fn(() => ME_COMPLETE);
    renderWithRuntime(<ProfileDetailsRoute />, {
      runtime: runtimeWith({ 'GET /v1/me': get, 'PUT /v1/me/profile': () => savedProfile() }),
    });

    await screen.findByTestId('taste-profile-name');
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    await answerRequiredSteps();
    fireEvent.press(cta());

    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1));
  });
});
