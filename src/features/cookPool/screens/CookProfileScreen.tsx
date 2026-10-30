import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { getUserMessage, normalizeError } from '@core/errors';
import { QueryBoundary, ScreenHeader } from '@ui';
import { lightTheme } from '@ui/theme/ThemeProvider';

import { BAND_CURVE_PAGE, TRASH_ICON } from '../art';
import { CookMenu } from '../components/CookMenu';
import { CookProfileHeader } from '../components/CookProfileHeader';
import { RemoveCookDialog } from '../components/RemoveCookDialog';
import { YellowBand } from '../components/YellowBand';
import { useCookPoolActions, useCookProfile, useDishLikes } from '../data';

/**
 * Cook Profile — Figma `cCQlzTeiObQkpVBzwI8mZi` (Spoon — User): `719:1568`, and the remove
 * dialog `848:7494`.
 *
 * Opened from a cook's photo on the pool landing, from Home, and from the assigned cook in a
 * booking. The cook's header, then their menu: sections scroll down the page, each section's
 * dishes sideways, from 16 in on the left to the screen's edge on the right. A dish's heart
 * likes it for the household (`useDishLikes`, DEC-115). For a cook in the pool, the bin asks
 * before taking them out; "Remove" sends the DELETE and leaves (`onRemoved`) once it has gone
 * through — a failure keeps the dialog open with the reason, to try again or keep — and "Keep"
 * stays. Leaving the profile while the dialog is up closes it.
 *
 * A cook Operations has paused (`available: false`) is drawn like any other: how to show one is
 * an open product question (DEC-085), and nothing in the frames marks it.
 */
export interface CookProfileScreenProps {
  readonly cookId: string;
  readonly onBack: () => void;
  /** After the cook is taken out of the pool — back to the landing, which shows the change. */
  readonly onRemoved: () => void;
  readonly testID?: string;
}

export function CookProfileScreen({
  cookId,
  onBack,
  onRemoved,
  testID = 'cook-profile-screen',
}: CookProfileScreenProps) {
  const { state, refetch } = useCookProfile(cookId);
  const dishLikes = useDishLikes();
  const actions = useCookPoolActions();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [bandTop, setBandTop] = useState(DEFAULT_BAND_TOP);
  const inPool = state.status === 'ready' && state.data.inPool;

  // `719:1569` — the band starts at the header's foot (244 on a 54 + 60 + 130 frame).
  const onHeaderLayout = (event: LayoutChangeEvent) => setBandTop(event.nativeEvent.layout.height);

  const closeDialog = () => {
    setConfirmingRemove(false);
    setRemoveError(null);
  };

  // The remove dialog is a native modal, above every screen: leaving the profile (a push, a deep
  // link) closes it, so it never stays up over the screen that opened on top.
  useFocusEffect(
    useCallback(
      () => () => {
        setConfirmingRemove(false);
        setRemoveError(null);
      },
      [],
    ),
  );

  const remove = (removeCookId: string) => {
    if (removing) return;
    setRemoving(true);
    setRemoveError(null);
    actions
      .removeCook(removeCookId)
      .then(() => {
        setRemoving(false);
        setConfirmingRemove(false);
        onRemoved();
      })
      .catch((error: unknown) => {
        setRemoving(false);
        setRemoveError(getUserMessage(normalizeError(error)));
      });
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']} testID={testID}>
      {/* `848:7478` — Nav header 3: back, "Cook Profile", the bin in a 44pt target. */}
      <ScreenHeader
        density="nav"
        title="Cook Profile"
        onBack={onBack}
        trailing={
          inPool ? (
            <Pressable
              onPress={() => setConfirmingRemove(true)}
              accessibilityRole="button"
              accessibilityLabel="Remove from your Cook Pool"
              style={styles.trash}
              testID={`${testID}-remove`}
            >
              <Image source={TRASH_ICON} style={styles.trashIcon} />
            </Pressable>
          ) : null
        }
        testID={`${testID}-header`}
      />
      <QueryBoundary state={state} onRetry={refetch}>
        {(profile) => (
          <>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
            >
              <YellowBand curve={BAND_CURVE_PAGE} top={bandTop} />
              <CookProfileHeader profile={profile} onLayout={onHeaderLayout} />
              <CookMenu
                sections={profile.menu}
                favourites={dishLikes.liked}
                onToggleFavourite={dishLikes.toggle}
                testID={`${testID}-menu`}
              />
            </ScrollView>
            <RemoveCookDialog
              visible={confirmingRemove}
              cookName={profile.name}
              removing={removing}
              errorMessage={removeError}
              onKeep={closeDialog}
              onRemove={() => remove(profile.cookId)}
              testID={`${testID}-dialog`}
            />
          </>
        )}
      </QueryBoundary>
    </SafeAreaView>
  );
}

/** A 130pt header — what one name, one caption and two stats measure. */
const DEFAULT_BAND_TOP = 130;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: lightTheme.colors.surface },
  scroll: { flex: 1 },
  /** The band reaches the bottom of the screen even under a short menu. */
  content: { flexGrow: 1 },
  /** `848:7478` — the bin's 44pt hit area sits 6 from the frame's right edge, past the gutter. */
  trash: {
    marginLeft: 'auto',
    marginRight: -10,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trashIcon: { width: 24, height: 24 },
});
