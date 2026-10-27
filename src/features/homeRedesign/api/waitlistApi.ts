import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { idempotencyHeader } from '@core/api';
import type { ApiClient } from '@core/api';
import { useApiQuery } from '@core/data';
import type { ScreenQuery } from '@core/data';
import { createKeyFactory } from '@core/query';
import { useRuntime } from '@core/runtimeContext';

const waitlistKeys = { state: () => createKeyFactory('waitlist').collection('state') } as const;

/**
 * `GET /v1/me/waitlist` — whether this customer joined, and how many people are waiting in their
 * pincode (themselves included; their entry's pincode, else the last place they were refused).
 * `launchThreshold` is the meter's target; null until Ops configures one.
 */
const waitlistStateSchema = z.object({
  joined: z.boolean(),
  countForArea: z.number().int().nonnegative().nullable(),
  launchThreshold: z.number().int().positive().nullable(),
});
export type WaitlistStateDto = z.infer<typeof waitlistStateSchema>;

export const WAITLIST_PATHS = { me: '/v1/me/waitlist' } as const;

const waitlistEntrySchema = z.object({ id: z.string(), status: z.string() });
export type WaitlistEntryDto = z.infer<typeof waitlistEntrySchema>;

export interface JoinWaitlistInput {
  /** Required by the backend (1–120 chars). */
  readonly name: string;
  readonly addressId: string | null;
  /**
   * The pincode the customer is joining from. Not sent: the backend takes the place itself. It
   * scopes the `Idempotency-Key`, because the backend keeps one entry per phone AND pincode
   * (R-AREA-13): without it a join from a second area would replay the first area's response.
   */
  readonly pincode: string | null;
}

/**
 * `PUT /v1/me/waitlist` — an upsert keyed on the user (one active entry), refused for an address
 * in a live hub. Needs an `Idempotency-Key`, scoped to the payload so a retry replays.
 *
 * The backend keeps one active entry per phone and pincode, and takes no notification channel.
 */
export function createWaitlistApi(api: ApiClient) {
  return {
    async join(input: JoinWaitlistInput): Promise<WaitlistEntryDto> {
      return api.request(WAITLIST_PATHS.me, {
        method: 'PUT',
        headers: idempotencyHeader(
          `waitlist.ensure:${input.addressId ?? 'none'}:${input.pincode ?? 'none'}:${input.name}`,
        ),
        body: { name: input.name, addressId: input.addressId },
        parse: (data) => waitlistEntrySchema.parse(data),
      });
    },
  };
}

export function useJoinWaitlist() {
  const { api } = useRuntime();
  const queryClient = useQueryClient();
  const waitlist = createWaitlistApi(api);
  return useMutation<WaitlistEntryDto, Error, JoinWaitlistInput>({
    mutationFn: (input) => waitlist.join(input),
    // Joined, and now counted: re-read the state so the meter and the button both move.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: waitlistKeys.state() }),
  });
}

/** The customer's waitlist state. `enabled` is false for a guest, who has no waitlist. */
export function useWaitlistState(
  options: { enabled?: boolean } = {},
): ScreenQuery<WaitlistStateDto> {
  const { api } = useRuntime();
  return useApiQuery<WaitlistStateDto>({
    queryKey: waitlistKeys.state(),
    queryFn: ({ signal }) =>
      api.request(WAITLIST_PATHS.me, {
        method: 'GET',
        signal,
        parse: (data) => waitlistStateSchema.parse(data),
      }),
    enabled: options.enabled ?? true,
  });
}
