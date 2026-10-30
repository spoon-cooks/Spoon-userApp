import { meResponseSchema, updateProfileResponseSchema } from '@features/auth';
import { isAddressUsable } from '@features/address';

import { parseDraft, profileDetailsFromMe, profileUpdateFrom } from './detailsData';
import { canonicalCuisine } from './fields';
import {
  EMPTY_PROFILE_DETAILS,
  canContinueStep,
  cuisineChipRow,
  cuisineMatches,
  firstIncompleteStep,
  selectDiet,
  selectMealSetup,
  stepCount,
  toggleCuisine,
} from './validation';

/**
 * The profile contract, both directions, and the wizard's rules.
 *
 * These are where a Zod schema could silently STRIP a field the screens need, and where a mapping
 * could silently drop an answer. Both failures are invisible at runtime — the wizard simply opens
 * blank, or a save quietly stores less than the customer chose — so they are asserted structurally.
 */

const WIRE_PROFILE = {
  id: 'user-1',
  role: 'user' as const,
  status: 'active',
  phone: '+919876543210',
  name: 'Aarav Mehta',
  householdStructure: 'bachelors',
  mealStructure: 'regular-cook',
  pressingIssue: 'My cook never varies the menu.',
  dietaryPreference: 'mixed',
  grownUpEating: ['Rajasthani food', 'Bengali'],
  regionPreference: 'south-indian',
  genderPreference: 'male',
  householdAdults: 2,
  householdKids: 1,
  householdElders: 0,
  nonVegPreferences: ['chicken'],
  oilLevel: 'moderate',
  gheeOnly: true,
  mealHassles: ['cook-not-our-taste'],
  profileComplete: true,
};

describe('GET /v1/me projection', () => {
  it('retains every answer and the identity beside them', () => {
    const parsed = meResponseSchema.parse(WIRE_PROFILE);

    // Named individually: a spread comparison would pass even if the schema dropped a key.
    expect(parsed.name).toBe('Aarav Mehta');
    expect(parsed.householdStructure).toBe('bachelors');
    expect(parsed.mealStructure).toBe('regular-cook');
    expect(parsed.pressingIssue).toBe('My cook never varies the menu.');
    expect(parsed.dietaryPreference).toBe('mixed');
    expect(parsed.grownUpEating).toEqual(['Rajasthani food', 'Bengali']);
    expect(parsed.regionPreference).toBe('south-indian');
    expect(parsed.genderPreference).toBe('male');
    expect(parsed.householdAdults).toBe(2);
    expect(parsed.householdKids).toBe(1);
    expect(parsed.householdElders).toBe(0);
    expect(parsed.nonVegPreferences).toEqual(['chicken']);
    expect(parsed.oilLevel).toBe('moderate');
    expect(parsed.gheeOnly).toBe(true);
    expect(parsed.mealHassles).toEqual(['cook-not-our-taste']);
    expect(parsed.profileComplete).toBe(true);
    expect(parsed.phone).toBe('+919876543210');
  });

  it('parses the same shape from the PUT reply, so one form prefills from either call', () => {
    const { id: _id, role: _role, status: _status, phone: _phone, ...profile } = WIRE_PROFILE;
    expect(updateProfileResponseSchema.parse(profile).mealStructure).toBe('regular-cook');
  });

  /** A V0 that has not shipped the wizard's fields yet must still parse: they read as unanswered. */
  it('parses a response without the wizard fields', () => {
    const {
      householdAdults: _a,
      householdKids: _k,
      householdElders: _e,
      nonVegPreferences: _n,
      oilLevel: _o,
      gheeOnly: _g,
      mealHassles: _h,
      ...older
    } = WIRE_PROFILE;
    const parsed = meResponseSchema.parse(older);
    expect(parsed.householdAdults).toBeNull();
    expect(parsed.mealHassles).toBeNull();
  });

  it('survives an option id this build does not know', () => {
    const parsed = meResponseSchema.parse({ ...WIRE_PROFILE, oilLevel: 'heavy' });
    expect(parsed.oilLevel).toBe('heavy');
    expect(profileDetailsFromMe(parsed).oilLevel).toBe('light');
  });
});

describe('prefill', () => {
  it('restores every answer onto the form', () => {
    expect(profileDetailsFromMe(meResponseSchema.parse(WIRE_PROFILE))).toEqual({
      name: 'Aarav Mehta',
      householdAdults: 2,
      householdKids: 1,
      householdElders: 0,
      dietaryPreference: 'mixed',
      nonVegPreferences: ['chicken'],
      // V8's " food" label reads back as today's chip.
      grownUpEating: ['Rajasthani', 'Bengali'],
      oilLevel: 'moderate',
      gheeOnly: true,
      genderPreference: 'male',
      regionPreference: 'south-indian',
      mealStructure: 'regular-cook',
      mealHassles: ['cook-not-our-taste'],
      pressingIssue: 'My cook never varies the menu.',
    });
  });

  it('opens with the defaults for an account that has answered nothing', () => {
    const values = profileDetailsFromMe(
      meResponseSchema.parse({
        ...WIRE_PROFILE,
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
      }),
    );
    expect(values).toEqual(EMPTY_PROFILE_DETAILS);
  });

  it('drops a V8 meal setup and any hassle that does not belong to the stored setup', () => {
    const legacy = profileDetailsFromMe(
      meResponseSchema.parse({ ...WIRE_PROFILE, mealStructure: 'daily-cook-2x' }),
    );
    expect(legacy.mealStructure).toBeNull();
    expect(legacy.mealHassles).toEqual([]);

    const mismatched = profileDetailsFromMe(
      meResponseSchema.parse({ ...WIRE_PROFILE, mealHassles: ['order-costs'] }),
    );
    expect(mismatched.mealHassles).toEqual([]);
  });

  it('reads old cuisine labels back to today’s chips and keeps anything else as stored', () => {
    expect(canonicalCuisine('Odiya food')).toBe('Odia');
    expect(canonicalCuisine('Telangana food')).toBe('Andhra / Telangana');
    expect(canonicalCuisine('Awadhi food')).toBe('UP / Awadhi');
    expect(canonicalCuisine('punjabi')).toBe('Punjabi');
    expect(canonicalCuisine('Grandma’s dal')).toBe('Grandma’s dal');
  });
});

describe('submit', () => {
  it('sends every wizard answer and leaves the V8 household type alone', () => {
    const body = profileUpdateFrom(profileDetailsFromMe(meResponseSchema.parse(WIRE_PROFILE)));

    expect(Object.keys(body).sort()).toEqual([
      'dietaryPreference',
      'genderPreference',
      'gheeOnly',
      'grownUpEating',
      'householdAdults',
      'householdElders',
      'householdKids',
      'mealHassles',
      'mealStructure',
      'name',
      'nonVegPreferences',
      'oilLevel',
      'pressingIssue',
      'regionPreference',
    ]);
  });

  it('trims text, and sends an emptied box as an explicit clear', () => {
    const body = profileUpdateFrom({
      ...EMPTY_PROFILE_DETAILS,
      name: '  Asha S  ',
      pressingIssue: '   ',
    });
    expect(body.name).toBe('Asha S');
    expect(body.pressingIssue).toBeNull();
  });

  it('sends no meat answer at all for a diet without meat', () => {
    const body = profileUpdateFrom({
      ...EMPTY_PROFILE_DETAILS,
      name: 'A',
      dietaryPreference: 'vegetarian',
      nonVegPreferences: ['chicken'],
    });
    expect(body.nonVegPreferences).toBeNull();
  });

  it('sends empty lists as [] rather than null, and copies the caller’s arrays', () => {
    const chips = ['Bengali'];
    const body = profileUpdateFrom({ ...EMPTY_PROFILE_DETAILS, name: 'A', grownUpEating: chips });
    expect(body.grownUpEating).not.toBe(chips);
    expect(body.grownUpEating).toEqual(chips);
    expect(body.mealHassles).toEqual([]);
  });
});

describe('wizard rules', () => {
  const named = { ...EMPTY_PROFILE_DETAILS, name: 'A' };

  it('requires the name, a diet and a meal setup, and nothing else', () => {
    expect(canContinueStep('family', EMPTY_PROFILE_DETAILS)).toBe(false);
    expect(canContinueStep('family', named)).toBe(true);
    expect(canContinueStep('diet', named)).toBe(false);
    expect(canContinueStep('taste', named)).toBe(true);
    expect(canContinueStep('cook', named)).toBe(false);
    expect(firstIncompleteStep(named)).toBe('diet');
    expect(firstIncompleteStep({ ...named, dietaryPreference: 'vegan' })).toBe('cook');
  });

  it('bounds the household counts', () => {
    expect(stepCount(named, 'householdAdults', -1).householdAdults).toBe(1);
    expect(stepCount(named, 'householdKids', -1).householdKids).toBe(0);
    expect(stepCount({ ...named, householdElders: 50 }, 'householdElders', 1).householdElders).toBe(
      50,
    );
  });

  it('keeps the meat list only across meat-eating diets', () => {
    const meat = { ...named, dietaryPreference: 'non-vegetarian', nonVegPreferences: ['pork'] };
    expect(selectDiet(meat, 'mixed').nonVegPreferences).toEqual(['pork']);
    expect(selectDiet(meat, 'jain').nonVegPreferences).toEqual([]);
    expect(selectDiet(meat, 'non-vegetarian')).toBe(meat);
  });

  it('caps the cuisines at five and floats chosen ones to the front', () => {
    let values = named;
    for (const label of ['Sindhi', 'Punjabi', 'Parsi', 'Goan', 'Tamil', 'Kerala']) {
      values = toggleCuisine(values, label);
    }
    expect(values.grownUpEating).toEqual(['Sindhi', 'Punjabi', 'Parsi', 'Goan', 'Tamil']);
    expect(cuisineChipRow(['Sindhi']).slice(0, 2)).toEqual(['Sindhi', 'Punjabi']);
    expect(cuisineChipRow([])).toHaveLength(10);
    expect(cuisineMatches('', [])).toEqual([]);
    expect(cuisineMatches('bohri', [])).toEqual(['Bohri / Memon']);
  });

  it('clears the hassles when the meal setup changes', () => {
    const cook = { ...named, mealStructure: 'regular-cook', mealHassles: ['cook-skips-or-late'] };
    expect(selectMealSetup(cook, 'tiffin').mealHassles).toEqual([]);
    expect(selectMealSetup(cook, 'regular-cook')).toBe(cook);
  });
});

describe('draft', () => {
  it('reads a stored draft, filling what it lacks with the defaults', () => {
    const draft = parseDraft(
      JSON.stringify({ version: 1, step: 'taste', values: { name: 'A', householdKids: 2 } }),
    );
    expect(draft?.step).toBe('taste');
    expect(draft?.values).toEqual({ ...EMPTY_PROFILE_DETAILS, name: 'A', householdKids: 2 });
  });

  it('ignores a malformed draft and fields of the wrong shape', () => {
    expect(parseDraft('not json')).toBeNull();
    expect(parseDraft(JSON.stringify({ step: 'cook' }))).toBeNull();
    const draft = parseDraft(
      JSON.stringify({ step: 'elsewhere', values: { householdKids: 'two', grownUpEating: [3] } }),
    );
    expect(draft).toEqual({ step: 'family', values: EMPTY_PROFILE_DETAILS });
  });
});

describe('per-address serviceability', () => {
  const address = (status: string) => ({ serviceability: { status } }) as never;

  it('treats a serviceable address as usable', () => {
    expect(isAddressUsable(address('serviceable'))).toBe(true);
  });

  /**
   * A paused hub is not a reason to demand another address.
   *
   * The contract's own words: `temporarily_unavailable` means a hub polygon covers the address
   * but the hub is paused, and it is "expected to work again". Sending the customer to the map
   * would ask them to pin a new point in the same paused area, which refuses for the same reason.
   */
  it('keeps a temporarily unavailable address usable', () => {
    expect(isAddressUsable(address('temporarily_unavailable'))).toBe(true);
  });

  it('treats an out-of-area address as unusable', () => {
    expect(isAddressUsable(address('outside_service_area'))).toBe(false);
  });
});
