import type {
  CookPoolCandidatesDto,
  CookPoolListDto,
  CookProfilePresentationDto,
  PoolCookCardDto,
  PoolCookProfileDto,
} from './api';
import type {
  CookDish,
  CookMenuSection,
  CookPoolImage,
  CookPoolSummary,
  CookProfile,
  CookProfileLine,
} from './types';

/**
 * DTO → view model, for the landing (`719:1507`), the deck card (`755:2347`) and the profile
 * (`719:1568`).
 *
 * The profile's content and order are the backend's (DEC-114): the trust marks, the lines under
 * the name with their labels, the shelves and their dishes all arrive in `presentation`, and are
 * drawn as they arrive. The app writes no copy about a cook and bundles no cook's content.
 */

/**
 * The pool's minimum when Recurring's eligibility has not answered: the design's 2 (`844:5842`).
 * The backend's `unlockThreshold` replaces it as soon as it is read.
 */
export const DEFAULT_MINIMUM_SIZE = 2;

/** `Cook Meera` → `Meera`: the pool grid's caption. Mirrors the booking card's first name. */
export function shortNameOf(displayName: string): string {
  return displayName.replace(/^Cook\s+/iu, '');
}

/** The hosted photo, or none: the place keeps its `#FFF7CC` ground. */
export function cookPhotoFor(
  card: Pick<PoolCookCardDto, 'profileImageUrl'>,
): CookPoolImage | undefined {
  return card.profileImageUrl === null ? undefined : { uri: card.profileImageUrl };
}

export function cookPoolSummaryFrom(pool: CookPoolListDto, minimumSize: number): CookPoolSummary {
  return {
    minimumSize,
    members: pool.cooks.map(({ cook }) => ({
      cookId: cook.cookId,
      name: shortNameOf(cook.displayName),
      photo: cookPhotoFor(cook),
    })),
  };
}

/** `label: value` lines arrive with a null label for "the value alone". */
function lineFrom(line: CookProfilePresentationDto['details'][number]): CookProfileLine {
  return {
    id: line.id,
    value: line.value,
    ...(line.label === null ? {} : { label: line.label }),
    ...(line.icon === null ? {} : { icon: line.icon }),
  };
}

function profileFrom(
  card: PoolCookCardDto,
  inPool: boolean,
  presentation: CookProfilePresentationDto | undefined,
): CookProfile {
  return {
    cookId: card.cookId,
    name: card.displayName,
    photo: cookPhotoFor(card),
    badges: presentation?.badges ?? [],
    details: presentation?.details.map(lineFrom) ?? [],
    stats: presentation?.stats.map(lineFrom) ?? [],
    menu:
      presentation?.shelves.map((shelf): CookMenuSection => ({
        id: shelf.id,
        title: shelf.title,
        dishes: shelf.dishes.map((dish): CookDish => ({
          // Dish favourites are keyed by this id (`favourites.ts`).
          id: dish.dishCode,
          name: dish.name,
          ...(dish.imageUrl === null ? {} : { image: { uri: dish.imageUrl } }),
        })),
      })) ?? [],
    inPool,
  };
}

/** One deck card per candidate, in the backend's order. A candidate is never in the pool. */
export function deckCooksFrom(candidates: CookPoolCandidatesDto['cooks']): readonly CookProfile[] {
  return candidates.map((card) => profileFrom(card, false, card.presentation));
}

export function cookProfileFrom(profile: PoolCookProfileDto): CookProfile {
  return profileFrom(profile.cook, profile.inPool, profile.presentation);
}
