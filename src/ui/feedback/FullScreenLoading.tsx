import { useEffect, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';

import { TossLoading } from './TossLoading';

/**
 * The full-screen wait, drawn edge to edge (device test, 31 Oct 2026).
 *
 * A screen's first read shows the toss through `LoadingState variant="screen"`, but that sits
 * inside the screen's own frame — its safe-area padding, its side gutters, a ScrollView's content
 * — so it stopped short of the edges on every screen that wraps its `QueryBoundary` (Completed
 * bookings, Saved addresses, Profile …). Rather than unwrap each host, the toss is drawn once, by
 * `FullScreenLoadingHost` at the root of the app, over the whole window; a waiting screen only
 * asks for it (`useFullScreenLoading`) for as long as it is mounted and waiting.
 *
 * Android back still reaches the screen underneath — the host is a plain view, not a Modal — so a
 * wait the customer gives up on is left the usual way, and leaving unmounts the request.
 *
 * Without a host (tests, the boot gate's own splash) the toss is drawn in place, as before.
 */

interface Request {
  readonly id: number;
  readonly label: string;
}

let requests: readonly Request[] = [];
let hosts = 0;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getRequests = () => requests;
const getHosted = () => hosts > 0;

/**
 * Asks the root host to cover the screen while the caller is mounted. Returns whether a host is
 * there to do it; when not, the caller draws the toss itself.
 */
export function useFullScreenLoading(label: string): boolean {
  const hosted = useSyncExternalStore(subscribe, getHosted, getHosted);
  useEffect(() => {
    if (!hosted) return undefined;
    const request = { id: nextId++, label };
    requests = [...requests, request];
    emit();
    return () => {
      requests = requests.filter((entry) => entry.id !== request.id);
      emit();
    };
  }, [hosted, label]);
  return hosted;
}

/** Mounted once, last in the app's root, so it draws over every screen, header and status bar. */
export function FullScreenLoadingHost() {
  const current = useSyncExternalStore(subscribe, getRequests, getRequests);
  useEffect(() => {
    hosts += 1;
    emit();
    return () => {
      hosts -= 1;
      emit();
    };
  }, []);
  const newest = current[current.length - 1];
  if (newest === undefined) return null;
  return (
    <View style={StyleSheet.absoluteFill} testID="full-screen-loading">
      <TossLoading label={newest.label} />
    </View>
  );
}
