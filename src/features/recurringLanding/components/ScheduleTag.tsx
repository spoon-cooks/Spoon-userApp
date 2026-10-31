import { Image, Pressable, StyleSheet } from 'react-native';

import { Text } from '@ui';
import { lightTheme } from '@ui/theme/ThemeProvider';

import { CALENDAR_ADD_ICON, RESTART_ICON } from '../art';

/**
 * What the page's Recurring buttons (this tag and the sticky footer) offer, from eligibility's
 * `chip` — the same answer Home's chip reads:
 *   `book`    "Book Recurring", opens the plan flow
 *   `locked`  "Book Recurring", disabled: the Cook Pool is below the unlock (Home: "Check Recurring")
 *   `live`    "Recurring · Live", opens the live booking (Home: "Recurring · Live")
 */
export type RecurringCta = 'book' | 'locked' | 'live';

/** The buttons' label for each state. */
export const RECURRING_CTA_LABEL: Record<RecurringCta, string> = {
  book: 'Book Recurring',
  locked: 'Book Recurring',
  live: 'Recurring · Live',
};

/**
 * "Top CTA" — `983:6074`: the lime "Book Recurring" tag (`983:6077`) that hangs off the thread's knot at the top
 * of the page. A pill (`#CFFF04`, pl 12 / pr 14 / py 10, 6 between a 24pt calendar-plus and a
 * Livvic Bold 16/24 label) with `Elevation/2` under it. It is the page's one "schedule" button
 * while it is on screen; once it has scrolled away the sticky footer takes over (`stickyFooter.ts`).
 *
 * Locked, it is the same pill greyed, flat and not pressable; live, it reads "Recurring · Live"
 * behind the circular arrow of Home's Live chip.
 */
export interface ScheduleTagProps {
  readonly onPress: () => void;
  readonly cta?: RecurringCta;
  readonly testID?: string;
}

export function ScheduleTag({ onPress, cta = 'book', testID = 'schedule-tag' }: ScheduleTagProps) {
  const locked = cta === 'locked';
  const label = RECURRING_CTA_LABEL[cta];
  return (
    <Pressable
      onPress={onPress}
      disabled={locked}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: locked }}
      style={[styles.pill, locked ? styles.pillLocked : null]}
      testID={testID}
    >
      <Image
        source={cta === 'live' ? RESTART_ICON : CALENDAR_ADD_ICON}
        style={[styles.icon, locked ? styles.iconLocked : null]}
      />
      <Text variant="headingBold" color={locked ? 'textDisabledSoft' : 'textPrimary'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lightTheme.space.s6,
    paddingLeft: lightTheme.space.md,
    paddingRight: 14,
    paddingVertical: lightTheme.space.s10,
    borderRadius: lightTheme.radius.pill,
    backgroundColor: lightTheme.colors.surfacePositiveBright,
    ...lightTheme.elevation.tag,
  },
  pillLocked: {
    backgroundColor: lightTheme.colors.surfaceCtaDisabled,
    shadowOpacity: 0,
    elevation: 0,
  },
  icon: { width: 24, height: 24 },
  iconLocked: { tintColor: lightTheme.colors.textDisabledSoft },
});
