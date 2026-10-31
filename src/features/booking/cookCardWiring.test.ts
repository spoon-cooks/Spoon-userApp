import { bookingDetailFrom, cookCardVariantFor } from './adapters';
import { bookingDetailResponseSchema } from './api/schemas';
import type { BookingDetailDto } from './api';
import { DEMO_BOOKING_CONFIRMATION } from '@/demo/fixtures/booking';

/**
 * The assigned-cook card wiring: a real booking's cook renders ONLY what the payload carries —
 * never the design fixture underneath the screen copy, and no bundled cook content (DEC-114).
 *
 * The failure this pins: `bookingDetailFrom` used to spread `base.cook` (a designed sample,
 * Asha) under the payload's cook, so a real cook rendered with the sample's home state, dish
 * chips, all three badges and — when the backend sent no photo — the sample's photograph. And
 * when the server sent `cook: null`, the sample itself survived into the view model.
 */

const DETAIL_BODY = {
  id: '3b42ef53-f538-4341-900e-decc37116b2f',
  status: 'assigned',
  slotType: 'scheduled',
  scheduledStart: '2026-08-26T04:30:00.000Z',
  durationMinutes: 60,
  price: {
    amountPaise: 12900,
    durationMinutes: 60,
    serviceAmountPaise: 12900,
    taxRateBps: 500,
    taxAmountPaise: 645,
    totalAmountPaise: 13545,
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
} as const;

const KAVITA_CARD = {
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
} as const;

function detailWithCook(cook: unknown): BookingDetailDto {
  return bookingDetailResponseSchema.parse({ booking: { ...DETAIL_BODY, cook } }).booking;
}

describe('the assigned-cook card is payload-driven', () => {
  it('builds the whole card from the payload and its profileCode, not the fixture', () => {
    const model = bookingDetailFrom({
      base: DEMO_BOOKING_CONFIRMATION,
      dto: detailWithCook(KAVITA_CARD),
    });

    expect(model.cook).toMatchObject({
      id: KAVITA_CARD.cookId,
      displayName: 'Cook Kavita',
      firstName: 'Cook Kavita',
      gender: 'Female',
      cuisine: 'North Indian',
      homeState: 'Odisha',
      languages: ['Hindi', 'Odiya'],
      badges: { spoonTrained: true, backgroundVerified: true, hygienic: true },
      profileVariant: 'veg',
    });
    // The app bundles no cook's dishes or photograph: without them in the payload, the card
    // draws no specialty grid and its initials disc.
    expect(model.cook?.specialties).toBeUndefined();
    expect(model.cook?.pureVegSpecialties).toBeUndefined();
    expect(model.cook?.photoUrl).toBeUndefined();
  });

  it('draws the server photo, with no bundled fallback behind it', () => {
    const hosted = bookingDetailFrom({
      base: DEMO_BOOKING_CONFIRMATION,
      dto: detailWithCook({
        ...KAVITA_CARD,
        profileImageUrl: 'https://cdn.spoonhelp.com/cooks/kavita.png',
      }),
    });

    expect(hosted.cook?.photoUrl).toBe('https://cdn.spoonhelp.com/cooks/kavita.png');
    expect(hosted.cook?.photoFallbackUrl).toBeUndefined();
  });

  it('renders an unknown cook honestly: no badges, no dishes, no borrowed photo', () => {
    const model = bookingDetailFrom({
      base: DEMO_BOOKING_CONFIRMATION,
      dto: detailWithCook({
        cookId: 'unknown-cook',
        displayName: 'Priya',
        profileImageUrl: null,
        region: null,
        languages: [],
        cuisines: [],
        specialties: null,
        gender: null,
        spoonTrained: false,
        backgroundVerified: false,
        hygieneVerified: false,
        specialtyDishes: [],
        profileVariant: 'mixed',
        rating: { average: 0, count: 0 },
      }),
    });

    // A cook without a published profileCode gets NOTHING bundled: initials instead of a
    // photograph, no dish grid, no attribute rows, and above all no unearned trust badges.
    expect(model.cook?.displayName).toBe('Priya');
    expect(model.cook?.photoUrl).toBeUndefined();
    expect(model.cook?.badges).toBeUndefined();
    expect(model.cook?.specialties).toBeUndefined();
    expect(model.cook?.pureVegSpecialties).toBeUndefined();
    expect(model.cook?.homeState).toBeUndefined();
    expect(model.cook?.languages).toBeUndefined();
  });

  it('drops the design sample entirely when the server sends no cook', () => {
    // DEMO_BOOKING_CONFIRMATION carries a designed sample cook; an unassigned booking must
    // not inherit it.
    expect(DEMO_BOOKING_CONFIRMATION.cook).toBeDefined();

    const model = bookingDetailFrom({
      base: DEMO_BOOKING_CONFIRMATION,
      dto: detailWithCook(null),
    });

    expect(model.cook).toBeUndefined();
  });

  it('keeps stale card data from surviving a reassignment', () => {
    // The same booking read twice: first with Kavita, then reassigned to Asha. The second
    // model must carry Asha's identity and content with nothing of Kavita's left over.
    const before = bookingDetailFrom({
      base: DEMO_BOOKING_CONFIRMATION,
      dto: detailWithCook(KAVITA_CARD),
    });
    const after = bookingDetailFrom({
      base: DEMO_BOOKING_CONFIRMATION,
      dto: detailWithCook({
        ...KAVITA_CARD,
        cookId: '82064635-b4d0-5b75-b486-6eb04169713a',
        profileCode: 'COOK_ASHA',
        displayName: 'Cook Asha',
        region: 'West Bengal',
        languages: [],
      }),
    });

    expect(before.cook?.id).not.toBe(after.cook?.id);
    expect(after.cook).toMatchObject({
      displayName: 'Cook Asha',
      firstName: 'Cook Asha',
      homeState: 'West Bengal',
    });
    expect(after.cook?.languages).toBeUndefined();
    expect(after.cook?.specialties).toBeUndefined();
  });
});

describe('the veg/mixed variant is the server’s decision', () => {
  it('maps veg to the pure-veg card mode and mixed to the standard one', () => {
    expect(cookCardVariantFor('veg')).toBe('pureVeg');
    expect(cookCardVariantFor('mixed')).toBe('standard');
    // Absent — an older deployment — keeps the presentation the card has always defaulted to.
    expect(cookCardVariantFor(undefined)).toBe('standard');
  });

  it('changes the variant, and only the variant, when the same cook is projected differently', () => {
    const veg = bookingDetailFrom({
      base: DEMO_BOOKING_CONFIRMATION,
      dto: detailWithCook(KAVITA_CARD),
    });
    const mixed = bookingDetailFrom({
      base: DEMO_BOOKING_CONFIRMATION,
      dto: detailWithCook({ ...KAVITA_CARD, profileVariant: 'mixed' }),
    });

    // Same identity, same content, different projection — the whole V0 rule.
    expect(veg.cook?.id).toBe(mixed.cook?.id);
    expect(veg.cook?.profileVariant).toBe('veg');
    expect(mixed.cook?.profileVariant).toBe('mixed');
    expect(cookCardVariantFor(veg.cook?.profileVariant)).toBe('pureVeg');
    expect(cookCardVariantFor(mixed.cook?.profileVariant)).toBe('standard');
  });
});
