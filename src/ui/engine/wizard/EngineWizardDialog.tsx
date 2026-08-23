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
import { sampleThrustCurve } from '../../../ksa/solidMotorPhysics';
import { substanceIdOfPhase, type GrainGeometryTable } from '../../../ksa/grainGeometryCatalog';
import { $part, applyEngineWizard, currentLayerId } from '../../../state/editorStore';
import { rebuildCustomMeshes } from '../../../state/customAssetStore';
import { $allReactionIndex, ensureReactionsLoaded } from '../../../state/reactionStore';
import {
  $grainIndex,
  $solidDensities,
  ensureSolidCurveDataLoaded,
} from '../../../state/solidCurveStore';
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
  initRcsState,
  initSrbState,
  stepsFor,
  validateWizardStep,
  type LiquidWizardState,
  type RcsWizardState,
  type SrbWizardState,
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
import { StepReview, type WizardPerformance } from './steps/StepReview';
import { WIZARD_BOUNDS } from './wizardPresets';
import { StepSrbPropellant } from './steps/StepSrbPropellant';
import { StepSrbGrain } from './steps/StepSrbGrain';
import { StepSrbNozzle } from './steps/StepSrbNozzle';
import { StepRcsLayout } from './steps/StepRcsLayout';
import { StepRcsPropellant } from './steps/StepRcsPropellant';

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
 * The chooser's cards. `available` is what `initialStateFor` can actually build — all three
 * families since Phases W5/W6, so nothing here is disabled and no "Coming soon" chip shows.
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
    available: true,
  },
  {
    family: 'rcs',
    description: 'A Service-plumbed pulsed block with a nozzle per direction.',
    available: true,
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
  // The solid libraries, subscribed here and passed down: the SRB burn headline is the one
  // number Review and the Finish toast must agree on, so both read the same snapshot.
  const grains = useStore($grainIndex);
  const densities = useStore($solidDensities);
  const isPhone = useIsPhone();
  const solids: SolidCatalogs = { grains, densities };

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

  // Derived per render for the same reason, and only where it is read: the SRB figure walks
  // a 256-step burn integration, which no keystroke on an earlier step should pay for.
  const performance = state && onReview ? wizardPerformance(state, reactions, solids) : null;

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
    // Finish is reachable only from Review, so `performance` is the very figure the user
    // just read there — the toast quotes it rather than re-deriving one.
    const thrust = thrustSummary(performance);
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
    // Three steps are walked by EVERY family and are typed against the whole `WizardState`,
    // so they take the state and the patch exactly as this component holds them.
    const shared = { state, patch, part, reactions };
    if (step.id === 'review') {
      body = (
        <StepReview
          {...shared}
          performance={performance}
          result={review?.result ?? null}
          findings={findings}
          buildError={review?.error ?? null}
        />
      );
    } else if (step.id === 'start') {
      body = <StepStart {...shared} />;
    } else if (step.id === 'structure') {
      body = <StepStructure {...shared} />;
    } else if (step.id === 'fx') {
      body = <StepFx {...shared} />;
    } else if (state.family === 'liquid') {
      /*
       * Below, each family narrows `state` ONCE and hands its own steps a props bag.
       *
       * The cast is the family boundary: `patch` is family-agnostic by construction (it
       * shallow-merges into whatever state is held), but a `WizardPatch<WizardState>` cannot
       * be handed to a component that declares `WizardPatch<LiquidWizardState>` — the
       * parameter is contravariant. Steps SHARED by two families (feed, gimbal) declare the
       * union they serve and therefore take the uncast `patch` straight from `shared`.
       */
      const own = { state, patch: patch as WizardPatch<LiquidWizardState>, part, reactions };
      if (step.id === 'performance') body = <StepPerformance {...own} />;
      else if (step.id === 'feed') body = <StepFeed {...shared} state={state} />;
      else if (step.id === 'gimbal') body = <StepGimbal {...shared} state={state} />;
    } else if (state.family === 'srb') {
      const own = { state, patch: patch as WizardPatch<SrbWizardState>, part, reactions };
      if (step.id === 'srb-propellant') body = <StepSrbPropellant {...own} />;
      else if (step.id === 'srb-grain') body = <StepSrbGrain {...own} />;
      else if (step.id === 'srb-nozzle') body = <StepSrbNozzle {...own} />;
      else if (step.id === 'gimbal') body = <StepGimbal {...shared} state={state} />;
    } else {
      const own = { state, patch: patch as WizardPatch<RcsWizardState>, part, reactions };
      if (step.id === 'rcs-layout') body = <StepRcsLayout {...own} />;
      else if (step.id === 'rcs-propellant') body = <StepRcsPropellant {...own} />;
      else if (step.id === 'feed') body = <StepFeed {...shared} state={state} />;
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
 * The opening state for a family, or `null` when there is no family yet — which is what puts
 * the chooser on screen. All three families are implemented (Phases W2, W5, W6).
 */
function initialStateFor(family: WizardFamily | null, part: EditingPart): WizardState | null {
  if (family === 'liquid') return initLiquidState(part);
  if (family === 'srb') return initSrbState(part);
  if (family === 'rcs') return initRcsState(part);
  return null;
}

/**
 * The two Core libraries a solid burn preview needs. The dialog subscribes to them and hands
 * the snapshot to {@link wizardPerformance}, so Review and the Finish toast can never quote
 * two different numbers.
 */
interface SolidCatalogs {
  /** `$grainIndex` — grain id → profile. Legitimately empty when `/ksa/` is not served. */
  grains: ReadonlyMap<string, GrainGeometryTable>;
  /** `$solidDensities` — solid substance id → `<StorageDensity KgPerM3>`. */
  densities: ReadonlyMap<string, number>;
}

/**
 * The Review headline and the Finish toast's figure, computed off the wizard STATE (which
 * already carries every input the build will use), or `null` when no figure can be computed
 * HONESTLY. Pure — no stores, no minting — so the dialog may call it in its render body.
 */
function wizardPerformance(
  state: WizardState,
  reactions: ReadonlyMap<string, ReactionData> | undefined,
  solids: SolidCatalogs,
): WizardPerformance | null {
  if (state.family === 'srb') return srbPerformance(state, reactions, solids);
  return deLavalPerformance(state, reactions);
}

/**
 * Liquid and RCS alike: an RCS thruster IS a De Laval nozzle on a combustor, so the same
 * prediction applies — only the field the chamber pressure is spelled in differs.
 */
function deLavalPerformance(
  state: LiquidWizardState | RcsWizardState,
  reactions: ReadonlyMap<string, ReactionData> | undefined,
): WizardPerformance | null {
  const reaction = reactions?.get(state.reactionId);
  if (!reaction) return null;
  const lut = resolveReactionLut(reaction, state.mixtureRatio);
  if (!lut) return null;
  const perf = predictPerformance({
    lut,
    maxPressurePa:
      (state.family === 'rcs' ? state.maxPressureBar : state.chamberPressureBar) * PA_PER_BAR,
    exitDiameterM: state.exitDiameterM,
    areaRatio: state.areaRatio,
    thermalEfficiency: state.thermalEffPct / 100,
    flowEfficiency: state.flowEffPct / 100,
    expansionEfficiency: state.expansionEffPct / 100,
  });
  if (!(perf.thrustVacN > 0) || !Number.isFinite(perf.ispVac)) return null;
  if (state.family === 'rcs') {
    return {
      family: 'rcs',
      thrustVacN: perf.thrustVacN,
      ispVacS: perf.ispVac,
      nozzleCount: state.layout.nozzles.length,
    };
  }
  if (!Number.isFinite(perf.thrustSLN)) return null;
  return {
    family: 'liquid',
    thrustVacN: perf.thrustVacN,
    thrustSLN: perf.thrustSLN,
    ispVacS: perf.ispVac,
  };
}

/**
 * The solid burn headline, sampled through the same `SolidMotor.TrySampleThrustCurve` port
 * Engine mode's card uses. Every degradation that card names — no grain library, a CUSTOM
 * propellant with no `<StorageDensity>` to look up, a stack that never lights — lands on
 * `null` here, and the headline is simply not rendered. flexo never invents a density, and
 * the wizard never quotes a burn it could not sample.
 */
function srbPerformance(
  state: SrbWizardState,
  reactions: ReadonlyMap<string, ReactionData> | undefined,
  solids: SolidCatalogs,
): WizardPerformance | null {
  const reaction = reactions?.get(state.reactionId);
  if (!reaction || reaction.kind !== 'Fixed' || reaction.category !== 'Solid') return null;
  if (
    !reaction.burnRate ||
    reaction.minimumBurnPressurePa == null ||
    reaction.maxStablePressurePa == null
  ) {
    return null;
  }
  const density = solids.densities.get(substanceIdOfPhase(reaction.reactants[0]?.phaseId ?? ''));
  if (!density) return null;
  const geometry = solids.grains.get(state.grainGeometryId);
  if (!geometry) return null;

  // Guarded rather than clamped: Review renders on states the `srb-grain` step still blocks,
  // and `Array.from({length})` over an unvalidated count is how a preview hangs the tab.
  const count = state.grain.segmentCount;
  const bound = WIZARD_BOUNDS.segmentCount;
  if (!Number.isInteger(count) || count < bound.min || count > bound.max) return null;

  const curve = sampleThrustCurve({
    lut: reaction.lut,
    thermalEfficiency: state.thermalEffPct / 100,
    authoredChamberPressurePa: state.defaultPressureBar * PA_PER_BAR,
    burnRate: reaction.burnRate,
    minimumBurnPressurePa: reaction.minimumBurnPressurePa,
    maxStablePressurePa: reaction.maxStablePressurePa,
    exhaustCondensedFraction: reaction.exhaustCondensedFraction ?? 0,
    storageDensityKgPerM3: density,
    segments: Array.from({ length: count }, () => ({
      outerRadiusM: state.grain.outerRadiusM,
      wallThicknessMm: state.grain.wallThicknessMm,
      lengthM: state.grain.lengthM,
      geometry,
    })),
    nozzles: [
      {
        exitDiameterM: state.nozzle.exitDiameterM,
        flowEfficiency: state.nozzle.flowEffPct / 100,
        expansionEfficiency: state.nozzle.expansionEffPct / 100,
        // The wizard authors one nozzle and never a multiplier — KSA's default.
        areaRatioMultiplier: 1,
      },
    ],
  });
  if (!curve) return null;
  if (!(curve.peakThrustN > 0) || !(curve.burnSeconds > 0) || !Number.isFinite(curve.vacuumIspS)) {
    return null;
  }
  return {
    family: 'srb',
    peakThrustN: curve.peakThrustN,
    burnSeconds: curve.burnSeconds,
    ispVacS: curve.vacuumIspS,
  };
}

/**
 * The Finish toast's headline figure, or `null` when {@link wizardPerformance} could not
 * compute one honestly (the catalog is still loading, the reaction is unknown, a mixture
 * reaction has no ratio, the solid data files are not served, or the inputs never choke).
 * Never renders `NaN` — the toast falls back to the part name alone.
 */
function thrustSummary(perf: WizardPerformance | null): string | null {
  if (!perf) return null;
  if (perf.family === 'srb') {
    return `${(perf.peakThrustN / 1000).toFixed(1)} kN peak · ${perf.burnSeconds.toFixed(1)} s burn`;
  }
  if (perf.family === 'rcs') return `${perf.thrustVacN.toFixed(0)} N vacuum per nozzle`;
  return `${(perf.thrustVacN / 1000).toFixed(1)} kN vacuum`;
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
