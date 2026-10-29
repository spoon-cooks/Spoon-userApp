import { z } from 'zod';

/**
 * Cook Pool DTOs — DEC-085 (V2), V0 `src/cook-pool/pool-service.ts` and the `/v1/me/cooks` routes.
 *
 * Transcribed from the backend's own types (`PoolCookCard`, `PoolMember`, `PoolCookProfile`,
 * `AddCookToPoolResult`), not yet from a live instance.
 *
 * The card is the DEC-082 booking-card projection plus `visitsWithYou`. What the profile and the
 * deck card SHOW is `presentation` (DEC-114): every line, label, shelf and dish, chosen and ordered
 * by the backend. The app draws it as it arrives and adds no copy of its own.
 */

const instant = z.string().datetime({ offset: true });

/**
 * `veg`, `non_veg` or `egg` today. Left open so a category the backend adds later parses — the
 * adapter draws only the categories it has a title for, rather than failing the whole menu.
 */
const dietCategory = z.string();

export const cookSpecialtyDishSchema = z.object({
  /** Stable per cook (`^[a-z0-9][a-z0-9-]{0,63}$`); unique within one cook's dishes. */
  dishKey: z.string(),
  label: z.string(),
  dietCategory,
  displayOrder: z.number().int(),
});

export type CookSpecialtyDishDto = z.infer<typeof cookSpecialtyDishSchema>;

export const poolCookCardSchema = z.object({
  cookId: z.string(),
  profileCode: z.string().nullable(),
  /** "Cook Meera" — the backend's name, honorific included. */
  displayName: z.string(),
  profileImageUrl: z.string().nullable(),
  region: z.string().nullable(),
  languages: z.array(z.string()),
  cuisines: z.array(z.string()),
  specialties: z.array(z.string()).nullable(),
  gender: z.string().nullable(),
  spoonTrained: z.boolean(),
  backgroundVerified: z.boolean(),
  hygieneVerified: z.boolean(),
  /** Unfiltered: outside a booking there is no meal brief to narrow it by. */
  specialtyDishes: z.array(cookSpecialtyDishSchema),
  profileVariant: z.enum(['veg', 'mixed']),
  /** `average` is 0 while `count` is 0 — no rating yet, not a rating of zero. */
  rating: z.object({ average: z.number(), count: z.number().int().nonnegative() }),
  /** Completed visits this cook has made to this household. */
  visitsWithYou: z.number().int().nonnegative(),
  /**
   * This customer's OWN ratings of the cook — "Your rating" (dev note `2226:4211`). Never the
   * overall `rating` above. Null while this household has not rated the cook; absent from a
   * backend that predates it.
   */
  yourRating: z.object({ average: z.number(), count: z.number().int().nonnegative() }).nullish(),
});

export type PoolCookCardDto = z.infer<typeof poolCookCardSchema>;

const profileLineSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  value: z.string(),
  icon: z.string().nullable(),
});

/**
 * DEC-114 — the profile as the backend lays it out: trust marks, caption lines, stat lines, then
 * shelves of dishes, each list in display order. A shelf key the app does not know still draws: its
 * title comes with it.
 */
export const cookProfilePresentationSchema = z.object({
  timeSlot: z.string(),
  badges: z.array(z.string()),
  details: z.array(profileLineSchema),
  stats: z.array(profileLineSchema),
  shelves: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      dishes: z.array(
        z.object({ dishCode: z.string(), name: z.string(), imageUrl: z.string().nullable() }),
      ),
    }),
  ),
});

export type CookProfilePresentationDto = z.infer<typeof cookProfilePresentationSchema>;

/**
 * Absent from a backend that predates DEC-114: the profile then draws the name and photo only,
 * rather than lines the app would have to write itself.
 */
const presentation = cookProfilePresentationSchema.optional();

/**
 * `GET /v1/me/cooks` — the pool, newest first. `count` is what the Recurring unlock counts
 * (DEC-086), available cooks or not.
 *
 * `available: false` is a cook Operations has paused or deactivated. The row stays so the cook
 * does not silently vanish; how the app shows it is an open product question (DEC-085).
 */
export const cookPoolListSchema = z.object({
  cooks: z.array(
    z.object({
      cook: poolCookCardSchema,
      available: z.boolean(),
      addedAt: instant,
    }),
  ),
  count: z.number().int().nonnegative(),
});

export type CookPoolListDto = z.infer<typeof cookPoolListSchema>;

/**
 * `GET /v1/me/cooks/candidates` — Pool selection: cooks who completed a booking for this
 * household, still active, not in the pool; highest rated first. Empty for a new household.
 */
export const cookPoolCandidatesSchema = z.object({
  cooks: z.array(poolCookCardSchema.extend({ presentation })),
});

export type CookPoolCandidatesDto = z.infer<typeof cookPoolCandidatesSchema>;

/** `GET /v1/me/cooks/:cookId` — 404 for a cook the household has neither tried nor pooled. */
export const poolCookProfileSchema = z.object({
  cook: poolCookCardSchema,
  available: z.boolean(),
  inPool: z.boolean(),
  addedAt: instant.nullable(),
  /** The card's dishes grouped by category, in the order the card lists them. */
  dishesByCategory: z.array(
    z.object({ category: dietCategory, dishes: z.array(cookSpecialtyDishSchema) }),
  ),
  presentation,
});

export type PoolCookProfileDto = z.infer<typeof poolCookProfileSchema>;

/** `POST /v1/me/cooks` — 201 when added, 200 when the cook was already in the pool. */
export const addCookToPoolSchema = z.object({
  cookId: z.string(),
  added: z.boolean(),
  addedAt: instant,
  /** Live members after the add. */
  count: z.number().int().nonnegative(),
});

export type AddCookToPoolDto = z.infer<typeof addCookToPoolSchema>;
