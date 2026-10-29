import type { ApiClient } from '@core/api';

import { createWaitlistApi } from './waitlistApi';

/**
 * The backend keeps one active waitlist entry per phone AND pincode (R-AREA-13). A join from a
 * second area must therefore carry a new `Idempotency-Key`, or the backend replays the first
 * area's response and the customer is never added there. A retry in the same area keeps its key.
 */
describe('createWaitlistApi.join', () => {
  function keysFor(pincodes: readonly (string | null)[]): string[] {
    const keys: string[] = [];
    const api = {
      request: (_path: string, options: { headers: Record<string, string> }) => {
        keys.push(Object.values(options.headers)[0] ?? '');
        return Promise.resolve({});
      },
    } as unknown as ApiClient;
    const waitlist = createWaitlistApi(api);
    for (const pincode of pincodes) {
      void waitlist.join({ name: 'Asha', addressId: null, pincode });
    }
    return keys;
  }

  it('uses a new key in a new pincode and the same key for a retry in the same one', () => {
    const [first, retry, elsewhere] = keysFor(['560001', '560001', '560002']);
    expect(retry).toBe(first);
    expect(elsewhere).not.toBe(first);
  });

  it('does not send the pincode: the backend takes the place itself', () => {
    const bodies: unknown[] = [];
    const api = {
      request: (_path: string, options: { body: unknown }) => {
        bodies.push(options.body);
        return Promise.resolve({});
      },
    } as unknown as ApiClient;
    void createWaitlistApi(api).join({ name: 'Asha', addressId: null, pincode: '560001' });
    expect(bodies).toEqual([{ name: 'Asha', addressId: null }]);
  });
});
