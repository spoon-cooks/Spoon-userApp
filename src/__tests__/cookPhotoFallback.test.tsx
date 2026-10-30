import { fireEvent, render, screen } from '@testing-library/react-native';

import { CookCard } from '@ui';
import { HomeBookingBanner } from '@features/home';

/**
 * A hosted cook photo that fails to load falls back to the bundled one.
 *
 * `cook_photo_url` is untyped text on the backend with no validation anywhere, and nothing hosts
 * the images — so the URL is whatever operations pasted in. Until this, a non-null value had
 * already skipped the bundled tier by the time `<Image>` discovered it was dead, which left an
 * empty panel and made a BAD url strictly worse than no url: no url at least reached the bundled
 * cook.
 *
 * The distinction these pin is between ABSENT and FAILED. An absent photo is resolved upstream by
 * the adapters and never reaches the failure path; only a load error swaps the source.
 */

const HOSTED = 'https://cdn.spoonhelp.com/cooks/meera.png';
/*
 * Stand-ins for the bundled assets. `Image.resolveAssetSource` returns nothing under jest's asset
 * mock, so the real constants are undefined here — and what these tests are about is the SWAP,
 * not which file is on the other side of it.
 */
const BUNDLED_CARD = 'bundled://meera-photo.jpg';
const BUNDLED_CUTOUT = 'bundled://asha-cutout.png';

function uriOf(testID: string): string | undefined {
  return screen.getByTestId(testID).props.source?.uri;
}

describe('the booking screen cook card', () => {
  const cook = {
    id: 'cook-1',
    displayName: 'Cook Meera',
    firstName: 'Meera',
  };

  it('shows the hosted photo while it loads', () => {
    render(<CookCard cook={{ ...cook, photoUrl: HOSTED, photoFallbackUrl: BUNDLED_CARD }} />);
    expect(uriOf('cook-card-photo')).toBe(HOSTED);
  });

  it('swaps to the bundled photograph when the hosted one fails', () => {
    render(<CookCard cook={{ ...cook, photoUrl: HOSTED, photoFallbackUrl: BUNDLED_CARD }} />);

    fireEvent(screen.getByTestId('cook-card-photo'), 'error');

    expect(uriOf('cook-card-photo')).toBe(BUNDLED_CARD);
    expect(uriOf('cook-card-photo')).not.toBe(HOSTED);
  });

  it('falls back to initials when a failed photo has nothing behind it', () => {
    // The bundled asset was already the primary (no hosted url), so there is no second source.
    render(<CookCard cook={{ ...cook, photoUrl: BUNDLED_CARD }} />);

    fireEvent(screen.getByTestId('cook-card-photo'), 'error');

    expect(screen.queryByTestId('cook-card-photo')).toBeNull();
    expect(screen.getByText('CM')).toBeTruthy();
  });
});

describe('the Home carousel banner', () => {
  const banner = {
    variant: 'confirmed' as const,
    bookingId: 'bkg-1',
    title: 'Upcoming booking',
    dateLabel: 'Tomorrow, Sep 21',
    timeLabel: '12:00 PM • 1 hr',
    cookName: 'Cook Meera',
    badgeValue: 'Confirmed!',
    destination: { route: '/booking/[id]' as const, bookingId: 'bkg-1', figmaPage: '8a' },
  };

  it('shows the hosted photo while it loads', () => {
    render(
      <HomeBookingBanner
        booking={{ ...banner, cookPhotoUrl: HOSTED, cookPhotoFallbackUrl: BUNDLED_CUTOUT }}
        onOpen={jest.fn()}
      />,
    );
    expect(uriOf('home-upcoming-booking-photo')).toBe(HOSTED);
  });

  it('swaps to the bundled cut-out when the hosted one fails', () => {
    render(
      <HomeBookingBanner
        booking={{ ...banner, cookPhotoUrl: HOSTED, cookPhotoFallbackUrl: BUNDLED_CUTOUT }}
        onOpen={jest.fn()}
      />,
    );

    fireEvent(screen.getByTestId('home-upcoming-booking-photo'), 'error');

    expect(uriOf('home-upcoming-booking-photo')).toBe(BUNDLED_CUTOUT);
  });

  it('draws no photo when a failed one has nothing behind it', () => {
    render(<HomeBookingBanner booking={{ ...banner, cookPhotoUrl: HOSTED }} onOpen={jest.fn()} />);

    fireEvent(screen.getByTestId('home-upcoming-booking-photo'), 'error');

    // The panel renders empty rather than retrying a url that has already failed.
    expect(screen.queryByTestId('home-upcoming-booking-photo')).toBeNull();
  });
});
