import { bookingCookSchema, bookingDetailResponseSchema } from './schemas';

/**
 * The assigned-cook projection, parsed from what the DEPLOYED backend actually sends.
 *
 * These payloads are transcribed from `GET /v1/bookings/3b42ef53-…` on
 * `spoon-api-kalc.onrender.com` for the real seeded booking — not from a guess about the shape.
 * The schema that shipped described a cook with `id`/`name`/`photoUrl` and a numeric `rating`,
 * none of which the backend sends, and the numeric `rating` made the parse THROW rather than
 * merely come back empty. That took the whole booking-detail read down and, with it, Home's
 * Upcoming banner.
 */

/** Verbatim from the deployed response. */
const REAL_COOK = {
  cookId: '82064635-b4d0-5b75-b486-6eb04169713a',
  displayName: 'Test Cook 2',
  profileImageUrl: null,
  region: null,
  languages: [],
  cuisines: [],
  specialties: null,
  gender: null,
  spoonTrained: false,
  backgroundVerified: false,
  specialtyDishes: [],
  rating: { average: 5, count: 10 },
};

describe('the cook the deployed backend sends', () => {
  it('parses, where it previously threw on the rating object', () => {
    const parsed = bookingCookSchema.safeParse(REAL_COOK);

    expect(parsed.success).toBe(true);
  });

  it('carries the cook through under the names every reader uses', () => {
    const cook = bookingCookSchema.parse(REAL_COOK);

    // The three fields the banner and the detail screen read. All were silently dropped before.
    expect(cook.id).toBe('82064635-b4d0-5b75-b486-6eb04169713a');
    expect(cook.name).toBe('Test Cook 2');
    expect(cook.rating).toBe(5);
    expect(cook.ratingCount).toBe(10);
  });

  it('reports a missing photo as absent, not as a broken cook', () => {
    const cook = bookingCookSchema.parse(REAL_COOK);

    // `profileImageUrl: null` is normal — most seeded cooks have no artwork. It must leave the
    // rest of the cook intact so the banner still renders with a name.
    expect(cook.photoUrl).toBeNull();
    expect(cook.name).toBe('Test Cook 2');
  });

  it('still accepts an older deployment that used the previous spellings', () => {
    const cook = bookingCookSchema.parse({
      id: 'legacy-id',
      name: 'Legacy Cook',
      photoUrl: 'https://example.test/cook.png',
      rating: 4.5,
    });

    expect(cook.id).toBe('legacy-id');
    expect(cook.name).toBe('Legacy Cook');
    expect(cook.rating).toBe(4.5);
    expect(cook.photoUrl).toBe('https://example.test/cook.png');
  });

  it('accepts a booking whose cook has not been assigned yet', () => {
    // `cook: null` is the pre-assignment state and must not be an error.
    expect(bookingCookSchema.nullable().parse(null)).toBeNull();
  });
});

/**
 * The typed `CustomerCookCard` the four-cook backend publishes: stable identity, the drawn
 * attributes, all three attested badges and the server-decided veg/mixed presentation variant.
 * These fields used to be silently STRIPPED by the schema, which is exactly how a real cook
 * ended up rendered inside a design fixture's attributes.
 */
describe('the four-cook card the backend now publishes', () => {
  const FOUR_COOK_CARD = {
    cookId: 'd680481b-4ffe-55b1-9edf-74b746a43bba',
    profileCode: 'COOK_KAVITA',
    displayName: 'Cook Kavita',
    profileImageUrl: null,
    region: 'Odisha',
    languages: ['Hindi', 'Odiya'],
    cuisines: ['North Indian'],
    specialties: ['Chicken curry', 'Mutton masala'],
    gender: 'Female',
    spoonTrained: true,
    backgroundVerified: true,
    hygieneVerified: true,
    specialtyDishes: [],
    profileVariant: 'veg',
    rating: { average: 5, count: 10 },
  };

  it('carries the stable identity and the presentation variant through the parse', () => {
    const cook = bookingCookSchema.parse(FOUR_COOK_CARD);

    // The two fields the whole wiring hangs off: bundled card content resolves by
    // `profileCode`, and the card mode renders whatever variant the SERVER decided.
    expect(cook.profileCode).toBe('COOK_KAVITA');
    expect(cook.profileVariant).toBe('veg');
  });

  it('no longer strips the drawn attributes or the attested badges', () => {
    const cook = bookingCookSchema.parse(FOUR_COOK_CARD);

    expect(cook.region).toBe('Odisha');
    expect(cook.languages).toEqual(['Hindi', 'Odiya']);
    expect(cook.cuisines).toEqual(['North Indian']);
    expect(cook.gender).toBe('Female');
    expect(cook.spoonTrained).toBe(true);
    expect(cook.backgroundVerified).toBe(true);
    expect(cook.hygieneVerified).toBe(true);
  });

  it('treats an older deployment without the new fields as absent, never as invented', () => {
    const cook = bookingCookSchema.parse(REAL_COOK);

    expect(cook.profileCode).toBeNull();
    expect(cook.profileVariant).toBeNull();
    expect(cook.region).toBeNull();
    expect(cook.gender).toBeNull();
    // `false` from the deployed payload stays false — a badge is never granted client-side.
    expect(cook.spoonTrained).toBe(false);
    expect(cook.hygieneVerified).toBeNull();
  });

  it('refuses an unknown variant rather than guessing a presentation', () => {
    const parsed = bookingCookSchema.safeParse({
      ...FOUR_COOK_CARD,
      profileVariant: 'jain-special',
    });

    expect(parsed.success).toBe(false);
  });
});

/** The full response, so the failure that actually broke Home is pinned end to end. */
describe('the booking detail that carries that cook', () => {
  const REAL_DETAIL = {
    booking: {
      id: '3b42ef53-f538-4341-900e-decc37116b2f',
      status: 'assigned',
      slotType: 'scheduled',
      scheduledStart: '2026-08-26T04:30:00.000Z',
      durationMinutes: 30,
      price: {
        amountPaise: 7245,
        durationMinutes: 30,
        serviceAmountPaise: 6900,
        taxRateBps: 500,
        taxAmountPaise: 345,
        totalAmountPaise: 7245,
        currency: 'INR',
        pricingVersion: 'pricing-policy-v0',
      },
      address: {
        label: 'Home',
        latitude: 12.9011578,
        longitude: 77.6511529,
        flat: null,
        tower: null,
        society: null,
        street: 'HSR Sector 2',
        pincode: '560102',
        city: 'Bengaluru',
        state: 'Karnataka',
        hubName: 'MM00001 - HSR Sec 2',
        receiverName: null,
        receiverPhone: null,
      },
      mealNotes: null,
      referenceUrl: null,
      mealBrief: null,
      cook: REAL_COOK,
      timing: { arrivedAt: null, actualStart: null, expectedEnd: null, actualEnd: null },
      reassignment: { occurred: false, sequence: 0, reassignedAt: null },
      cancellation: null,
      tip: null,
      allowedActions: {
        canCancel: true,
        canReschedule: true,
        canExtend: false,
        canRate: false,
        canTip: false,
        canCallCook: true,
      },
    },
  };

  it('parses the real confirmed booking', () => {
    const parsed = bookingDetailResponseSchema.safeParse(REAL_DETAIL);

    // This is the exact read whose failure emptied Home. If it throws, no banner renders and
    // nothing on the screen explains why.
    expect(parsed.success).toBe(true);
  });

  it('gives Home the cook name the banner draws', () => {
    const detail = bookingDetailResponseSchema.parse(REAL_DETAIL).booking;

    expect(detail.status).toBe('assigned');
    expect(detail.cook?.name).toBe('Test Cook 2');
  });
});
