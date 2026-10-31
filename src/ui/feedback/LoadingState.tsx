import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Card } from '@ui/primitives/Card';
import { Text } from '@ui/primitives/Text';
import { lightTheme } from '@ui/theme/ThemeProvider';

import { useFullScreenLoading } from './FullScreenLoading';
import { Skeleton } from './Skeleton';
import { TossLoading } from './TossLoading';

/**
 * Loading states.
 *
 * `spinner` — indeterminate work with no known shape (submitting, checking availability).
 * `card`    — placeholder for a list of cards (booking history, refunds, saved addresses).
 * `screen`  — a full surface while the first payload resolves: the toss (`2692:864`,
 *             `TossLoading`), the same screen the app opens on. Drawn edge to edge by the
 *             root's `FullScreenLoadingHost`, not inside the screen's padded frame.
 *
 * LOADING RULE (owner, 30 Oct 2026): every full-screen wait shows the toss — the app opening
 * (`SplashLoading` at the boot gate) and any screen whose first read is in flight, which is what
 * `QueryBoundary` draws by default. Waits inside a screen stay scoped: a CTA or inline spinner,
 * or card skeletons for a list. This replaces the earlier rule that kept the branded screen to
 * the app opening alone (task §13 / §25).
 *
 * Announced politely so a screen reader says something is happening rather than going silent.
 */

export type LoadingVariant = 'spinner' | 'card' | 'screen';

export interface LoadingStateProps {
  readonly variant?: LoadingVariant;
  /** Neutral by default: no backend-specific copy exists yet. */
  readonly label?: string;
  /** Number of placeholder cards for the `card` variant. */
  readonly count?: number;
  readonly testID?: string;
}

export function LoadingState({
  variant = 'spinner',
  label = 'Loading',
  count = 3,
  testID,
}: LoadingStateProps) {
  if (variant === 'card') {
    return (
      <View
        testID={testID}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityState={{ busy: true }}
        style={styles.list}
      >
        {Array.from({ length: count }, (_unused, index) => (
          <Card key={index} tone="surface" testID={`${testID ?? 'loading'}-card-${index}`}>
            <View style={styles.cardBody}>
              <Skeleton width="45%" height={lightTheme.space.md} />
              <Skeleton width="70%" height={lightTheme.space.lg} />
              <Skeleton width="30%" height={lightTheme.space.md} />
            </View>
          </Card>
        ))}
      </View>
    );
  }

  if (variant === 'screen') {
    return <ScreenLoading label={label} {...(testID === undefined ? {} : { testID })} />;
  }

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={styles.inline}
    >
      <ActivityIndicator size="small" color={SPINNER_COLOR} />
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

/** The toss over the whole window through the root host, or in place when there is none. */
function ScreenLoading({ label, testID }: { readonly label: string; readonly testID?: string }) {
  const hosted = useFullScreenLoading(label);
  if (hosted) return <View style={styles.screenHold} testID={testID} />;
  return <TossLoading label={label} {...(testID === undefined ? {} : { testID })} />;
}

const SPINNER_COLOR = lightTheme.colors.textSecondary;

const styles = StyleSheet.create({
  /** Holds the screen's place while the host draws the toss over everything. */
  screenHold: { flex: 1 },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.space.sm,
    paddingVertical: lightTheme.space.md,
  },
  list: { gap: lightTheme.space.md },
  cardBody: { gap: lightTheme.space.sm },
});
