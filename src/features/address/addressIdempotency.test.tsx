import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { IDEMPOTENCY_HEADER, createIdempotencyScope, idempotency } from '@core/api';
import { RuntimeProvider } from '@core/runtimeContext';
import type { AppRuntime } from '@core/runtime';
import { createStubApi, createTestRuntime } from '@/test/renderWithRuntime';

import { addressCreateScope, useCreateAddress } from './api';
import type { AddressWriteInput } from './api';

/**
 * The `Idempotency-Key` for a saved address must name the SUBMISSION, not the pin.
 *
 * The scope used to be `address.create:<lat>,<lon>`. Coordinates are the part of the form a
 * customer is least likely to change between attempts, so the key survived exactly the edits it
 * should not have: a failed save, a corrected flat number, and a retry carrying the ORIGINAL key
 * with a different body. The backend refuses that with `IDEMPOTENCY_CONFLICT` — correctly, since
 * a key names one request — and because the key is released only on success, the screen was then
 * stuck on a key it could neither reuse nor rotate. Reproduced on the handset before this fix.
 *
 * Both halves matter and they pull in opposite directions, which is why they are asserted
 * together: an UNCHANGED retry must reuse the key — that is the entire recovery mechanism for an
 * ambiguous network result — and ANY changed field must rotate it.
 *
 * That the screen still renders exactly as before is covered where it already was, by
 * `src/__tests__/routes.test.tsx`, which mounts this route and asserts its rendered tree.
 */

const BASE: AddressWriteInput = {
  label: 'Home',
  street: '27th Main Rd',
  pincode: '560102',
  latitude: 12.902429,
  longitude: 77.649321,
  flat: 'A101',
  society: 'Tower1',
  city: 'Bengaluru',
  state: 'Karnataka',
  receiverName: 'Aarav Mehta',
  receiverPhone: '+919876543210',
};

/** The key the transport would actually send for a given submission. */
function keyFor(input: AddressWriteInput, store = createIdempotencyScope()) {
  return store.keyFor(addressCreateScope(input));
}

describe('the create scope', () => {
  /** 1 — the recovery case. */
  it('reuses the key when the submission is unchanged', () => {
    const store = createIdempotencyScope();
    // Distinct objects with identical values: a retry REBUILDS the payload from form state, it
    // does not resubmit the same reference, so identity cannot be what makes this work.
    expect(keyFor({ ...BASE }, store)).toBe(keyFor({ ...BASE }, store));
  });

  /** 2 */
  it('rotates the key when the flat number changes', () => {
    const store = createIdempotencyScope();
    expect(keyFor(BASE, store)).not.toBe(keyFor({ ...BASE, flat: 'A102' }, store));
  });

  /** 3 */
  it('rotates the key when the building changes', () => {
    const store = createIdempotencyScope();
    expect(keyFor(BASE, store)).not.toBe(keyFor({ ...BASE, society: 'Tower2' }, store));
  });

  /** 4 */
  it('rotates the key when the label changes', () => {
    const store = createIdempotencyScope();
    expect(keyFor(BASE, store)).not.toBe(keyFor({ ...BASE, label: 'Parents' }, store));
  });

  /** 5 */
  it('rotates the key when the receiver name or phone changes', () => {
    const store = createIdempotencyScope();
    const base = keyFor(BASE, store);
    expect(base).not.toBe(keyFor({ ...BASE, receiverName: 'Asha S' }, store));
    expect(base).not.toBe(keyFor({ ...BASE, receiverPhone: '+919000000001' }, store));
  });

  /** 6 — the field the old scope watched, which must still rotate. */
  it('rotates the key when the coordinates change', () => {
    const store = createIdempotencyScope();
    const base = keyFor(BASE, store);
    expect(base).not.toBe(keyFor({ ...BASE, latitude: 12.9 }, store));
    expect(base).not.toBe(keyFor({ ...BASE, longitude: 77.65 }, store));
  });

  /**
   * Clearing a field is an edit like any other.
   *
   * `bodyOf` OMITS an absent optional rather than sending null, so removing the receiver changes
   * which keys the body carries — a different request, and a different intent.
   */
  it('rotates the key when an optional field is cleared', () => {
    const store = createIdempotencyScope();
    const { receiverName: _cleared, ...withoutReceiver } = BASE;
    expect(keyFor(BASE, store)).not.toBe(keyFor(withoutReceiver, store));
  });

  /**
   * Sorting is what makes the conditional spreads in `bodyOf` harmless: the order optional fields
   * happen to be assembled in must not look like a different intent.
   */
  it('is stable regardless of the order the payload was assembled in', () => {
    const store = createIdempotencyScope();
    // Reversed rather than hand-listed, so this cannot quietly stop being a REORDERING the day
    // a field is added to `AddressWriteInput`.
    const reordered = Object.fromEntries(Object.entries(BASE).reverse()) as AddressWriteInput;
    expect(Object.keys(reordered)).not.toEqual(Object.keys(BASE));
    expect(keyFor(BASE, store)).toBe(keyFor(reordered, store));
  });

  /** Nothing time-based: the same intent an hour later is still the same intent. */
  it('carries no timestamp or attempt counter', () => {
    expect(addressCreateScope(BASE)).toBe(addressCreateScope({ ...BASE }));
    expect(addressCreateScope(BASE)).not.toMatch(/\d{13}/);
  });

  /** The scope is a LOCAL map key; only the generated key is ever sent. */
  it('does not leak the scope onto the wire', () => {
    const key = keyFor(BASE);
    expect(key).not.toContain('address.create');
    expect(key).not.toContain('A101');
  });
});

/* ------------------------------------------------------------ through the mutation */

function wrapperFor(runtime: AppRuntime) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={runtime.queryClient}>
        <RuntimeProvider runtime={runtime}>{children}</RuntimeProvider>
      </QueryClientProvider>
    );
  };
}

const WRITTEN = {
  address: {
    id: 'addr-new',
    label: 'Home',
    receiverName: null,
    receiverPhone: null,
    latitude: BASE.latitude,
    longitude: BASE.longitude,
    isDefault: true,
    serviceability: { status: 'serviceable', reason: 'AVAILABLE' },
  },
};

describe('the create mutation', () => {
  const scope = addressCreateScope(BASE);

  afterEach(() => {
    idempotency.release(scope);
  });

  /** 7 — a finished intent must not keep its key, or the NEXT address would replay this one. */
  it('clears the attempt state once the save succeeds', async () => {
    const runtime = createTestRuntime({
      api: createStubApi({ 'POST /v1/me/addresses': () => WRITTEN }),
    });

    const { result } = renderHook(() => useCreateAddress(), { wrapper: wrapperFor(runtime) });
    await result.current.mutateAsync({ input: BASE, scope });

    await waitFor(() => expect(idempotency.has(scope)).toBe(false));
  });

  /**
   * 8 — the ambiguous network result.
   *
   * The request may or may not have reached the backend. Releasing the key here would turn the
   * retry into a SECOND address; keeping it is what lets the backend recognise the replay and
   * hand back the original result. So the key survives the failure, and the identical retry
   * carries it again.
   */
  it('keeps the key after an uncertain failure, and the unchanged retry reuses it', async () => {
    const sent: string[] = [];
    let failNext = true;

    const stub = createStubApi({
      'POST /v1/me/addresses': () => {
        if (failNext) {
          failNext = false;
          throw new Error('network');
        }
        return WRITTEN;
      },
    });

    const runtime = createTestRuntime({
      api: {
        async request(path, options) {
          const headers = options.headers as Record<string, string> | undefined;
          const key = headers?.[IDEMPOTENCY_HEADER];
          if (key !== undefined) sent.push(key);
          return stub.request(path, options);
        },
      },
    });

    const { result } = renderHook(() => useCreateAddress(), { wrapper: wrapperFor(runtime) });

    await expect(result.current.mutateAsync({ input: BASE, scope })).rejects.toThrow();
    expect(idempotency.has(scope)).toBe(true);

    // The retry rebuilds the payload from unchanged form state — same scope, same key.
    await result.current.mutateAsync({ input: { ...BASE }, scope: addressCreateScope(BASE) });

    expect(sent).toHaveLength(2);
    expect(sent[1]).toBe(sent[0]);
    // And now that it landed, the intent is finished.
    await waitFor(() => expect(idempotency.has(scope)).toBe(false));
  });
});
