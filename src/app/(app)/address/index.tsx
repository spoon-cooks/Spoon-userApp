import { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';

import {
  SavedAddressesScreen,
  savedListFrom,
  useAddresses,
  useDeleteAddress,
  useSetDefaultAddress,
  useTriedPlace,
} from '@features/address';
import type { AddressToastNotice } from '@features/address';
import { useMe } from '@features/auth';
import { useJoinWaitlist, useWaitlistState } from '@features/homeRedesign';
import { getUserMessage, isAppError } from '@core/errors';
import { useNavigationGuard, useSafeBack } from '@core/navigation';
import { InfoDialog, QueryBoundary } from '@ui';

/**
 * Saved addresses — Figma `1870:2770` with the Remove sheet from `1870:2857` (dev notes
 * `2075:11950`, `2075:11957`).
 *
 * ## Choosing versus browsing
 *
 * Tapping a row makes it the address bookings use, whether the list was opened from Home's
 * switcher (`from=home`) or the profile (`from=profile`): the owner asked for this on 2026-10-14,
 * replacing the dev note's "a row tap does nothing" from the profile. The address in use carries
 * "Current selection", and tapping it again sends nothing. Choosing is `PUT … { isDefault: true }`,
 * the server's own flag; the kebab is the only way into Edit (`d51f326`).
 *
 * ## Removing
 *
 * The server decides: it refuses an address an upcoming booking uses (`ADDRESS_IN_USE`) and, when
 * the removed address was the one in use, promotes the next most recently used. The list is
 * refetched by the mutation either way, so it always shows the server's answer.
 */
export default function SavedAddressesRoute() {
  const router = useRouter();
  const { from, saved } = useLocalSearchParams<{ from?: string; saved?: string }>();
  const addresses = useAddresses();
  const remove = useDeleteAddress();
  const setDefault = useSetDefaultAddress();
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  // Arrived from a successful save on Address details: the list opens saying so, once.
  const [notice, setNotice] = useState<AddressToastNotice | null>(() =>
    saved === '1' ? { id: 1, message: 'Address saved' } : null,
  );
  const toast = (message: string) =>
    setNotice((previous) => ({ id: (previous?.id ?? 0) + 1, message }));

  const choosing = from === 'home';
  const backTarget: Href = from === 'home' ? '/home' : '/profile';
  const goBack = useSafeBack(backTarget);
  // One screen per tap: a quick double tap must not open the same screen twice.
  const guard = useNavigationGuard();

  const state = useMemo(() => {
    if (addresses.state.status !== 'ready') return addresses.state;
    return {
      status: 'ready' as const,
      data: savedListFrom(addresses.state.data, choosing ? 'choose' : 'browse'),
    };
  }, [addresses.state, choosing]);

  /*
   * No saved address and a last place outside every live hub (`2355:6094`, dev note `2355:14298`):
   * that place's area and live hubs (remembered on this device by the map step) and the waitlist
   * state, the same data as Home's inactive-pincode variant. No place ever captured: no card.
   */
  const me = useMe();
  const meData = me.state.status === 'ready' ? me.state.data : null;
  const tried = useTriedPlace(meData?.id ?? null);
  const waitlist = useWaitlistState({ enabled: tried !== null && tried !== undefined });
  const join = useJoinWaitlist();
  const waitlistData = waitlist.state.status === 'ready' ? waitlist.state.data : null;
  const notLive =
    tried === null || tried === undefined
      ? null
      : {
          locality: tried.locality,
          liveAreas: tried.liveAreas,
          waiting: waitlistData?.countForArea ?? tried.neighbours + 1,
          notify:
            waitlistData?.joined === true
              ? ('joined' as const)
              : join.isPending
                ? ('pending' as const)
                : ('idle' as const),
          onNotify: () => {
            const name = meData?.name?.trim() || meData?.phone || 'Spoon customer';
            join
              .mutateAsync({ name, addressId: null, pincode: null })
              .catch(() => toast('Couldn’t add you to the list. Please try again.'));
          },
        };

  return (
    <>
      <QueryBoundary state={state} onRetry={addresses.refetch} loadingVariant="screen">
        {(list) => (
          <SavedAddressesScreen
            addresses={list}
            onBack={guard(goBack)}
            notice={notice}
            notLive={notLive}
            onAdd={guard(() =>
              router.push(
                (from === undefined
                  ? '/address/location'
                  : `/address/location?from=${from}`) as Href,
              ),
            )}
            onSelect={(id: string) => {
              if (list.find((address) => address.id === id)?.tag !== null) return;
              setDefault.mutateAsync(id).catch((thrown: unknown) => {
                setError({
                  title: 'Couldn’t switch address',
                  body: isAppError(thrown)
                    ? getUserMessage(thrown)
                    : 'We could not switch to this address.',
                });
              });
            }}
            // Edit starts on the map, on the address's own pin (owner, 31 Oct 2026); Confirm then
            // opens the details form for the same address, as adding one does.
            onEdit={guard((id: string) =>
              router.push(
                (from === undefined
                  ? `/address/location?addressId=${id}`
                  : `/address/location?addressId=${id}&from=${from}`) as Href,
              ),
            )}
            onRemove={async (id) => {
              try {
                await remove.mutateAsync(id);
                toast('Address removed');
                return 'removed';
              } catch (thrown: unknown) {
                return isAppError(thrown) && thrown.code === 'ADDRESS_IN_USE' ? 'in_use' : 'failed';
              }
            }}
          />
        )}
      </QueryBoundary>

      <InfoDialog
        visible={error !== null}
        onClose={() => setError(null)}
        title={error?.title ?? ''}
        body={error?.body ?? ''}
        testID="address-action-error"
      />
    </>
  );
}
