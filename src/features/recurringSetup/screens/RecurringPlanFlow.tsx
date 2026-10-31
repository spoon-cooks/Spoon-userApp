import { useState } from 'react';

import {
  busyWindowsFor,
  ordinal,
  sameVisit,
  visitCaption,
  withDayInMatchingPlan,
  withoutVisit,
  withoutVisitDay,
} from '../data';
import { RecurringInfoProvider } from '../components/HelpFab';
import type { EditDateDraft, EditDateField } from '../editDateDraft';
import type { RecurringPlanDraft, RecurringVisitChoice } from '../types';
import { RecurringDaysScreen } from './RecurringDaysScreen';
import { RecurringEditDateScreen } from './RecurringEditDateScreen';
import type { RecurringPlanDays } from './RecurringDaysScreen';
import { RecurringScheduleScreen } from './RecurringScheduleScreen';
import { RecurringSummaryScreen } from './RecurringSummaryScreen';
import { RecurringVisitDaysScreen } from './RecurringVisitDaysScreen';

/**
 * The redesigned recurring flow, end to end on device: pick days (and plans) → schedule each
 * plan's visit in turn → Summary. Spoon — User `340:6661` … `316:4728`.
 *
 * Local state only — nothing is sent anywhere. "Book Now" hands the plans to `onComplete`.
 *
 *  - Days → Schedule: every plan without a visit is scheduled in plan order ("P1 → P2 → … Pn").
 *  - Schedule → Summary once no plan is left unscheduled.
 *  - Summary "+" plan: back to the calendar with a blank plan added and active. Back from there
 *    returns to that Summary tab and drops the blank plan; reached any other way the calendar is
 *    the flow's first step, and back leaves the flow (it used to go forward to the first plan
 *    without a visit — the blank one — or bounce back to the Summary that had just sent it here).
 *  - Android back on every step does what its back arrow does, rather than leaving the flow.
 *  - Summary "+" visit (`332:6093` …): pick which of the plan's days it runs on, then Schedule
 *    it ("Add this visit"), then back to the Summary on the new visit.
 *  - Summary pencil → a date (`494:1039`): Edit date for that one date (`494:605` …). Saving
 *    takes the date off its visit and books it, as edited, as a new plan — the Summary lands on
 *    that new plan's tab. The bin there (`586:4315`) takes the date off its plan instead.
 *  - Visits survive a change of plan days, keeping the days the plan still has (a visit left with
 *    none is dropped).
 *  - Summary bin: removes the visit shown, or the plan when it is the plan's only visit.
 */
export interface RecurringPlanFlowProps {
  readonly onExit: () => void;
  readonly onComplete?: (plans: readonly RecurringPlanDraft[]) => void;
  /** The day the window is counted from. Defaults to now; the dev preview pins Figma's date. */
  readonly today?: Date;
  /**
   * Where to open, with which plans — the dev preview's way to land on any screen of the flow
   * directly (`spoon://recurring-setup?step=summary`). The real route never passes it.
   */
  readonly seed?: RecurringPlanFlowSeed;
  /**
   * What the help button on every screen opens — the Recurring landing page (`1302:2617`). Left
   * out, the button is not drawn.
   */
  readonly onOpenInfo?: () => void;
}

export interface RecurringPlanFlowSeed {
  readonly plans: readonly RecurringPlanDraft[];
  readonly stage: RecurringPlanFlowStage;
}

export type RecurringPlanFlowStage =
  | {
      readonly kind: 'days';
      readonly activeId?: string | undefined;
      /** The dev preview's way to open with the "Max 14 days reached" error already showing. */
      readonly capError?: boolean | undefined;
      /** Opened by the Summary's "+": back returns to this Summary tab. */
      readonly returnTo?: { readonly planIndex: number; readonly visitIndex: number } | undefined;
    }
  | {
      readonly kind: 'schedule';
      readonly planId: string;
      readonly visitIndex: number;
      /** `sequence` walks every unscheduled plan; `summary` returns straight to the Summary. */
      readonly returnTo: 'sequence' | 'summary';
      /** A later visit's own days, picked on the visit-days screen. */
      readonly dayIds?: readonly string[] | undefined;
      /** The dev preview's way to open with part of the visit already chosen (`288:401` …). */
      readonly draft?: Partial<RecurringVisitChoice> | undefined;
    }
  | {
      readonly kind: 'editDate';
      readonly planId: string;
      readonly visitIndex: number;
      readonly dayId: string;
      /** Preview states for the dev route (`494:676`, `586:4315`): the editor, picks and dialog. */
      readonly field?: EditDateField | undefined;
      readonly draft?: Partial<EditDateDraft> | undefined;
      readonly confirmingDelete?: boolean | undefined;
    }
  | {
      readonly kind: 'visitDays';
      readonly planId: string;
      readonly visitIndex: number;
      readonly dayIds?: readonly string[] | undefined;
    }
  | {
      readonly kind: 'summary';
      readonly planIndex: number;
      readonly visitIndex: number;
      /** Preview states for the dev route: the dates in edit mode (`494:1039`)… */
      readonly editing?: boolean | undefined;
      /** …the bin's sheet (`542:1442`), or one of its confirm dialogs, open… */
      readonly managing?: 'sheet' | 'visit' | 'plan' | 'startOver' | undefined;
      /** …or the undo banner showing this message (`568:2909`). */
      readonly undoMessage?: string | undefined;
    };

function nextPlanId(plans: readonly RecurringPlanDraft[]): string {
  const taken = new Set(plans.map((plan) => plan.id));
  let serial = plans.length + 1;
  while (taken.has(`plan-${serial}`)) serial += 1;
  return `plan-${serial}`;
}

/**
 * A plan's visits after its days change: a visit on every plan day keeps doing so; one on its own
 * days keeps those the plan still has, and is dropped if none are left.
 */
function keepVisitsOn(
  dayIds: readonly string[],
  visits: readonly RecurringVisitChoice[],
): readonly RecurringVisitChoice[] {
  const kept = new Set(dayIds);
  return visits.flatMap((visit) => {
    if (visit.dayIds === undefined) return [visit];
    const left = visit.dayIds.filter((id) => kept.has(id));
    return left.length === 0 ? [] : [{ ...visit, dayIds: left }];
  });
}

type Stage = RecurringPlanFlowStage;

export function RecurringPlanFlow(props: RecurringPlanFlowProps) {
  return (
    <RecurringInfoProvider onOpen={props.onOpenInfo}>
      <RecurringPlanFlowScreens {...props} />
    </RecurringInfoProvider>
  );
}

function RecurringPlanFlowScreens({ onExit, onComplete, today, seed }: RecurringPlanFlowProps) {
  const [plans, setPlans] = useState<readonly RecurringPlanDraft[]>(seed?.plans ?? []);
  const [stage, setStage] = useState<Stage>(seed?.stage ?? { kind: 'days' });
  /** Remounts the calendar each time the flow returns to it, so it opens on the plans given. */
  const [daysVisit, setDaysVisit] = useState(0);
  /**
   * `568:2909` — the Summary's undo banner after a delete: what to say and everything needed to
   * put it back. Cleared by dismissing it or by leaving the Summary.
   */
  const [undo, setUndo] = useState<{
    readonly message: string;
    readonly plans: readonly RecurringPlanDraft[];
    readonly planIndex: number;
    readonly visitIndex: number;
  } | null>(() =>
    seed?.stage.kind === 'summary' && seed.stage.undoMessage !== undefined
      ? {
          message: seed.stage.undoMessage,
          plans: seed.plans,
          planIndex: seed.stage.planIndex,
          visitIndex: seed.stage.visitIndex,
        }
      : null,
  );

  const goToDays = (
    next: readonly RecurringPlanDraft[],
    activeId?: string,
    returnTo?: { readonly planIndex: number; readonly visitIndex: number },
  ) => {
    setUndo(null);
    setPlans(next);
    setDaysVisit((count) => count + 1);
    setStage({ kind: 'days', activeId, returnTo });
  };

  /** The first plan with no visit, scheduled next; otherwise the Summary on `focusIndex`. */
  const advance = (next: readonly RecurringPlanDraft[], focusIndex: number) => {
    const pending = next.find((plan) => plan.visits.length === 0);
    if (pending !== undefined) {
      setStage({ kind: 'schedule', planId: pending.id, visitIndex: 0, returnTo: 'sequence' });
      return;
    }
    setStage({
      kind: 'summary',
      planIndex: Math.min(Math.max(focusIndex, 0), next.length - 1),
      visitIndex: 0,
    });
  };

  if (stage.kind === 'days') {
    const { returnTo } = stage;
    const back = () => {
      if (returnTo === undefined) {
        onExit();
        return;
      }
      // The blank plan "+" added never got a day: drop it and go back to where "+" was pressed.
      setPlans(plans.filter((plan) => plan.dayIds.length > 0 || plan.visits.length > 0));
      setStage({ kind: 'summary', ...returnTo });
    };
    return (
      <RecurringDaysScreen
        key={`days-${daysVisit}`}
        onBack={back}
        {...(today === undefined ? {} : { today })}
        initialPlans={plans.map((plan) => ({ id: plan.id, dayIds: plan.dayIds }))}
        {...(stage.activeId === undefined ? {} : { initialActiveId: stage.activeId })}
        {...(stage.capError === true ? { initialCapError: true } : {})}
        scheduledPlanIds={new Set(plans.filter((plan) => plan.visits.length > 0).map((p) => p.id))}
        onContinue={(picked: readonly RecurringPlanDays[]) => {
          // Keep each plan's visits by id; plans emptied of days are dropped.
          const next = picked.map((entry) => ({
            id: entry.id,
            dayIds: entry.dayIds,
            visits: keepVisitsOn(
              entry.dayIds,
              plans.find((plan) => plan.id === entry.id)?.visits ?? [],
            ),
          }));
          setPlans(next);
          const focus = next.findIndex((plan) => plan.id === stage.activeId);
          advance(next, focus === -1 ? next.length - 1 : focus);
        }}
      />
    );
  }

  if (stage.kind === 'editDate') {
    const index = plans.findIndex((plan) => plan.id === stage.planId);
    const plan = plans[index];
    const visit = plan?.visits[stage.visitIndex];
    if (plan === undefined || visit === undefined) return null;
    /** The plans with the date taken off its visit; the source plan goes if nothing is left. */
    const withoutDate = () => {
      const source = withoutVisitDay(plan, stage.visitIndex, stage.dayId);
      return source === null
        ? plans.filter((entry) => entry.id !== plan.id)
        : plans.map((entry) => (entry.id === plan.id ? source : entry));
    };
    return (
      <RecurringEditDateScreen
        key={`${plan.id}-${stage.visitIndex}-${stage.dayId}`}
        planNumber={index + 1}
        dayId={stage.dayId}
        visit={visit}
        initialField={stage.field}
        initialDraft={stage.draft}
        initialConfirmingDelete={stage.confirmingDelete}
        busy={busyWindowsFor(
          plan.dayIds,
          plan.visits.filter((_, visitIndex) => visitIndex !== stage.visitIndex),
          [stage.dayId],
        )}
        onBack={() => setStage({ kind: 'summary', planIndex: index, visitIndex: stage.visitIndex })}
        onSave={(choice: RecurringVisitChoice) => {
          // Nothing changed: the date stays where it was rather than splitting into a plan of its own.
          if (sameVisit(choice, visit)) {
            setStage({ kind: 'summary', planIndex: index, visitIndex: stage.visitIndex });
            return;
          }
          // The date joins the plan that already has exactly this visit; only a visit no plan has
          // starts a new one (owner, 31 Oct 2026).
          const rest = withoutDate();
          const joined = withDayInMatchingPlan(rest, stage.dayId, choice);
          if (joined !== null) {
            setPlans(joined.plans);
            setStage({ kind: 'summary', planIndex: joined.planIndex, visitIndex: 0 });
            return;
          }
          const next = [
            ...rest,
            { id: nextPlanId(plans), dayIds: [stage.dayId], visits: [choice] },
          ];
          setPlans(next);
          setStage({ kind: 'summary', planIndex: next.length - 1, visitIndex: 0 });
        }}
        onDelete={() => {
          const next = withoutDate();
          if (next.length === 0) {
            goToDays([]);
            return;
          }
          setPlans(next);
          const kept = next.find((entry) => entry.id === plan.id);
          setStage(
            kept === undefined
              ? { kind: 'summary', planIndex: Math.max(0, index - 1), visitIndex: 0 }
              : {
                  kind: 'summary',
                  planIndex: index,
                  visitIndex: Math.min(stage.visitIndex, kept.visits.length - 1),
                },
          );
        }}
      />
    );
  }

  if (stage.kind === 'visitDays') {
    const index = plans.findIndex((plan) => plan.id === stage.planId);
    const plan = plans[index];
    if (plan === undefined) return null;
    const editing = plan.visits[stage.visitIndex];
    return (
      <RecurringVisitDaysScreen
        key={`${plan.id}-days-${stage.visitIndex}`}
        planNumber={index + 1}
        planDayIds={plan.dayIds}
        bookedVisits={plan.visits.slice(0, stage.visitIndex).map(visitCaption)}
        initialDayIds={stage.dayIds ?? editing?.dayIds}
        onBack={() =>
          setStage({
            kind: 'summary',
            planIndex: index,
            visitIndex: Math.min(stage.visitIndex, plan.visits.length - 1),
          })
        }
        onContinue={(dayIds) =>
          setStage({
            kind: 'schedule',
            planId: plan.id,
            visitIndex: stage.visitIndex,
            returnTo: 'summary',
            dayIds,
          })
        }
      />
    );
  }

  if (stage.kind === 'schedule') {
    const index = plans.findIndex((plan) => plan.id === stage.planId);
    const plan = plans[index];
    if (plan === undefined) return null;
    const laterVisit = stage.visitIndex > 0;
    const existing = plan.visits[stage.visitIndex];
    const laterPending = plans.findIndex(
      (entry, entryIndex) => entryIndex > index && entry.visits.length === 0,
    );
    const ctaLabel = laterVisit
      ? existing === undefined
        ? 'Add this visit'
        : 'Save & Continue'
      : stage.returnTo === 'sequence' && laterPending !== -1
        ? `Save & Schedule Plan ${laterPending + 1}`
        : 'Save & Continue';
    const dayIds = laterVisit ? (stage.dayIds ?? existing?.dayIds ?? plan.dayIds) : plan.dayIds;
    return (
      <RecurringScheduleScreen
        key={`${plan.id}-${stage.visitIndex}`}
        planNumber={index + 1}
        visitNumber={stage.visitIndex + 1}
        dayIds={dayIds}
        initial={existing ?? stage.draft}
        ctaLabel={ctaLabel}
        {...(laterVisit
          ? {
              addingVisit: {
                planDayIds: plan.dayIds,
                visitsBefore: plan.visits.slice(0, stage.visitIndex),
                otherVisits: plan.visits.filter((_, visitIndex) => visitIndex !== stage.visitIndex),
              },
            }
          : {})}
        onBack={() => {
          if (laterVisit) {
            setStage({ kind: 'visitDays', planId: plan.id, visitIndex: stage.visitIndex, dayIds });
          } else if (stage.returnTo === 'summary') {
            setStage({
              kind: 'summary',
              planIndex: index,
              visitIndex: Math.max(0, Math.min(stage.visitIndex, plan.visits.length - 1)),
            });
          } else {
            goToDays(plans, plan.id);
          }
        }}
        onSave={(choice: RecurringVisitChoice) => {
          const visits = [...plan.visits];
          visits[stage.visitIndex] = laterVisit ? { ...choice, dayIds } : choice;
          const next = plans.map((entry) => (entry.id === plan.id ? { ...entry, visits } : entry));
          setPlans(next);
          if (stage.returnTo === 'summary') {
            setStage({ kind: 'summary', planIndex: index, visitIndex: stage.visitIndex });
          } else {
            advance(next, index);
          }
        }}
      />
    );
  }

  return (
    <RecurringSummaryScreen
      plans={plans}
      planIndex={stage.planIndex}
      visitIndex={stage.visitIndex}
      {...(today === undefined ? {} : { today })}
      {...(stage.editing === true ? { initialEditing: true } : {})}
      {...(stage.managing === undefined ? {} : { initialManaging: stage.managing })}
      onSelect={(planIndex, visitIndex) => setStage({ kind: 'summary', planIndex, visitIndex })}
      onAddPlan={() => {
        const id = nextPlanId(plans);
        goToDays([...plans, { id, dayIds: [], visits: [] }], id, {
          planIndex: stage.planIndex,
          visitIndex: stage.visitIndex,
        });
      }}
      onAddVisit={(planIndex) => {
        const plan = plans[planIndex];
        if (plan === undefined) return;
        setUndo(null);
        setStage({ kind: 'visitDays', planId: plan.id, visitIndex: plan.visits.length });
      }}
      onEditDate={(planIndex, visitIndex, dayId) => {
        const plan = plans[planIndex];
        if (plan === undefined) return;
        setUndo(null);
        setStage({ kind: 'editDate', planId: plan.id, visitIndex, dayId });
      }}
      onDeleteVisit={(planIndex, visitIndex) => {
        const plan = plans[planIndex];
        if (plan === undefined) return;
        const kept = withoutVisit(plan, visitIndex);
        if (kept === null) return;
        setUndo({
          message: `${ordinal(visitIndex + 1)} Visit deleted from Plan ${planIndex + 1}`,
          plans,
          planIndex,
          visitIndex,
        });
        setPlans(plans.map((entry) => (entry === plan ? kept : entry)));
        setStage({ kind: 'summary', planIndex, visitIndex: Math.max(0, visitIndex - 1) });
      }}
      onDeletePlan={(planIndex) => {
        const next = plans.filter((_, index) => index !== planIndex);
        if (next.length === 0) {
          goToDays([]);
          return;
        }
        setUndo({
          message: `Plan ${planIndex + 1} deleted`,
          plans,
          planIndex,
          visitIndex: stage.visitIndex,
        });
        setPlans(next);
        setStage({ kind: 'summary', planIndex: Math.max(0, planIndex - 1), visitIndex: 0 });
      }}
      onStartOver={() => goToDays([])}
      undo={
        undo === null
          ? undefined
          : {
              message: undo.message,
              onUndo: () => {
                setPlans(undo.plans);
                setStage({
                  kind: 'summary',
                  planIndex: undo.planIndex,
                  visitIndex: undo.visitIndex,
                });
                setUndo(null);
              },
              onDismiss: () => setUndo(null),
            }
      }
      onBook={() => onComplete?.(plans)}
      onBack={() => goToDays(plans, plans[stage.planIndex]?.id)}
    />
  );
}
