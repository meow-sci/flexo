import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  Button,
  Dialog,
  DialogHeader,
  GridList,
  GridListItem,
  InlineConfirmStrip,
  Modal,
  useIsPhone,
  warningBox,
} from '../../kit';
import type { Selection } from 'react-aria-components';
import type { EditingPart } from '../../../ksa/types';
import type { EngineIssue } from '../../../ksa/engineValidation';
import { validateEngines } from '../../../ksa/engineValidation';
import { resolveReactionLut } from '../../../ksa/reactionCatalog';
import type { ReactionData } from '../../../ksa/reactionCatalog';
import { predictPerformance } from '../../../ksa/enginePhysics';
import { $part, applyEngineWizard, currentLayerId } from '../../../state/editorStore';
import { rebuildCustomMeshes } from '../../../state/customAssetStore';
import { $allReactionIndex, ensureReactionsLoaded } from '../../../state/reactionStore';
import { ensureSolidCurveDataLoaded } from '../../../state/solidCurveStore';
import { setMode } from '../../../state/modeStore';
import {
  activateEngine,
  focusModule,
  setActiveNozzleRef,
  setExhaustPlacing,
  type EngineModePayload,
} from '../../../state/engineStore';
import { shortId } from '../../../state/ids';
import { toast } from '../../toast';
import { PA_PER_BAR } from '../editorKit';
import {
  buildWizardPart,
  initLiquidState,
  stepsFor,
  validateWizardStep,
  type LiquidWizardState,
  type WizardBuildResult,
  type WizardFamily,
  type WizardState,
} from './wizardModel';
import type { WizardPatch } from './steps/stepProps';
import { StepStart } from './steps/StepStart';
import { StepPerformance } from './steps/StepPerformance';
import { StepFeed } from './steps/StepFeed';
import { StepGimbal } from './steps/StepGimbal';
import { StepFx } from './steps/StepFx';
import { StepStructure } from './steps/StepStructure';
import { StepReview } from './steps/StepReview';

/**
 * **Engine Wizard** — the guided "build me a working engine" flow (plan:
 * `plans/ENGINE_WIZARD_PLAN.md`). ONE dialog hosts all three families (decision D1); the
 * `family` param picks which, and its absence means the first screen is the family chooser.
 *
 * The wizard state lives in dialog-local `useState` (decision D2): `DialogRoot` mounts only
 * the open dialog, so the state resets per open and needs no nanostore. Everything the state
 * MEANS lives in the pure `wizardModel.ts` — this component only owns navigation, the
 * dirty/confirm chrome, and the Finish choreography.
 *
 * **Undo enrollment: NONE here.** The finished wizard commits through a single
 * `applyEngineWizard` push in `editorStore` (decision D3); the dialog itself never writes
 * the document.
 */
const FAMILY_LABELS: Readonly<Record<WizardFamily, string>> = {
  liquid: 'Liquid rocket',
  srb: 'Solid rocket booster',
  rcs: 'RCS thruster',
};

const FINISH_LABELS: Readonly<Record<WizardFamily, string>> = {
  liquid: 'Create liquid engine',
  srb: 'Create solid motor',
  rcs: 'Create RCS thrusters',
};

/**
 * The chooser's cards. `available` is what `initialStateFor` can actually build today —
 * Phases W5/W6 flip the last two on by adding their `init*` calls (and nothing else here).
 */
const FAMILY_CARDS: readonly {
  family: WizardFamily;
  description: string;
  available: boolean;
}[] = [
  {
    family: 'liquid',
    description: 'Chamber, bell, feed and gimbal — a throttleable main engine.',
    available: true,
  },
  {
    family: 'srb',
    description: 'A real <SolidMotor>: grain segments, casing and a fixed nozzle.',
    available: false,
  },
  {
    family: 'rcs',
    description: 'A Service-plumbed pulsed block with a nozzle per direction.',
    available: false,
  },
];

/**
 * The wizard's id source (decision D8). Module-level so it is obviously ONE function and
 * obviously not something the render body may call: `buildWizardPart` mints ids through it,
 * which makes any build non-deterministic. See {@link EngineWizardDialog}'s `buildCandidate`.
 */
const mintId = () => shortId();

/** The candidate document, built OUTSIDE the render body — see {@link EngineWizardDialog}. */
interface ReviewBuild {
  result: WizardBuildResult | null;
  error: string | null;
}

export function EngineWizardDialog({ params, onClose }: { params?: unknown; onClose: () => void }) {
  const part = useStore($part);
  const reactions = useStore($allReactionIndex);
  const isPhone = useIsPhone();

  // `null` ⇒ the family chooser. The initializer is pure (a plain read of the live document)
  // and runs once, so `initLiquidState` is NOT re-run on every render.
  const [state, setState] = useState<WizardState | null>(() =>
    initialStateFor(readFamily(params), part),
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [maxVisited, setMaxVisited] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [review, setReview] = useState<ReviewBuild | null>(null);

  // Both catalogs are read-only Core data the steps grade against; fire-and-forget exactly as
  // Engine mode's `onEnter` does. The solid curves are unused until the SRB family (W5) but
  // cost nothing to start here, so the wizard never has a "still loading" SRB step.
  useEffect(() => {
    void ensureReactionsLoaded();
    void ensureSolidCurveDataLoaded();
  }, []);

  const steps = state ? stepsFor(state.family) : [];
  const step = steps[stepIndex];
  const onReview = step?.id === 'review';
  // One pass over every step of the family: index `stepIndex` gates Next, the flattened list
  // gates Finish (a step the user never revisited can still be invalid).
  const problemsByStep = state
    ? steps.map((s) => validateWizardStep(state, s.id, part, reactions))
    : [];
  const stepProblems = problemsByStep[stepIndex] ?? [];
  const allProblems = problemsByStep.flat();

  /*
   * `buildWizardPart` MINTS IDS, so it can live neither in the render body (a
   * non-idempotent component — Rules of React — that would hand the user different ids on
   * every repaint) nor in an effect (`react-hooks-js/set-state-in-effect`). It runs in the
   * ONE event that needs it: navigating onto Review. The ids the user reviews are therefore
   * exactly the ids Finish commits — the handler reuses this result and never rebuilds.
   *
   * The FINDINGS are not stored with it: `validateEngines` is pure, so deriving them per
   * render keeps them honest when the reaction catalog finishes loading mid-review.
   */
  const findings: EngineIssue[] =
    onReview && review?.result ? validateEngines(review.result.part, reactions) : [];

  const buildCandidate = (next: WizardState): ReviewBuild => {
    try {
      return { result: buildWizardPart(part, next, mintId, currentLayerId(part)), error: null };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : String(e) };
    }
  };

  const patch: WizardPatch<WizardState> = (p) => {
    setDirty(true);
    setState((s) => (s ? ({ ...s, ...p } as WizardState) : s));
  };

  const requestClose = () => {
    if (dirty) setConfirmingCancel(true);
    else onClose();
  };

  const goTo = (index: number) => {
    setStepIndex(index);
    setMaxVisited((m) => Math.max(m, index));
    // Every route onto Review comes through here (Next and the rail alike), so this is the
    // single place the candidate is built.
    if (state && steps[index]?.id === 'review') setReview(buildCandidate(state));
  };

  const goNext = () => {
    goTo(Math.min(stepIndex + 1, steps.length - 1));
    setDirty(true);
  };

  const chooseFamily = (family: WizardFamily) => {
    const next = initialStateFor(family, part);
    if (!next) return;
    setState(next);
    setStepIndex(0);
    setMaxVisited(0);
  };

  const blockFinding = findings.find((f) => f.severity === 'block');
  const finishBlocker = review?.error ?? blockFinding?.message ?? allProblems[0] ?? null;
  const finishDisabled = finishBlocker !== null || !review?.result;

  const finish = async () => {
    const built = review?.result;
    if (!built || !state) return;
    // ONE undo step for the whole engine (D3) — geometry, modules, wiring, collider, mass.
    applyEngineWizard(built.part, built.detail);
    // Generated primitives only exist as records until they are baked into GLB meshes.
    if (built.createdMeshIds.length > 0) await rebuildCustomMeshes();
    onClose();
    const payload: EngineModePayload = { engineScope: built.engineScope };
    setMode('engine', payload);
    // `setMode` is a no-op when Engine mode is ALREADY current, so the scope/focus the
    // payload carries is applied explicitly rather than left to the onEnter hook.
    activateEngine(built.engineScope);
    focusModule(built.focus);
    if (state.review.armExhaustTool && built.exhaustNozzleRef) {
      setActiveNozzleRef(built.exhaustNozzleRef);
      setExhaustPlacing(true);
    }
    const name = built.part.gameData.displayName || built.part.partId;
    const thrust = vacuumThrustSummary(state, reactions);
    toast({
      title: `${FAMILY_LABELS[state.family]} created`,
      description: thrust ? `${name} · ${thrust}` : name,
      variant: 'success',
    });
  };

  const railRows = steps.map((s, i) => (
    <Button
      key={s.id}
      size="sm"
      variant={i === stepIndex ? 'secondary' : 'ghost'}
      isDisabled={i > maxVisited}
      onPress={() => goTo(i)}
      className={isPhone ? 'shrink-0 gap-2' : 'w-full justify-start gap-2 px-2'}
    >
      <span className="flex size-4 shrink-0 items-center justify-center rounded-sm bg-wash-hover text-[10px] text-fg-subtle">
        {i + 1}
      </span>
      <span className="min-w-0 flex-1 truncate text-left">{s.title}</span>
      <span className="shrink-0 text-[10px] text-fg-subtle">
        {i === stepIndex ? '●' : i < stepIndex ? '✓' : '○'}
      </span>
    </Button>
  ));

  let body: React.ReactNode = null;
  if (!state) {
    body = (
      <GridList
        aria-label="Engine family"
        selectionMode="single"
        selectionBehavior="replace"
        disabledKeys={FAMILY_CARDS.filter((c) => !c.available).map((c) => c.family)}
        onSelectionChange={(selection: Selection) => {
          if (selection === 'all') return;
          const key = [...selection][0];
          if (key !== undefined) chooseFamily(String(key) as WizardFamily);
        }}
      >
        {FAMILY_CARDS.map((card) => (
          <GridListItem key={card.family} id={card.family} textValue={FAMILY_LABELS[card.family]}>
            <div className="flex w-full min-w-0 flex-col gap-0.5 py-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-fg">{FAMILY_LABELS[card.family]}</span>
                {!card.available && (
                  <span className="shrink-0 rounded-sm bg-wash-hover px-1 text-[11px] text-fg-subtle">
                    Coming soon
                  </span>
                )}
              </div>
              <span className="text-xs text-fg-muted">{card.description}</span>
            </div>
          </GridListItem>
        ))}
      </GridList>
    );
  } else if (step) {
    if (step.id === 'review') {
      body = (
        <StepReview
          state={state}
          patch={patch}
          part={part}
          reactions={reactions}
          result={review?.result ?? null}
          findings={findings}
          buildError={review?.error ?? null}
        />
      );
    } else if (step.id === 'start') {
      body = <StepStart state={state} patch={patch} part={part} reactions={reactions} />;
    } else if (state.family === 'liquid') {
      // The ONE narrowing cast in the wizard: the step components below are written against
      // the liquid state, and `patch` is family-agnostic by construction.
      const liquid = {
        state,
        patch: patch as WizardPatch<LiquidWizardState>,
        part,
        reactions,
      };
      if (step.id === 'performance') body = <StepPerformance {...liquid} />;
      else if (step.id === 'feed') body = <StepFeed {...liquid} />;
      else if (step.id === 'gimbal') body = <StepGimbal {...liquid} />;
      else if (step.id === 'fx') body = <StepFx {...liquid} />;
      else if (step.id === 'structure') body = <StepStructure {...liquid} />;
    }
  }

  return (
    <Modal
      isOpen
      onOpenChange={(v) => !v && requestClose()}
      isDismissable
      variant="fullscreen"
      className="max-w-3xl"
    >
      <Dialog className="flex h-full min-h-0 flex-col">
        <DialogHeader
          title={state ? `Engine Wizard — ${FAMILY_LABELS[state.family]}` : 'Engine Wizard'}
          onClose={requestClose}
        />

        <div className={isPhone ? 'flex min-h-0 flex-1 flex-col' : 'flex min-h-0 flex-1'}>
          {state &&
            (isPhone ? (
              <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border p-2">
                {railRows}
              </div>
            ) : (
              <div className="flex w-40 shrink-0 flex-col gap-0.5 overflow-auto border-r border-border p-2">
                {railRows}
              </div>
            ))}
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">{body}</div>
        </div>

        <div className="shrink-0 border-t border-border p-3">
          {stepProblems.length > 0 && (
            <div className={`${warningBox} mb-2 flex flex-col gap-1`}>
              {stepProblems.map((problem) => (
                <span key={problem}>{problem}</span>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center">
              {confirmingCancel ? (
                // Stacking a ConfirmDialog on a dialog is banned (dialogStore header) — the
                // discard confirm happens in place, in the footer (D10).
                <InlineConfirmStrip
                  label="Discard wizard?"
                  confirmLabel="Discard"
                  onConfirm={onClose}
                  onCancel={() => setConfirmingCancel(false)}
                />
              ) : (
                <Button size="md" variant="secondary" onPress={requestClose}>
                  Cancel
                </Button>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {stepIndex > 0 && (
                <Button size="md" variant="ghost" onPress={() => setStepIndex(stepIndex - 1)}>
                  Back
                </Button>
              )}
              {state &&
                (onReview ? (
                  // The tooltip lives on the wrapper: a disabled Button has
                  // `pointer-events-none`, so a `title` on it would never surface.
                  <span title={finishBlocker ?? undefined}>
                    <Button
                      size="md"
                      variant="primary"
                      isDisabled={finishDisabled}
                      onPress={() => {
                        void finish();
                      }}
                    >
                      {FINISH_LABELS[state.family]}
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="md"
                    variant="primary"
                    isDisabled={stepProblems.length > 0}
                    onPress={goNext}
                  >
                    Next
                  </Button>
                ))}
            </div>
          </div>
        </div>
      </Dialog>
    </Modal>
  );
}

/**
 * The opening state for a family, or `null` when the wizard cannot build it yet — which is
 * what puts the chooser on screen (for no param at all, and for a family whose model has not
 * landed). Phases W5/W6 add their `init*` calls here and nothing else changes.
 */
function initialStateFor(family: WizardFamily | null, part: EditingPart): WizardState | null {
  if (family === 'liquid') return initLiquidState(part);
  return null;
}

/**
 * The Finish toast's headline figure, or `null` when it cannot be computed honestly (the
 * catalog is still loading, the reaction is unknown, a mixture reaction has no ratio, or the
 * inputs cannot sustain a choked flow). Never renders `NaN`.
 */
function vacuumThrustSummary(
  state: WizardState,
  reactions: ReadonlyMap<string, ReactionData> | undefined,
): string | null {
  if (state.family !== 'liquid') return null;
  const reaction = reactions?.get(state.reactionId);
  if (!reaction) return null;
  const lut = resolveReactionLut(reaction, state.mixtureRatio);
  if (!lut) return null;
  const performance = predictPerformance({
    lut,
    maxPressurePa: state.chamberPressureBar * PA_PER_BAR,
    exitDiameterM: state.exitDiameterM,
    areaRatio: state.areaRatio,
    thermalEfficiency: state.thermalEffPct / 100,
    flowEfficiency: state.flowEffPct / 100,
    expansionEfficiency: state.expansionEffPct / 100,
  });
  if (!Number.isFinite(performance.thrustVacN) || performance.thrustVacN <= 0) return null;
  return `${(performance.thrustVacN / 1000).toFixed(1)} kN vacuum`;
}

/**
 * The opaque `openDialog` payload → a family, or `null` for "ask". Defensive because the
 * store never inspects params: any shape can arrive here.
 */
function readFamily(params: unknown): WizardFamily | null {
  if (typeof params !== 'object' || params === null || !('family' in params)) return null;
  const value = (params as { family: unknown }).family;
  return value === 'liquid' || value === 'srb' || value === 'rcs' ? value : null;
}
