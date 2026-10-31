import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { clearProfileDraft, readProfileDraft, writeProfileDraft } from '@core/auth';
import { ready } from '@core/data';
import type { ScreenQuery } from '@core/data';
import { useRuntime } from '@core/runtimeContext';
import { authKeys, createAuthApi, useMe, useUpdateProfile } from '@features/auth';
import type { MeResponse, ProfileUpdateRequest } from '@features/auth';

import {
  DIET_OPTIONS,
  GENDER_OPTIONS,
  HASSLES_BY_MEAL,
  HOUSEHOLD_MAX,
  NON_VEG_OPTIONS,
  OIL_STOPS,
  canonicalCuisine,
  isMealSetup,
} from './fields';
import type { WizardStepId } from './fields';
import { EMPTY_PROFILE_DETAILS, NO_GENDER_PREFERENCE, showsNonVegPreferences } from './validation';
import type { ProfileDetailsValues } from './validation';

/**
 * The taste-profile wizard's data layer: `GET /v1/me` → the form, the form → `PUT /v1/me/profile`,
 * and the on-device draft between the two.
 *
 * ## Saved as the customer answers (R-AREA-23)
 *
 * `PUT /v1/me/profile` is a PATCH, but the wizard opens PREFILLED and submits every answer it asks,
 * so what the screens show and what is stored are the same object. During onboarding every change
 * is also sent to the server a moment after it is made (`useAutosaveProfileDetails`), once a name
 * exists — the PUT requires one — so a customer who leaves mid-flow keeps what they entered on any
 * device. That does not onboard them early: `profileComplete` needs the name, the diet and the
 * meal setup, all of which are mandatory anyway. Save & Continue still sends the final answers and
 * is the only thing that moves the customer on; the on-device draft carries the step and anything
 * entered before the name.
 *
 * `householdStructure` is no longer asked and is never sent, so an answer given on the V8 page is
 * left as it was rather than cleared.
 *
 * ## Older answers
 *
 * A profile saved on the V8 page can hold ids the wizard no longer offers. The meal setup is the
 * one that matters: a V8 setup (`daily-cook-2x` …) is opened as unanswered so the customer picks
 * one of the five, because the Cook step's Continue must not pass on a row nobody can see. Every
 * other stored value round-trips unchanged.
 */

const known = (ids: readonly { readonly id: string }[], id: string | null) =>
  id !== null && ids.some((option) => option.id === id) ? id : null;

function count(value: number | null, fallback: number, min: number): number {
  if (value === null || !Number.isInteger(value)) return fallback;
  return Math.min(HOUSEHOLD_MAX, Math.max(min, value));
}

export function profileDetailsFromMe(me: MeResponse): ProfileDetailsValues {
  const mealStructure = isMealSetup(me.mealStructure) ? me.mealStructure : null;
  const hassleIds =
    mealStructure === null ? [] : HASSLES_BY_MEAL[mealStructure].options.map((option) => option.id);
  const cuisines = (me.grownUpEating ?? []).map(canonicalCuisine).filter((label) => label !== '');

  return {
    ...EMPTY_PROFILE_DETAILS,
    name: me.name ?? '',
    householdAdults: count(me.householdAdults, 1, 1),
    householdKids: count(me.householdKids, 0, 0),
    householdElders: count(me.householdElders, 0, 0),
    dietaryPreference: known(DIET_OPTIONS, me.dietaryPreference),
    nonVegPreferences: (me.nonVegPreferences ?? []).filter((id) => known(NON_VEG_OPTIONS, id)),
    grownUpEating: [...new Set(cuisines)],
    oilLevel: known(OIL_STOPS, me.oilLevel) ?? EMPTY_PROFILE_DETAILS.oilLevel,
    gheeOnly: me.gheeOnly ?? false,
    genderPreference: known(GENDER_OPTIONS, me.genderPreference) ?? NO_GENDER_PREFERENCE,
    // Kept even when it is V8's `my-state`, which no tile draws: the customer did not change it.
    regionPreference: me.regionPreference,
    mealStructure,
    mealHassles: (me.mealHassles ?? []).filter((id) => hassleIds.includes(id)),
    pressingIssue: me.pressingIssue ?? '',
  };
}

export function profileUpdateFrom(values: ProfileDetailsValues): ProfileUpdateRequest {
  const note = values.pressingIssue.trim();
  return {
    name: values.name.trim(),
    householdAdults: values.householdAdults,
    householdKids: values.householdKids,
    householdElders: values.householdElders,
    dietaryPreference: values.dietaryPreference,
    // A diet without meat has no meat answer at all, not an empty one.
    nonVegPreferences: showsNonVegPreferences(values) ? [...values.nonVegPreferences] : null,
    grownUpEating: [...values.grownUpEating],
    oilLevel: values.oilLevel,
    gheeOnly: values.gheeOnly,
    genderPreference: values.genderPreference ?? NO_GENDER_PREFERENCE,
    regionPreference: values.regionPreference,
    mealStructure: values.mealStructure,
    mealHassles: [...values.mealHassles],
    pressingIssue: note === '' ? null : note,
  };
}

export interface ProfileDetailsData {
  /** Whose profile — the draft is kept per customer. */
  readonly userId: string;
  readonly values: ProfileDetailsValues;
  readonly profileComplete: boolean;
}

export function useProfileDetailsData(): ScreenQuery<ProfileDetailsData> {
  const me = useMe();

  const state = useMemo(() => {
    if (me.state.status !== 'ready') return me.state;
    return ready({
      userId: me.state.data.id,
      values: profileDetailsFromMe(me.state.data),
      profileComplete: me.state.data.profileComplete,
    });
  }, [me.state]);

  return { state, refetch: me.refetch };
}

export function useSaveProfileDetails() {
  const update = useUpdateProfile();

  return {
    ...update,
    save(values: ProfileDetailsValues, options?: { onSuccess?: () => void }) {
      update.mutate(profileUpdateFrom(values), {
        ...(options?.onSuccess === undefined ? {} : { onSuccess: options.onSuccess }),
      });
    },
  };
}

/**
 * Sends the wizard's answers to the server as they change (R-AREA-23).
 *
 * One request at a time: a change made while one is in flight is held, and only the newest held
 * answers are sent when it returns, so a slow reply can never overwrite a later answer. Nothing is
 * sent until there is a name (the PUT requires one). A failure is silent and is retried by the next
 * change; the device draft and the final Save are what the customer relies on. The reply updates
 * the cached `/me` in place rather than refetching it on every answer.
 */
export function useAutosaveProfileDetails(): (values: ProfileDetailsValues) => void {
  const { api } = useRuntime();
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const queued = useRef<ProfileDetailsValues | null>(null);

  // Sends the newest queued answers until none are left; only one request is ever out.
  const drain = useCallback(async () => {
    const auth = createAuthApi(api);
    while (queued.current !== null) {
      const values = queued.current;
      queued.current = null;
      try {
        const profile = await auth.updateProfile(profileUpdateFrom(values));
        queryClient.setQueryData<MeResponse>(authKeys.me(), (current) =>
          current === undefined ? current : { ...current, ...profile },
        );
      } catch {
        // Silent: the next change retries, and the final Save reports its own failure.
      }
    }
    inFlight.current = false;
  }, [api, queryClient]);

  return useCallback(
    (values: ProfileDetailsValues) => {
      if (values.name.trim() === '') return;
      queued.current = values;
      if (inFlight.current) return;
      inFlight.current = true;
      void drain();
    },
    [drain],
  );
}

/* --------------------------------------------------------------------------------- draft */

export interface ProfileDraft {
  readonly step: WizardStepId;
  readonly values: ProfileDetailsValues;
}

const STEPS: readonly WizardStepId[] = ['family', 'diet', 'taste', 'cook'];

/** Best effort: a device that cannot store the draft simply starts the wizard again. */
export function saveProfileDraft(userId: string, draft: ProfileDraft): void {
  void writeProfileDraft(userId, JSON.stringify({ version: 1, ...draft })).catch(() => undefined);
}

export function discardProfileDraft(userId: string): void {
  void clearProfileDraft(userId).catch(() => undefined);
}

/**
 * This customer's draft: `undefined` while it is read, `null` when there is none (or it cannot be
 * read back). Fields the stored copy lacks fall back to the form's defaults, so a draft written by
 * an older build never opens with a hole in it.
 */
export function useProfileDraft(userId: string): ProfileDraft | null | undefined {
  const [draft, setDraft] = useState<ProfileDraft | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    readProfileDraft(userId)
      .then((raw) => {
        if (live) setDraft(raw === null ? null : parseDraft(raw));
      })
      .catch(() => {
        if (live) setDraft(null);
      });
    return () => {
      live = false;
    };
  }, [userId]);
  return draft;
}

export function parseDraft(raw: string): ProfileDraft | null {
  try {
    const parsed = JSON.parse(raw) as { step?: unknown; values?: Record<string, unknown> };
    if (typeof parsed.values !== 'object' || parsed.values === null) return null;
    const step = STEPS.find((id) => id === parsed.step) ?? 'family';
    const values = { ...EMPTY_PROFILE_DETAILS };
    for (const key of Object.keys(EMPTY_PROFILE_DETAILS) as (keyof ProfileDetailsValues)[]) {
      const stored = parsed.values[key];
      const fallback = EMPTY_PROFILE_DETAILS[key];
      const sameShape =
        fallback === null
          ? stored === null || typeof stored === 'string'
          : Array.isArray(fallback)
            ? Array.isArray(stored) && stored.every((entry) => typeof entry === 'string')
            : typeof stored === typeof fallback;
      if (sameShape) Object.assign(values, { [key]: stored });
    }
    return { step, values };
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------------------- gate */

export type ProfileGate = 'resolving' | 'required' | 'satisfied';

/** Whether the boot gate owes this customer the wizard. The SERVER's `profileComplete` decides. */
export function useProfileGate(options: { enabled?: boolean } = {}): ProfileGate {
  const me = useMe({ enabled: options.enabled ?? true });

  if (options.enabled === false) return 'resolving';
  if (me.state.status === 'loading') return 'resolving';
  if (me.state.status !== 'ready') return 'satisfied';
  return me.state.data.profileComplete ? 'satisfied' : 'required';
}
