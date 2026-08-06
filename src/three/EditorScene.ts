import * as THREE from 'three';
import type { ReadableAtom } from 'nanostores';
import { Viewport } from './Viewport';
import { SubPartObject } from './SubPartObject';
import { ConnectorObject } from './ConnectorObject';
import { ColliderObject } from './ColliderObject';
import { IvaSeatObject } from './IvaSeatObject';
import { collectWorldPoints } from './samplePoints';
import { fitCollider, IDENTITY_QUAT, type Quat } from '../ksa/colliderFit';
import {
  $colliderFitRequest,
  $colliderSettings,
  $coverageReport,
  $coverageRequest,
  setCoverageReport,
  type ColliderFitRequest,
} from '../state/colliderStore';
import {
  $ivaSeatAimRequest,
  clearIvaSeatAimRequest,
  type IvaSeatAimRequest,
} from '../state/ivaSeatStore';
import { $seatView, exitSeatView } from '../state/ivaStore';
import { SEAT_LOCAL_UP, seatAxesFromRotation, seatRotationFromAxes } from '../ksa/ivaSeatAxes';
import { evaluateCoverage, type PlacedCollider } from '../measure/colliderCoverage';
import { KittenObject } from './KittenObject';
import { LightObject } from './LightObject';
import { planPreviewBudget } from './lightVolume';
import { SelectionManager } from './SelectionManager';
import { marqueeHits, type ScreenAabb } from './marqueeSelect';
import { TransformGizmo } from './TransformGizmo';
import { PoseGizmo } from './PoseGizmo';
import { JointMarkerLayer } from './JointMarkerLayer';
import { TrajectoryLayer } from './TrajectoryLayer';
import { MeasurementLayer } from './MeasurementLayer';
import { ContainerLayer } from './ContainerLayer';
import { ChainPreviewLayer } from './ChainPreviewLayer';
import { $chainEval } from './chainEval';
import { NozzleHandleObject } from './NozzleHandleObject';
import {
  colliderLocalFromWorld,
  colliderWorld,
  exhaustLocalDirection,
  exhaustLocalLocation,
  exhaustWorldDirection,
  exhaustWorldLocation,
  lightLocalFromWorld,
  lightWorld,
  matrixFromTransform,
  readPlacementTransform,
  transformFromMatrix,
} from './coords';
import {
  centroidOf,
  groupScaledTransform,
  rotatedAroundOriginTransform,
  translatedTransform,
} from './bulkTransform';
import { initTextureSupport } from './textureSupport';
import type { CatalogSubPart } from '../ksa/catalog';
import type {
  EditingPart,
  PartCollider,
  PartLight,
  SubPartPlacement,
  Transform,
  Vec3,
} from '../ksa/types';
import {
  $bulkScaleMode,
  $colliderEditContext,
  $gizmoSpace,
  $lightEditContext,
  $part,
  $selection,
  deselectRefs,
  entityIndexOf,
  refLayerId,
  select,
  toggleRef,
  type EntityKind,
  $snap,
  $toolMode,
  aimIvaSeat,
  clearSelection,
  duplicateSelected,
  pushUndo,
  revealEntity,
  addCollider,
  selectedTransformRefs,
  setColliderEditContext,
  setLightEditContext,
  updateColliderTransform,
  updateLightTransform,
  updateSelectedTransform,
  type SelectedTransformRef,
} from '../state/editorStore';
import { liftedSelectionRefs, writeBackLifted } from './selectionTransform';
import { applySnapToGizmo } from '../state/snapStore';
import { $heldModifiers } from '../state/modifierStore';
import { $catalogIndex, $customCatalog } from '../state/catalogStore';
import {
  $activeMeasurementId,
  addMeasurement,
  removeMeasurement,
  setActiveMeasurement,
  setMeasurePending,
  setMeasureTool,
  updateMeasurement,
} from '../state/measurementStore';
import { $activeContainerId, setActiveContainer } from '../state/containerStore';
import {
  $activeAnimation,
  $activeAnimationId,
  $activeJointId,
  $animPlaying,
  $animScrubbing,
  $animTrails,
  $editKeyframeId,
  $memberHoverId,
  $memberPaintTarget,
  $membersView,
  $pivotEditing,
  $pivotPickTarget,
  $pivotRouting,
  $playheadParked,
  $playheadSec,
  $posedPlacementLock,
  $workingPivot,
  moveJointPivot,
  paintMemberOnTarget,
  poseToolMode,
  reorientJointPivot,
  setJointPivotPoint,
  setJointPose,
} from '../state/animationStore';
import { jointWorld, previewOverrideMatrix, restAnchorTime } from '../ksa/animationRig';
import type { PartAnimation } from '../ksa/types';
import {
  $activeTool,
  $marqueeRect,
  $mode,
  armTool,
  disarmTool,
  registerTool,
} from '../state/modeStore';
import { $dataFlash, $dataHighlight, setDataScope } from '../state/dataModeStore';
import {
  $faceDraft,
  $faceHighlight,
  faceKeysFor,
  pickSurfaceFace,
  pickSurfaceMesh,
} from '../state/surfaceModeStore';
import { applyFaceUvTransforms, buildPrimitiveGeometry } from './primitives';
import { status, undoStatusAction } from '../state/statusStore';
import {
  $activeEngineEntry,
  $activeNozzleRef,
  $activeNozzleTarget,
  $effectiveToolMode,
  $resolvedNozzleTargets,
  setActiveNozzleRef,
  setExhaustPlacing,
  updateNozzleAt,
  type NozzleRef,
  type NozzleTarget,
} from '../state/engineStore';
import {
  $connectorSettings,
  $ivaSeatSettings,
  $lightSettings,
  $selectionHighlight,
  lightSettings,
  setLightPreviewCount,
  type ConnectorSettings,
  type IvaSeatSettings,
  type LightVizSettings,
} from '../state/settingsStore';
import {
  $cameraFrame,
  $cameraRestore,
  $cameraSnap,
  $gizmoCancel,
  $gizmoDragging,
  $grids,
  $hideInterior,
  $kindVisibility,
  isKindVisible,
  kindVisibility,
} from '../state/viewStore';
import { computeSelectionBounds, computeVisibleWorldBounds } from '../measure/bounds';
import { frameDistance } from './cameraFraming';
import { $thumbnailRequest, storeThumbnail } from '../state/projectStore';
import { $currentProjectId } from '../state/projectIndexStore';
import { resolveInternal } from '../ksa/modExport';
import { $layerView, isLayerLocked, isLayerVisible, layerViewState } from '../state/layerStore';
// The app's one user-facing feedback channel (a module function by design, since there is
// no React context down here) — the scene has no other way to say "that did nothing, and
// here is why".
import { toast } from '../ui/toast';

/**
 * How strongly a Data-mode scope tint drives the shared selection-highlight emissive. Well
 * under the full selection value so "this is what your form edits" never reads as "this is
 * selected" (design §A2).
 */
const DATA_TINT_STRENGTH = 0.4;

/**
 * Membership tint strengths (design-animation-mode.md §7.6). Three readable classes on the
 * one emissive channel: the target joint's members, everyone else's, and the pulse under the
 * Members row your pointer is on.
 */
const MEMBER_TINT_TARGET = 0.55;
const MEMBER_TINT_OTHER = 0.22;
const MEMBER_TINT_HOVER = 1;

/**
 * Plural nouns for the "this kind carries no SubPart data" status message Data mode posts
 * when a non-capable entity is clicked (design §A2 last paragraph).
 */
const NON_CAPABLE_NOUN: Record<Exclude<EntityKind, 'subpart'>, string> = {
  connector: 'Connectors',
  collider: 'Colliders',
  ivaSeat: 'IVA seats',
  light: 'Lights',
  kitten: 'Kittens',
};

/** A highlightable scene entity — both SubPartObject and ConnectorObject match. */
interface SelectableObject {
  readonly group: THREE.Group;
  setSelected(selected: boolean): void;
}

/**
 * Owns the three.js {@link Viewport} and keeps the rendered scene in sync with
 * the editor store. This is the ONLY place that mutates scene objects from
 * state: it subscribes to `$part` (and the catalog index) and reconciles a
 * Map<instanceId, SubPartObject>. SubPart geometry loads asynchronously, so
 * builds are guarded against placements that were removed mid-load.
 *
 * Selection highlight and transform gizmos attach here in Phase 6.
 *
 * RENDERING IS ON-DEMAND. The viewport draws only when invalidated, so every
 * store subscription goes through {@link sub} (which invalidates for you) and
 * every async build invalidates when it lands. Subscribing directly would leave
 * the change invisible until something else happened to trigger a frame.
 */
export class EditorScene {
  readonly viewport: Viewport;
  private readonly root = new THREE.Group();
  private readonly objects = new Map<string, SubPartObject>();
  private readonly connectorObjects = new Map<string, ConnectorObject>();
  private readonly kittenObjects = new Map<string, KittenObject>();
  /**
   * Collider visuals, keyed by collider id. An ARRAY per collider because a SubPart-owned
   * one is drawn once per PLACEMENT of its template — KSA has no per-instance collider, so
   * every instance really does carry the same shape (see scope/colliders.md §4). A
   * part-level collider always has exactly one entry.
   */
  private readonly colliderObjects = new Map<string, ColliderObject[]>();
  // NOTE which per-placement collider visual the gizmo edits through is NOT a private map
  // here (it was in v1): like the light context it lives in the store, as
  // `$colliderEditContext`, so the gizmo, the numeric fields and the KEYBOARD tools
  // (`selectionTransform.liftedSelectionRefs`) all resolve the same frame — the fix for the
  // census's pain 4. Read via {@link colliderContextIndex}.
  /**
   * IVA seat markers, keyed by seat id. ONE visual per seat — a seat is Part-level data
   * (`<IVASeat>` on `<PartGameData>`), so unlike a collider it is never drawn per placement.
   */
  private readonly seatObjects = new Map<string, IvaSeatObject>();
  /**
   * Light markers, keyed by light id. An ARRAY per light because a SubPart-owned one is
   * drawn once per PLACEMENT of its owning template — KSA instantiates the template's
   * `<Light>` per SubPart instance (`LightModule.UpdateRenderData`;
   * plans/LIGHT_MANAGEMENT_PLAN.md §1.3), so every instance really does cast the same
   * light. A part-level light always has exactly one entry.
   */
  private readonly lightObjects = new Map<string, LightObject[]>();
  // NOTE the light editing context (which per-placement visual the gizmo writes through)
  // also drives the inspector's part-frame fields, so it lives in the store as
  // $lightEditContext — one source every consumer reads via {@link lightContextIndex}, so
  // they can never disagree. `$colliderEditContext` is its exact twin.
  /** Red dots marking sample points outside every collider (the last coverage check). */
  private coverageDots: THREE.Points | null = null;
  private readonly building = new Set<string>();
  private readonly kittenBuilding = new Set<string>();
  private index: Map<string, CatalogSubPart> = new Map();
  private connectorSettings: ConnectorSettings = $connectorSettings.get();
  private ivaSeatSettings: IvaSeatSettings = $ivaSeatSettings.get();
  // Read through lightSettings() so a settings object persisted before a field
  // existed resolves that field to its default instead of `undefined` (which would
  // silently disable coverage) — see the resolver's JSDoc.
  private lightSettings: LightVizSettings = lightSettings();
  private readonly unsubscribers: Array<() => void> = [];
  private readonly selection: SelectionManager;
  private readonly gizmo: TransformGizmo;
  private readonly measurements: MeasurementLayer;
  private readonly containers: ContainerLayer;
  private readonly chainPreview: ChainPreviewLayer;
  private highlighted: SelectableObject[] = [];
  /** Placements currently wearing Data mode's scope tint (never a selected one). */
  private tinted: SubPartObject[] = [];
  /** Connector markers lit by a one-shot Data-mode flash (never a selected one). */
  private flashedConnectors: ConnectorObject[] = [];
  /** Placements currently wearing Surface mode's face tint (never a selected one). */
  private faceHighlighted: SubPartObject[] = [];
  /** Placements currently rendering the left Face card's live UV draft geometry. */
  private faceDraftObjects: SubPartObject[] = [];
  /** The draft geometry those placements share; owned here, disposed on clear. */
  private faceDraftGeometry: THREE.BufferGeometry | null = null;
  private attachedObject: THREE.Object3D | null = null;
  /** Instance ids whose group transform is currently overridden by the animation preview. */
  private animOverridden = new Set<string>();
  /**
   * Empty group the gizmo attaches to when 2+ SubParts are selected. Positioned
   * at the selection centroid with identity rotation/scale; the gizmo drives it
   * and {@link applyBulkFromPivot} fans the delta out to every selected SubPart.
   */
  private readonly pivot = new THREE.Group();
  /** Per-SubPart starting transforms captured at the start of a bulk gizmo drag. */
  private bulkSnapshot: {
    centroid: Vec3;
    /** The pivot's POSITION when the drag began — the translate delta's origin. */
    startPos: THREE.Vector3;
    /** The pivot's orientation when the drag began (see {@link beginBulkDrag}). */
    startQuat: THREE.Quaternion;
    /** The pivot's SCALE when the drag began — the scale factor's denominator. */
    startScale: THREE.Vector3;
    items: SelectedTransformRef[];
  } | null = null;
  /**
   * Empty group the {@link poseGizmo} attaches to while editing a joint pose (and ONLY it —
   * TransformControls detaches for the session). Positioned at the joint's world frame
   * W_J(t) of the edited keyframe; a gizmo drag moves it, and
   * {@link handlePoseGizmoChange} reads it back to the joint's local pose (Part-space
   * since {@link root} is at identity). Takes precedence over the selection gizmo.
   */
  private readonly poseProxy = new THREE.Group();
  /**
   * The animation-specific pose gizmo (design-animation-mode.md §9.2, LOCKED #8). It drives
   * {@link poseProxy} exactly as {@link TransformGizmo} would, but with rings sized to the
   * joint, a screen-space free-drag disc and per-gesture axis locks. TransformControls stays
   * for Build/Engine and never attaches for posing any more.
   */
  private readonly poseGizmo: PoseGizmo;
  /** Pickable markers for every joint of the open clip, at the rest anchor (§9.3). */
  private readonly jointMarkers: JointMarkerLayer;
  /** Read-only motion trails per animated joint (§9.5). */
  private readonly trajectories: TrajectoryLayer;

  /**
   * Engine designer: ONE marker per nozzle exhaust placement of the open engine (both
   * flavors, both channels — see {@link $resolvedNozzleTargets}), keyed by target key, plus
   * an empty proxy the gizmo attaches to so a drag edits the ACTIVE nozzle's placement.
   *
   * All of them are drawn, not just the target: KSA authors many nozzles on one owner (the
   * MMU RCS puts its whole battery on `<PartGameData>`), and a single marker made an N-bell
   * block unreadable. Only present while the Engine designer ($mode==='engine')
   * has an engine open; the gizmo attaches only while the `exhaust` TOOL is armed.
   * Mirrors the pose pivot/proxy pair.
   */
  private readonly nozzleHandles = new Map<string, NozzleHandleObject>();
  /** Target key → the nozzle it names, so a click on a handle resolves back to a ref. */
  private readonly nozzleRefs = new Map<string, NozzleRef>();
  private readonly engineProxy = new THREE.Group();

  // Point-to-point measurement picking.
  private readonly raycaster = new THREE.Raycaster();
  private pendingMeasurementId: string | null = null;
  private pickPointerDown: { x: number; y: number } | null = null;

  // Click-selection is suppressed by several independent modes at once, so each keeps
  // its own flag and {@link applySelectionSuppression} ORs them — a shared boolean would
  // let whichever mode ended last re-enable picking under one that is still active.
  private suppressPickDrag = false;
  private suppressPickMeasure = false;
  private suppressPickSeatView = false;
  private suppressPickMarquee = false;
  private suppressPickPaint = false;

  /** SubParts currently wearing a membership tint (design-animation-mode.md §7.6). */
  private membershipTinted: SubPartObject[] = [];

  /**
   * The marquee drag in flight (design-build-mode.md §1.4), or null. `boxes` is snapshotted
   * ONCE at pointerdown — orbit is disabled for the duration, so the camera cannot move and
   * the projection cannot go stale. `armed` records that the `B` tool started this drag, so
   * release can honour the one-shot rule.
   */
  private marquee: {
    mode: 'replace' | 'add' | 'subtract';
    armed: boolean;
    downX: number;
    downY: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    boxes: ScreenAabb[];
    pointerId: number;
  } | null = null;

  constructor(host: HTMLElement) {
    this.viewport = new Viewport(host);
    // Must precede the store subscriptions below (they build SubParts, which
    // request textures through the loader initialized here).
    initTextureSupport(this.viewport.renderer);
    this.root.name = 'flexo-part';
    this.viewport.scene.add(this.root);
    if (import.meta.env.DEV)
      (window as unknown as { __editorScene?: EditorScene }).__editorScene = this;
    this.pivot.name = 'bulk-pivot';
    this.root.add(this.pivot);
    this.poseProxy.name = 'pose-proxy';
    this.root.add(this.poseProxy);
    this.engineProxy.name = 'engine-exhaust-proxy';
    this.root.add(this.engineProxy);

    this.selection = new SelectionManager(
      this.viewport.camera,
      this.viewport.renderer.domElement,
      this.root,
      (selected, additive) => {
        if (!selected) {
          if (!additive) clearSelection();
          return;
        }
        // A nozzle-exhaust handle is not a document entity — clicking one re-targets the
        // exhaust gizmo and deliberately leaves the mesh/connector selection alone (the
        // engine's own SubPart usually IS what's selected while you place its exhaust).
        // A joint marker is not a document entity either (design §9.3): clicking one
        // ACTIVATES that joint — the tree row, the timeline row and the left card all follow
        // `$activeJointId` — and deliberately leaves the placement selection alone.
        if (selected.kind === 'joint') {
          $activeJointId.set(selected.id);
          return;
        }
        if (selected.kind === 'nozzle') {
          const ref = this.nozzleRefs.get(selected.id);
          if (ref) setActiveNozzleRef(ref);
          // Clicking a handle is one of exhaust placement's four arming routes
          // (design §B7): the handles are mode furniture and stay pickable while the tool
          // is idle, so a click has to arm the slot as well as re-target it.
          setExhaustPlacing(true);
          return;
        }
        setActiveMeasurement(null); // selecting a mesh closes any measurement edit
        const part = $part.get();
        const kind = selected.kind;
        const index = entityIndexOf(part, kind, selected.id);
        if (index < 0) return;
        const layerId = refLayerId(part, { kind, id: selected.id });
        if (isLayerLocked(layerId)) return;
        if (!isLayerVisible(layerId)) return; // three.js does not skip invisible objects during raycasting
        if (!this.isKindDisplayed(kind)) return; // …nor kinds hidden by View ▸ Display Filters
        // Remember WHICH visual of a multi-instance entity was clicked, so the gizmo (and,
        // for a light, the inspector's part-frame fields) edit through that instance's frame.
        if (kind === 'collider') setColliderEditContext(selected.id, selected.instanceIndex ?? 0);
        if (kind === 'light') setLightEditContext(selected.id, selected.instanceIndex ?? 0);
        if (additive) toggleRef({ kind, id: selected.id });
        else select([{ kind, id: selected.id }]);
        revealEntity(kind, selected.id); // scroll the row into view in the entity list
        // Select-in-3D, the other direction (design §A2): in Data mode a click on a
        // placement ALSO retargets the scope, and a click on anything else says why it
        // cannot. Selection behavior itself is unchanged in every mode.
        if ($mode.get() === 'data') {
          if (kind === 'subpart') {
            const templateId = part.placements.find(
              (p) => p.instanceId === selected.id,
            )?.subPartTemplateId;
            if (templateId) setDataScope({ kind: 'template', templateId });
          } else {
            status(`${NON_CAPABLE_NOUN[kind]} have no SubPart data — edited in Build mode`);
          }
        }
        // Surface mode's click-to-pick (design-surface-assets.md §1.5): clicking a CUSTOM
        // mesh's placement also picks its template and, for a primitive, the face under the
        // cursor. A built-in SubPart is a plain selection — the left sidebar answers it with
        // the read-only built-in surface card (D7).
        if ($mode.get() === 'surface' && kind === 'subpart') {
          const templateId = part.placements.find(
            (p) => p.instanceId === selected.id,
          )?.subPartTemplateId;
          const mesh = part.customMeshes.find((m) => m.subPartId === templateId);
          if (mesh) {
            pickSurfaceMesh(mesh.id);
            // The array order of PRIMITIVE_FACE_KEYS IS the geometry group / materialIndex
            // order (three/primitives.ts), so the hit's group index maps straight back.
            const keys = faceKeysFor(mesh);
            const key =
              selected.faceGroupIndex !== undefined ? keys[selected.faceGroupIndex] : keys[0];
            if (key) pickSurfaceFace(key);
          }
        }
      },
    );

    this.gizmo = new TransformGizmo(this.viewport, {
      onDragStart: () => {
        // Placing a nozzle exhaust: one undo step, no bulk snapshot.
        if (this.attachedObject === this.engineProxy) {
          const target = this.activeNozzleTarget();
          pushUndo(target?.ref.channel === 'fx' ? 'plume FX' : 'exhaust', target?.nozzle.id ?? '');
          return;
        }
        // ⌥ at drag start duplicates FIRST and drags the copies, as ONE undo step labeled
        // 'duplicate' — so the normal move/rotate/scale push below is deliberately skipped
        // (design-build-mode.md §5.1). Streaming per-frame writes proceed as normal.
        if (this.beginDuplicateDrag()) return;
        const mode = $toolMode.get();
        const refs = selectedTransformRefs();
        // A seat has no size — KSA has no seat size field, so `assignIvaSeat` pins scale to
        // (1,1,1) and a scale drag on seats alone changes nothing. Pushing an undo step for
        // it would only make the next Ctrl+Z look dead. The bulk snapshot still runs.
        // Lights are scale-inert for the same reason (KSA ignores light scale; `assignLight`
        // pins it), so a seats-and/or-lights-only scale drag is equally a no-op.
        const seatScaleOnly =
          mode === 'scale' &&
          refs.length > 0 &&
          refs.every((r) => r.kind === 'ivaSeat' || r.kind === 'light');
        if (!seatScaleOnly) {
          const desc = mode === 'rotate' ? 'rotate' : mode === 'scale' ? 'scale' : 'move';
          const detail =
            refs.length === 1 ? refs[0].name : refs.length > 1 ? `${refs.length} items` : '';
          pushUndo(desc, detail);
        }
        this.beginBulkDrag();
      },
      onChange: (object) => {
        if (object === this.engineProxy) this.handleEngineGizmoChange();
        else this.handleGizmoChange(object);
      },
      onDraggingChanged: (dragging) => {
        this.suppressPickDrag = dragging;
        // Publishes the drag to the Escape ladder (rung 4 — `$gizmoCancel` below).
        $gizmoDragging.set(dragging);
        this.applySelectionSuppression();
        // ⌃ inverts snap for the duration of the drag only; release restores the setting.
        applySnapToGizmo(dragging && $heldModifiers.get().ctrl);
        if (!dragging) {
          this.endBulkDrag();
          this.updateSelection(); // re-snap the pose proxy to the committed pose
        }
      },
    });

    // The pose gizmo mirrors TransformGizmo's contract exactly — ONE undo push at drag
    // start, streaming `onChange`, orbit + picking suppressed for the duration — so posing
    // keeps the invariants v1 established while getting handles built for the job (§9.2).
    this.poseGizmo = new PoseGizmo(this.viewport, {
      onDragStart: (mode) => {
        const pose = this.poseEditTarget();
        if (!pose) return;
        // The label is the OPERATION, because at the rest anchor a drag relocates the hinge
        // rather than posing it (§9.4). Undo history must say which one it was.
        if ($pivotRouting.get()) {
          pushUndo(mode === 'rotate' ? 'reorient pivot' : 'move pivot', pose.joint.name);
          return;
        }
        pushUndo('pose', `${pose.joint.name} @ ${pose.kf.timeSec.toFixed(2)}s`);
      },
      onChange: () => this.handlePoseGizmoChange(),
      onDraggingChanged: (dragging) => {
        this.suppressPickDrag = dragging;
        this.viewport.controls.enabled = !dragging;
        $gizmoDragging.set(dragging); // Escape ladder rung 4
        this.applySelectionSuppression();
        if (!dragging) this.updateSelection(); // re-snap the proxy to the committed pose
      },
    });
    this.jointMarkers = new JointMarkerLayer(this.viewport, this.root);
    this.trajectories = new TrajectoryLayer(this.viewport);

    this.measurements = new MeasurementLayer(this.viewport, () =>
      this.selectedObjects().map((o) => o.group),
    );
    this.containers = new ContainerLayer(this.viewport, () =>
      [...this.objects.values()].map((o) => o.group),
    );
    // Ghosts clone the built objects, so the layer reads them straight out of this
    // map — an instance still loading simply has no ghost until the build lands.
    this.chainPreview = new ChainPreviewLayer(this.viewport, (id) => this.objects.get(id));

    const dom = this.viewport.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPickPointerDown);
    dom.addEventListener('pointerup', this.onPickPointerUp);
    // AFTER the SelectionManager's own listeners on purpose: its (suppressed) pointerup
    // must run before the marquee's, which is what clears the suppression again.
    dom.addEventListener('pointerdown', this.onMarqueePointerDown);
    dom.addEventListener('pointermove', this.onMarqueePointerMove);
    dom.addEventListener('pointerup', this.onMarqueePointerUp);
    // The tool slot's first real tenant (foundation §2.6): Esc-ladder rung 5 and a mode
    // switch both cancel through here, so the gesture has exactly ONE teardown path.
    registerTool('marquee', { onCancel: () => this.cancelMarquee() });
    // Measure is the second `$activeTool` tenant (P5B.25): the suppression now keys off the
    // SLOT rather than `$measureTool`, so arming any other tool tears the pick down through
    // exactly one path. The picking flow below is otherwise verbatim v1.
    this.sub($activeTool, (tool) => {
      // `member-paint` (design-animation-mode.md §7.4) is the third tenant and suppresses
      // picking on the same contract: while it holds the slot, clicks belong to the tool, so
      // normal selection and gizmo picking stand down and the canvas wears a brush cursor.
      const painting = tool === 'member-paint';
      if (painting !== this.suppressPickPaint) {
        this.suppressPickPaint = painting;
        this.applySelectionSuppression();
        this.updateSelection(); // detach the gizmo / re-attach it on disarm
        this.applyMembershipTint();
      }
      // `pivot-pick` (§9.4) shares the measure tool's suppression: one click belongs to the
      // tool, so selection and gizmo picking stand down and the canvas wears a crosshair.
      const picking = tool === 'measure' || tool === 'pivot-pick';
      // Keyed on the MEASURE tool, not on `picking`: arming pivot-pick straight off a
      // half-placed measurement must still remove that half measurement.
      if (tool !== 'measure') this.cancelPendingMeasurement();
      if (picking !== this.suppressPickMeasure) {
        this.suppressPickMeasure = picking;
        this.applySelectionSuppression();
      }
      dom.style.cursor = picking ? 'crosshair' : painting ? 'cell' : '';
    });
    // The membership tints follow the view, its target joint and the hovered row — invalidate
    // on state change only, never a continuous loop (guardrail 10).
    this.sub($membersView, () => this.applyMembershipTint());
    this.sub($memberHoverId, () => this.applyMembershipTint());
    // Editing a measurement, editing a container, and selecting a mesh are all
    // mutually exclusive, so only one gizmo is ever active at a time.
    this.sub($activeMeasurementId, (id) => {
      if (id) {
        clearSelection();
        setActiveContainer(null);
      }
    });
    this.sub($activeContainerId, (id) => {
      if (id) {
        clearSelection();
        setActiveMeasurement(null);
      }
    });
    // Selecting any mesh closes container editing (its gizmo would otherwise fight
    // the selection gizmo).
    const clearContainerOnSelect = () => {
      if (this.selectedObjects().length > 0) setActiveContainer(null);
    };
    this.sub($selection, clearContainerOnSelect);

    // nanostores `subscribe` fires immediately with the current value.
    this.sub($catalogIndex, (index) => {
      this.index = index;
      this.reconcile($part.get());
    });
    // A custom template's geometry/texture can change in place (the catalog entry's
    // atlas/diffuse blob URL changes) while its placements keep the same template id.
    // reconcile() never rebuilds existing objects, so dispose the affected ones and
    // let reconcile re-create them from the fresh entry.
    this.sub($customCatalog, (custom) => {
      const customIds = new Set(custom.map((c) => c.id));
      const part = $part.get();
      for (const [id, obj] of this.objects) {
        const placement = part.placements.find((p) => p.instanceId === id);
        if (placement && customIds.has(placement.subPartTemplateId)) {
          this.root.remove(obj.group);
          obj.dispose();
          this.objects.delete(id);
        }
      }
      this.index = $catalogIndex.get();
      this.reconcile(part);
    });
    this.sub($part, (part) => this.reconcile(part));
    // $chainEval already recomputes on $part changes as well as session edits, so this
    // one subscription covers everything the ghosts react to — gizmo drags of a seed,
    // parameter typing, undo, session close (it goes null and the ghosts clear).
    this.sub($chainEval, () => this.chainPreview.refresh());
    // Animation preview: re-apply the joint-driven transform override when the active
    // animation, scrub position, or edited keyframe changes ($part changes already
    // re-apply via reconcile). Fires immediately on subscribe (harmless no-op at rest).
    const onPreviewChange = () => {
      this.applyAnimationPreview();
      this.updateSelection(); // re-evaluate gizmo suppression for posed animated parts
    };
    // The three animation viewport layers (§9.1 affordance flags). Markers and trails are
    // pure functions of the document + the open clip/joint, so they rebuild here and NEVER
    // on the playhead — the trail layer subscribes `$playheadSec` itself, imperatively, and
    // moves only its bead (guardrail 10).
    const onAnimLayersChange = () => {
      this.jointMarkers.refresh();
      this.trajectories.refresh();
    };
    this.sub($activeAnimationId, onAnimLayersChange);
    this.sub($activeJointId, onAnimLayersChange);
    this.sub($mode, onAnimLayersChange);
    this.sub($part, onAnimLayersChange);
    this.sub($animTrails, () => this.trajectories.refresh());
    this.sub($activeTool, () => this.jointMarkers.refresh());
    this.sub($workingPivot, () => {
      this.jointMarkers.refresh();
      this.updateSelection(); // the pose gizmo rotates about the working pivot (§9.2)
    });
    this.sub($pivotEditing, () => {
      this.jointMarkers.refresh();
      this.updateSelection();
    });
    this.sub($activeAnimationId, onPreviewChange);
    this.sub($activeJointId, onPreviewChange);
    this.sub($playheadSec, onPreviewChange);
    this.sub($playheadParked, onPreviewChange);
    this.sub($animScrubbing, onPreviewChange);
    this.sub($animPlaying, onPreviewChange);
    this.sub($editKeyframeId, onPreviewChange);
    // Leaving/entering the Animation editor toggles the preview + pose gizmo on/off.
    this.sub($mode, onPreviewChange);
    // Engine designer: refresh the exhaust markers + (re)attach the exhaust gizmo when the
    // open engine / target instance / targeted nozzle / gizmo toggle / mode changes. NOT
    // $resolvedNozzleTargets itself — it also derives from $part, which reconcile() already
    // covers, so subscribing to it would do every handle pass twice per document edit.
    const onEngineChange = () => {
      this.applyEngineHandles();
      this.updateSelection();
    };
    this.sub($activeEngineEntry, onEngineChange);
    this.sub($activeNozzleRef, onEngineChange);
    // The exhaust TOOL slot, not a feature flag: arming is what attaches the gizmo
    // (design §B7 — the one behavior change from v1's separate toggle, same UX).
    this.sub($activeTool, onEngineChange);
    this.sub($mode, onEngineChange);
    this.sub($selection, () => this.updateSelection());
    // Data mode's scope tint + the one-shot flash (design §A2, §A5). Both go through
    // `sub`, so the on-demand render loop is invalidated for us.
    this.sub($dataHighlight, () => this.applyDataTint());
    this.sub($dataFlash, () => this.applyDataTint());
    // Surface mode's template-scoped face tint (design-surface-assets.md §1.5, D12) and the
    // left Face card's live UV draft (§1.4). Both go through `sub`, so the on-demand loop is
    // invalidated for us — neither forces a continuous frame (foundation §14.5).
    this.sub($faceHighlight, () => this.applyFaceHighlight());
    this.sub($faceDraft, () => this.applyFaceDraft());
    // A context change re-targets a selected light's highlight + gizmo to the newly
    // clicked instance even when the selection indices themselves are unchanged.
    this.sub($lightEditContext, () => this.updateSelection());
    // The collider twin: the frame every consumer edits an owned collider through.
    this.sub($colliderEditContext, () => this.updateSelection());
    // Collider fitting needs world geometry, which only exists here — the UI publishes an
    // intent and this consumes it (see colliderStore).
    this.sub($colliderFitRequest, (req) => {
      if (req) this.handleColliderFit(req);
    });
    this.sub($coverageRequest, (wanted) => {
      if (wanted) this.handleCoverageCheck();
    });
    // The uncovered-point dots are a snapshot of one check; editing invalidates them.
    this.sub($coverageReport, () => this.applyCoverageDots());
    // Aiming a seat needs the world-space centroid of the selection, which only exists
    // here — same intent → scene → store round trip as the collider fit (see ivaSeatStore).
    this.sub($ivaSeatAimRequest, (req) => {
      if (req) this.handleIvaSeatAim(req);
    });
    // Project thumbnails: only the scene can draw the document, so projectStore publishes a
    // one-shot nonce and this answers with a WebP blob (design-projects-export.md §1.6, D15).
    this.sub($thumbnailRequest, (req) => {
      if (req) void this.captureThumbnail();
    });
    // Sitting in a seat: resolve the previewed seat id against the document and hand the
    // pose to the viewport (reconcile does the same on every document change, so a moved
    // or deleted seat is picked up there).
    this.sub($seatView, () => this.applySeatView());
    this.sub($connectorSettings, (settings) => {
      this.connectorSettings = settings;
      this.rebuildConnectors();
    });
    // Marker size / gaze cone are global view settings, not document data: the markers
    // have no in-place resize, so a change rebuilds them (as $connectorSettings does).
    this.sub($ivaSeatSettings, (settings) => {
      this.ivaSeatSettings = settings;
      this.rebuildIvaSeats();
    });
    // Light markers: only the SIZE needs the rebuild (no in-place resize path, the
    // $ivaSeatSettings pattern). The coverage settings are live — pushing the exposure
    // into the existing shell materials and re-running the visibility pass is both
    // cheaper and what makes dragging the exposure field feel connected. The live
    // PREVIEW is live too: `setPreview` adds/removes one real light per marker, so
    // flipping the toggle must NOT rebuild every marker's geometry.
    this.sub($lightSettings, () => {
      const settings = lightSettings();
      const resize = settings.markerSize !== this.lightSettings.markerSize;
      this.lightSettings = settings;
      if (resize) {
        this.rebuildLights(); // reconcileLights re-applies coverage + preview
        return;
      }
      for (const objs of this.lightObjects.values()) for (const obj of objs) obj.setViz(settings);
      this.applyLightCoverage();
      this.applyLightPreview();
    });
    // Re-apply the highlight tint to the current selection when the color/strength
    // setting changes (fires immediately on subscribe — a harmless no-op when nothing
    // is selected).
    this.sub($selectionHighlight, () => this.updateSelection());
    this.sub($layerView, () => this.applyLayerView());
    this.sub($hideInterior, () => this.applyLayerView());
    // View ▸ Display Filters composes into the same single visibility writer.
    this.sub($kindVisibility, () => this.applyLayerView());
    // $effectiveToolMode, not $toolMode: exhaust placement clamps Scale away (a nozzle
    // placement has nothing to scale), and the toolbar reads the same computed so the
    // displayed tool always matches the tool a drag performs.
    this.sub($effectiveToolMode, (mode) => {
      this.gizmo.setMode(mode);
      // Scale never takes the local pivot orientation (see repositionPivot), so switching
      // tool can change how the bulk pivot must sit.
      if (!this.gizmo.isDragging && this.attachedObject === this.pivot) this.repositionPivot();
      // …and the POSE gizmo has its own handle sets, so `T` has to reach it too (it also
      // applies the §9.4 pivot clamp, which is why it goes through updateSelection).
      if (!this.poseGizmo.isDragging && this.poseGizmo.attached) this.updateSelection();
    });
    // W/L: the handles' frame (design-build-mode.md §4.2). Re-seats the bulk pivot too —
    // in `local` it adopts the primary entity's orientation.
    this.sub($gizmoSpace, () => {
      this.applyGizmoSpace();
      if (!this.gizmo.isDragging && this.attachedObject === this.pivot) this.repositionPivot();
    });
    this.sub($snap, (snap) => this.gizmo.setSnap(snap));
    // ⌃ held DURING a gizmo drag = temporary snap invert (foundation §14.2, LOCKED #7).
    // Drag-scoped on purpose: outside a drag ⌃ is a plain modifier and must not silently
    // re-arm snapping. `applySnapToGizmo` writes `$snap`, so the subscription above is
    // still the one path into the gizmo.
    this.sub($heldModifiers, (held) => {
      if (this.gizmo.isDragging) applySnapToGizmo(held.ctrl);
    });
    this.sub($grids, (grids) => this.viewport.grids.setConfig(grids));
    // The snap orbits the SELECTION centroid when there is a selection, else the origin
    // (LOCKED #7; design: design-build-mode.md §5.3) — the command side is unchanged, the
    // "around what" answer lives here because only the scene knows.
    this.sub($cameraSnap, (cmd) => {
      if (cmd) this.viewport.snapCamera(cmd.dir, this.selectionWorldCenter() ?? undefined);
    });
    this.sub($cameraFrame, (cmd) => {
      if (cmd) this.frameSelection();
    });
    this.sub($cameraRestore, (cmd) => {
      if (cmd) this.viewport.restoreCamera(cmd.state);
    });
    // Escape ladder rung 4. The undo step pushed at drag start then describes a no-op
    // change, which is fine and v1-consistent (undoing it restores the same state) — the
    // stack is never popped behind the user's back.
    this.sub($gizmoCancel, (cmd) => {
      if (!cmd) return;
      if (this.gizmo.isDragging) this.gizmo.cancelDrag();
      // The pose gizmo restores its OWN drag-start frame and streams it back (§9.2) — same
      // rung, same contract, no undo-stack surgery.
      if (this.poseGizmo.isDragging) this.poseGizmo.cancelDrag();
    });
  }

  /**
   * Subscribes to a store, tracks the unsubscribe, and redraws once the callback
   * has run.
   *
   * Every subscription in this class exists to mutate the scene, and the viewport
   * only draws when asked ({@link RenderLoop}) — so invalidating here, in one
   * place, is what keeps "the state changed" and "the viewport shows it" from
   * drifting apart. Use this for ALL store subscriptions; a bare `.subscribe()`
   * would leave its change on screen only by luck.
   */
  private sub<T>(store: ReadableAtom<T>, run: (value: T) => void): void {
    this.unsubscribers.push(
      store.subscribe((value) => {
        run(value);
        this.viewport.invalidate();
      }),
    );
  }

  /** Returns the scene object for a placed instance, if built. */
  getObject(instanceId: string): SubPartObject | undefined {
    return this.objects.get(instanceId);
  }

  private reconcile(part: EditingPart): void {
    const wanted = new Set(part.placements.map((p) => p.instanceId));

    // Remove objects whose placement is gone.
    for (const [id, obj] of this.objects) {
      if (!wanted.has(id)) {
        this.root.remove(obj.group);
        obj.dispose();
        this.objects.delete(id);
      }
    }

    // Add new objects; update transforms of existing ones.
    for (const placement of part.placements) {
      const existing = this.objects.get(placement.instanceId);
      if (existing) {
        existing.setPlacement(placement);
        continue;
      }
      if (this.building.has(placement.instanceId)) continue;

      const entry = this.index.get(placement.subPartTemplateId);
      if (!entry) continue; // catalog not ready or unknown template

      this.building.add(placement.instanceId);
      void SubPartObject.create(entry, placement)
        .then((obj) => {
          this.building.delete(placement.instanceId);
          const latest = $part.get().placements.find((p) => p.instanceId === placement.instanceId);
          if (!latest) {
            obj.dispose(); // removed while loading
            return;
          }
          obj.setPlacement(latest);
          this.root.add(obj.group);
          this.objects.set(placement.instanceId, obj);
          this.applyLayerView(); // respect the layer's visibility + opacity for the new object
          this.updateSelection(); // highlight/attach if this is the selected one
          this.applyAnimationPreview(); // re-apply if this object is animation-driven
          this.chainPreview.refresh(); // a chain seed that finished loading can now be ghosted
          this.viewport.invalidate(); // geometry landed after the store change that asked for it
        })
        .catch((err) => {
          this.building.delete(placement.instanceId);
          console.warn(`EditorScene: failed to build '${placement.instanceId}'`, err);
        });
    }

    this.reconcileConnectors(part);
    this.reconcileColliders(part);
    this.reconcileIvaSeats(part);
    this.reconcileLights(part);
    this.reconcileKittens(part);
    this.applyLayerView();
    this.updateSelection();
    this.applyAnimationPreview();
    this.applyEngineHandles();
    // Last: the previewed seat may have moved, been re-aimed, or vanished with this change.
    this.applySeatView();
  }

  /**
   * Keeps the IVA seat preview in sync with the document (plans/IVA_PLAN.md §3.6).
   *
   * `$seatView` names a seat by ID, so this is where it becomes a pose — and where a
   * previewed seat that no longer exists (deleted, or the whole project swapped) exits
   * cleanly instead of leaving the camera parked on a stale eye point.
   *
   * While seated, three things are suppressed: the transform gizmo (nothing to drag from
   * inside a seat, and the gizmo would be drawn at the camera), click-selection, and the
   * seat markers — you are INSIDE the marker you sat in, so it would fill the screen.
   */
  private applySeatView(): void {
    const seatId = $seatView.get();
    const seat = seatId ? $part.get().ivaSeats.find((s) => s.id === seatId) : undefined;
    if (seatId && !seat) {
      // Re-enters through the $seatView subscription with a null id, which tears down.
      exitSeatView();
      return;
    }
    if (seat) {
      const { forward, up } = seatAxesFromRotation(seat.rotation);
      this.viewport.enterSeatView({ position: seat.position, forward, up });
    } else {
      this.viewport.exitSeatView();
    }
    this.suppressPickSeatView = seat != null;
    this.applySelectionSuppression();
    this.applyLayerView(); // shows/hides the seat markers
    this.updateSelection(); // attaches/detaches the gizmo
  }

  /** Applies the OR of every reason click-selection is currently off. */
  private applySelectionSuppression(): void {
    this.selection.setSuppressed(
      this.suppressPickDrag ||
        this.suppressPickMeasure ||
        this.suppressPickSeatView ||
        this.suppressPickMarquee ||
        this.suppressPickPaint,
    );
  }

  /**
   * True when the preview shows a POSED (non-rest) frame, which is what locks the placement
   * gizmo against baking a previewed transform into the document (design §9.6).
   *
   * v2 keys the test on the **rest ANCHOR**, not on `u > 0` (design §10.1/§§10.2): at
   * `restAnchorTime` the previewed scene equals the modeled part, so placements stay
   * editable there — including on an imported deploy clip, whose anchor is the LAST
   * keyframe and whose t=0 is the stowed pose (the v1 rule called that "rest" and got it
   * exactly backwards).
   */
  private isPreviewPosed(): boolean {
    if ($mode.get() !== 'animation') return false;
    if (!this.animOverrideActive()) return false;
    const anim = this.activeAnimation();
    if (!anim) return false;
    return Math.abs($playheadSec.get() - restAnchorTime(anim)) > 1e-6;
  }

  /** The clip the preview is driving, or null (animation atoms persist across modes). */
  private activeAnimation(): PartAnimation | null {
    if ($mode.get() !== 'animation') return null;
    const animId = $activeAnimationId.get();
    return (animId ? $part.get().animations.find((a) => a.id === animId) : null) ?? null;
  }

  /**
   * The §10.1 gating rule: the joint override runs iff the playhead is deliberately held
   * somewhere — PINNED to a column, PARKED, dragged (scrubbing) or playing. Otherwise the
   * scene is the modeled part at its rest anchor.
   */
  private animOverrideActive(): boolean {
    return (
      $editKeyframeId.get() !== null ||
      $playheadParked.get() ||
      $animScrubbing.get() ||
      $animPlaying.get()
    );
  }

  /** True when any selected SubPart is attached to a joint of the active animation. */
  private selectedIsAnimated(): boolean {
    const animId = $activeAnimationId.get();
    const part = $part.get();
    const anim = animId ? part.animations.find((a) => a.id === animId) : null;
    if (!anim) return false;
    const members = new Set<string>();
    for (const j of anim.joints) for (const id of j.memberInstanceIds) members.add(id);
    const selected = $selection.get();
    if (selected.some((r) => r.kind === 'subpart' && members.has(r.id))) return true;
    // A SubPart-owned collider rides its instance, so while a POSED frame is shown its
    // gizmo would write back through the posed (not modeled) frame — lock it too. A
    // SubPart-owned LIGHT rides its instances the same way (positionLights poses it),
    // so it gets the identical lock: without it a drag would bake the preview pose
    // into the document (lightGizmoFrame always resolves the STATIC placement).
    const ownedByAnimated = (ownerTemplateId: string | null | undefined): boolean => {
      if (!ownerTemplateId) return false;
      return part.placements.some(
        (p) => p.subPartTemplateId === ownerTemplateId && members.has(p.instanceId),
      );
    };
    const ownerOf = (kind: 'collider' | 'light', id: string): string | null | undefined =>
      kind === 'collider'
        ? part.colliders.find((c) => c.id === id)?.ownerTemplateId
        : part.lights.find((l) => l.id === id)?.ownerTemplateId;
    return selected.some(
      (r) =>
        (r.kind === 'collider' || r.kind === 'light') && ownedByAnimated(ownerOf(r.kind, r.id)),
    );
  }

  /**
   * Drives the active clip's member SubParts to the previewed pose (editor-only; never
   * mutates the document). Each member's group matrix becomes
   * `W_J(t)·W_J(rest)⁻¹·placement` — the transform KSA itself will render — with `t` read
   * from `$playheadSec` and `rest` from {@link restAnchorTime}.
   *
   * Reconcile resets every group to its placement first (via `setPlacement`), so this just
   * overlays the overrides; previously-overridden ids are reverted at the top.
   */
  private applyAnimationPreview(): void {
    const part = $part.get();
    const byId = new Map(part.placements.map((p) => [p.instanceId, p]));
    // Revert last round's overrides to their static placement.
    for (const id of this.animOverridden) {
      const obj = this.objects.get(id);
      const placement = byId.get(id);
      if (obj && placement) obj.setPlacement(placement);
    }
    this.animOverridden.clear();

    // Preview only runs in Animation mode (its atoms persist across mode switches); in
    // every other mode parts show their static placements.
    const anim = this.activeAnimation();
    if (!anim) {
      this.positionColliders(part); // back to static frames
      this.positionLights(part);
      return;
    }
    // Override only while the playhead is pinned / parked / scrubbing / playing; otherwise
    // SubParts rest at their static modeled placement (an imported deploy clip's rest is
    // its DEPLOYED last keyframe, so this keeps it shown deployed until you park or scrub).
    if (!this.animOverrideActive()) {
      this.positionColliders(part);
      this.positionLights(part);
      return;
    }
    const posed = new Map<string, Transform>();
    // ONE time source (design §10.1): every pin/park/step action keeps `$playheadSec` in
    // step, which is also what makes "a pin is SUSPENDED while playing" (§10.2) automatic —
    // playback moves the playhead and the pin simply stops being where it points.
    const t = Math.min(Math.max(0, $playheadSec.get()), Math.max(0, anim.durationSec));

    for (const joint of anim.joints) {
      for (const instId of joint.memberInstanceIds) {
        const obj = this.objects.get(instId);
        const placement = byId.get(instId);
        if (!obj || !placement) continue;
        const m = previewOverrideMatrix(anim, instId, t, placement);
        if (!m) continue;
        m.decompose(obj.group.position, obj.group.quaternion, obj.group.scale);
        this.animOverridden.add(instId);
        posed.set(instId, transformFromMatrix(m));
      }
    }
    // A SubPart-owned collider rides its instance, so it must follow the pose too —
    // and so does a SubPart-owned light (part-level lights never move with animation).
    this.positionColliders(part, posed);
    this.positionLights(part, posed);
  }

  /** Builds/updates/removes kitten visual aides (async, like SubParts). */
  private reconcileKittens(part: EditingPart): void {
    const wanted = new Set(part.kittens.map((k) => k.id));
    for (const [id, obj] of this.kittenObjects) {
      if (!wanted.has(id)) {
        this.root.remove(obj.group);
        obj.dispose();
        this.kittenObjects.delete(id);
      }
    }
    for (const kitten of part.kittens) {
      const existing = this.kittenObjects.get(kitten.id);
      if (existing) {
        existing.setInstance(kitten);
        continue;
      }
      if (this.kittenBuilding.has(kitten.id)) continue;
      this.kittenBuilding.add(kitten.id);
      void KittenObject.create(kitten.kind, kitten)
        .then((obj) => {
          this.kittenBuilding.delete(kitten.id);
          const latest = $part.get().kittens.find((k) => k.id === kitten.id);
          if (!latest || latest.kind !== kitten.kind) {
            obj.dispose(); // removed or changed kind while loading
            return;
          }
          obj.setInstance(latest);
          this.root.add(obj.group);
          this.kittenObjects.set(kitten.id, obj);
          this.applyLayerView();
          this.updateSelection();
          this.viewport.invalidate(); // as above: the build landed after its store change
        })
        .catch((err) => {
          this.kittenBuilding.delete(kitten.id);
          console.warn(`EditorScene: failed to build kitten '${kitten.id}'`, err);
        });
    }
  }

  /**
   * Applies each layer's view state (from `$layerView`) to its built entities:
   * visibility (eye toggle) and opacity (fade slider). Note: three.js does NOT skip
   * invisible objects during raycasting, so the `onSelect` callback guards against
   * hidden/non-active-layer hits explicitly.
   *
   * **View ▸ Display Filters** composes in HERE (design-build-mode.md §5.4): a group draws
   * iff its layer is visible AND its kind is not filtered off. Same discipline as "hide
   * interior" — this method stays the single writer of `group.visible`, so the two systems
   * can never fight over it.
   */
  private applyLayerView(): void {
    const part = $part.get();
    const view = $layerView.get();
    const kinds = kindVisibility();
    // "Hide interior" previews KSA's OUTSIDE-IVA render gate (`!Template.Internal`), so it
    // composes with the layer's own visibility instead of overwriting it: a mesh draws iff
    // its layer is visible AND the toggle doesn't hide it. This is the ONLY writer of
    // `group.visible`, which is what keeps the two systems from fighting.
    const hideInterior = $hideInterior.get();
    for (const p of part.placements) {
      const obj = this.objects.get(p.instanceId);
      if (obj) {
        const lv = layerViewState(view, p.layerId);
        const interior =
          hideInterior &&
          resolveInternal(part, p.subPartTemplateId, this.index.get(p.subPartTemplateId));
        obj.group.visible = lv.visible && !interior;
        obj.setLayerOpacity(lv.opacity);
      }
    }
    for (const c of part.connectors) {
      const obj = this.connectorObjects.get(c.id);
      if (obj) {
        const lv = layerViewState(view, c.layerId);
        obj.group.visible = lv.visible && kinds.connector;
        obj.setLayerOpacity(lv.opacity);
      }
    }
    for (const c of part.colliders) {
      const lv = layerViewState(view, c.layerId);
      for (const obj of this.colliderObjects.get(c.id) ?? []) {
        obj.group.visible = lv.visible && kinds.collider;
        obj.setLayerOpacity(lv.opacity);
      }
    }
    // Every seat marker is hidden while sitting in one: the camera is inside the marker
    // it sat in (it would fill the screen), and the others are eye points, not scenery.
    const inSeatView = $seatView.get() !== null;
    for (const s of part.ivaSeats) {
      const obj = this.seatObjects.get(s.id);
      if (obj) {
        const lv = layerViewState(view, s.layerId);
        obj.group.visible = lv.visible && kinds.ivaSeat && !inSeatView;
        obj.setLayerOpacity(lv.opacity);
      }
    }
    for (const l of part.lights) {
      const lv = layerViewState(view, l.layerId);
      for (const obj of this.lightObjects.get(l.id) ?? []) {
        obj.group.visible = lv.visible && kinds.light;
        obj.setLayerOpacity(lv.opacity);
      }
    }
    // The coverage children are a SECOND, composed gate (view setting × layer), applied
    // to their own `.visible` flags — this method stays the only writer of `group.visible`.
    // The live preview lights compose the same way (toggle × layer × budget).
    this.applyLightCoverage();
    this.applyLightPreview();
    for (const k of part.kittens) {
      const obj = this.kittenObjects.get(k.id);
      if (obj) {
        const lv = layerViewState(view, k.layerId);
        obj.group.visible = lv.visible && kinds.kitten;
        obj.setLayerOpacity(lv.opacity);
      }
    }
    // Aids are not layer citizens (they never touch the document), so the `aid` filter is
    // enforced by the two overlay layers that own them.
    this.measurements.setAidsVisible(kinds.aid);
    this.containers.setVisible(kinds.aid);
  }

  /** Connectors build synchronously (cube + arrow), so reconciliation is simple. */
  private reconcileConnectors(part: EditingPart): void {
    const wanted = new Set(part.connectors.map((c) => c.id));
    for (const [id, obj] of this.connectorObjects) {
      if (!wanted.has(id)) {
        this.root.remove(obj.group);
        obj.dispose();
        this.connectorObjects.delete(id);
      }
    }
    for (const connector of part.connectors) {
      const existing = this.connectorObjects.get(connector.id);
      if (existing) {
        existing.setConnector(connector);
        continue;
      }
      const obj = new ConnectorObject(connector, this.connectorSettings.size);
      this.root.add(obj.group);
      this.connectorObjects.set(connector.id, obj);
    }
  }

  /**
   * IVA seat markers build synchronously (sphere + cone + stick), and a seat is Part-level
   * data with exactly one visual — so this is the connector reconcile, not the collider one.
   */
  private reconcileIvaSeats(part: EditingPart): void {
    const wanted = new Set(part.ivaSeats.map((s) => s.id));
    for (const [id, obj] of this.seatObjects) {
      if (!wanted.has(id)) {
        this.root.remove(obj.group);
        obj.dispose();
        this.seatObjects.delete(id);
      }
    }
    // The badge is the seat's DOCUMENT INDEX, so it must be re-stamped on every reconcile:
    // `moveIvaSeat` renumbers seats without changing any of them.
    part.ivaSeats.forEach((seat, index) => {
      const existing = this.seatObjects.get(seat.id);
      if (existing) {
        existing.setSeat(seat);
        existing.setIndex(index);
        return;
      }
      const obj = new IvaSeatObject(
        seat,
        this.ivaSeatSettings.markerSize,
        this.ivaSeatSettings.showGazeCone,
        index,
      );
      this.root.add(obj.group);
      this.seatObjects.set(seat.id, obj);
    });
  }

  /**
   * Colliders build synchronously (unit wireframe + fill). A SubPart-owned collider gets
   * ONE visual per placement of its owning template, positioned exactly as KSA composes it
   * ({@link colliderWorld}); a part-level one gets a single visual in the Part frame.
   */
  private reconcileColliders(part: EditingPart): void {
    const wanted = new Set(part.colliders.map((c) => c.id));
    for (const [id, objs] of this.colliderObjects) {
      if (wanted.has(id)) continue;
      for (const obj of objs) {
        this.root.remove(obj.group);
        obj.dispose();
      }
      this.colliderObjects.delete(id);
    }

    for (const collider of part.colliders) {
      const wanted = this.colliderOwners(part, collider).length || 1;
      let objs = this.colliderObjects.get(collider.id);
      if (!objs) {
        objs = [];
        this.colliderObjects.set(collider.id, objs);
      }
      while (objs.length > wanted) {
        const obj = objs.pop()!;
        this.root.remove(obj.group);
        obj.dispose();
      }
      while (objs.length < wanted) {
        const obj = new ColliderObject(collider, objs.length);
        this.root.add(obj.group);
        objs.push(obj);
      }
    }
    this.positionColliders(part);
  }

  /**
   * Placements a collider's visuals ride on. Empty for a part-level collider — and also
   * for one whose owner template is no longer placed, which then renders once in the Part
   * frame so it can be found and re-homed rather than silently vanishing (validation
   * flags it as dead data).
   */
  private colliderOwners(part: EditingPart, collider: PartCollider): SubPartPlacement[] {
    if (!collider.ownerTemplateId) return [];
    return part.placements.filter((p) => p.subPartTemplateId === collider.ownerTemplateId);
  }

  /**
   * Positions every collider visual. `posed` supplies the ANIMATED transform of an
   * instance when the animation preview is showing a non-rest frame — SubPart-owned
   * colliders follow joint animation in-game (`KeyframeAnimationModule` flags
   * `NeedsColliderUpdate` and `ConstraintSim` rebuilds the compound), so the editor shows
   * the same thing. An empty/absent map means "everything at its static placement".
   */
  private positionColliders(part: EditingPart, posed?: ReadonlyMap<string, Transform>): void {
    for (const collider of part.colliders) {
      const objs = this.colliderObjects.get(collider.id);
      if (!objs) continue;
      const owners = this.colliderOwners(part, collider);
      if (owners.length === 0) {
        objs[0]?.setCollider(collider);
        continue;
      }
      for (let i = 0; i < owners.length && i < objs.length; i++) {
        const frame = posed?.get(owners[i].instanceId) ?? owners[i];
        objs[i].setCollider(collider, colliderWorld(collider, frame));
      }
    }
  }

  /**
   * Light markers build synchronously (bulb + aim cone). A SubPart-owned light gets ONE
   * visual per placement of its owning template — KSA instantiates the template's
   * `<Light>` once per SubPart instance (`LightModule.UpdateRenderData`) — while a
   * part-level light gets a single visual in the Part frame. The collider reconcile
   * pattern; positioning is {@link positionLights}' job.
   */
  private reconcileLights(part: EditingPart): void {
    const wanted = new Set(part.lights.map((l) => l.id));
    for (const [id, objs] of this.lightObjects) {
      if (wanted.has(id)) continue;
      for (const obj of objs) {
        this.root.remove(obj.group);
        obj.dispose();
      }
      this.lightObjects.delete(id);
    }

    for (const light of part.lights) {
      const wantedCount = this.lightOwners(part, light).length || 1;
      let objs = this.lightObjects.get(light.id);
      if (!objs) {
        objs = [];
        this.lightObjects.set(light.id, objs);
      }
      while (objs.length > wantedCount) {
        const obj = objs.pop()!;
        this.root.remove(obj.group);
        obj.dispose();
      }
      while (objs.length < wantedCount) {
        const obj = new LightObject(
          light,
          this.lightSettings.markerSize,
          objs.length,
          this.lightSettings,
        );
        this.root.add(obj.group);
        objs.push(obj);
      }
    }
    this.positionLights(part);
    // A fresh LightObject starts with no preview light, and the instance budget shifts
    // whenever lights (or their owners' placements) come and go — so the preview pass
    // belongs here, not only on the settings toggle.
    this.applyLightPreview();
  }

  /**
   * Placements a light's visuals ride on. Empty for a part-level light — and also for
   * one whose owner template is no longer placed, which then renders once in the Part
   * frame so it can be found and re-homed rather than silently vanishing (the collider
   * convention; validation flags it as dead data in Phase 7).
   */
  private lightOwners(part: EditingPart, light: PartLight): SubPartPlacement[] {
    if (!light.ownerTemplateId) return [];
    return part.placements.filter((p) => p.subPartTemplateId === light.ownerTemplateId);
  }

  /**
   * The context instance index for a light — the visual last clicked
   * ({@link $lightEditContext}; default 0, clamped to `count`). The ONE rule shared by
   * the highlight, the gizmo attach/write-back ({@link lightGizmoFrame}) and the
   * inspector's part-frame fields (which read the same atom), so they always agree.
   */
  private lightContextIndex(lightId: string, count: number): number {
    const i = $lightEditContext.get()[lightId] ?? 0;
    return Math.max(0, Math.min(i, count - 1));
  }

  /**
   * Positions every light visual via {@link lightWorld} — NEVER {@link colliderWorld}:
   * the owner's scale APPLIES to a light's position offset, unlike a collider's
   * (coords.ts documents the contrast). `posed` supplies the ANIMATED transform of an
   * instance while the animation preview shows a non-rest frame, so a light on an
   * animated SubPart follows the preview pose exactly as its owning mesh (and its
   * colliders) do; part-level lights never move with animation. An empty/absent map
   * means "everything at its static placement".
   */
  private positionLights(part: EditingPart, posed?: ReadonlyMap<string, Transform>): void {
    for (const light of part.lights) {
      const objs = this.lightObjects.get(light.id);
      if (!objs) continue;
      const owners = this.lightOwners(part, light);
      if (owners.length === 0) {
        objs[0]?.setLight(light, lightWorld(light, null), 0);
        continue;
      }
      for (let i = 0; i < owners.length && i < objs.length; i++) {
        const frame = posed?.get(owners[i].instanceId) ?? owners[i];
        objs[i].setLight(light, lightWorld(light, frame), i);
      }
    }
  }

  /**
   * Shows/hides each light's COVERAGE children (the falloff shell stack + the hard
   * boundary wireframe) per `$lightSettings.showVolumes`, composed with the Lights
   * layer's own visibility:
   *
   *  - `'off'`      — never;
   *  - `'all'`      — every instance of every light;
   *  - `'selected'` — only the CONTEXT instance of a selected light (the one the gizmo
   *                   and the inspector's part-frame fields work through), so a
   *                   multi-placement light doesn't stack N overlapping glows.
   *
   * Deliberately writes only the CHILDREN's `.visible` flags: {@link applyLayerView} is
   * the single writer of `group.visible`, and two writers would fight. Re-runs from
   * there (layer/document changes), from {@link updateSelection} (selection + edit
   * context) and from the `$lightSettings` subscription.
   */
  private applyLightCoverage(): void {
    const part = $part.get();
    const view = $layerView.get();
    const mode = this.lightSettings.showVolumes;
    const selectedIds = new Set<string>();
    if (mode === 'selected') {
      for (const ref of $selection.get()) if (ref.kind === 'light') selectedIds.add(ref.id);
    }
    for (const light of part.lights) {
      const objs = this.lightObjects.get(light.id);
      if (!objs) continue;
      // …AND the Lights display filter: a filtered-off light shows no shells either.
      const layerVisible = layerViewState(view, light.layerId).visible && isKindVisible('light');
      const context = this.lightContextIndex(light.id, objs.length);
      objs.forEach((obj, i) => {
        const wanted =
          mode === 'all'
            ? true
            : mode === 'selected'
              ? selectedIds.has(light.id) && i === context
              : false;
        obj.setCoverageVisible(wanted && layerVisible);
      });
    }
  }

  /**
   * Adds/removes the LIVE PREVIEW lights — real `THREE.PointLight`/`SpotLight`s that
   * illuminate the part meshes (plans/LIGHT_MANAGEMENT_PLAN.md §3.10). Composed exactly
   * like {@link applyLightCoverage}:
   *
   *  - `$lightSettings.livePreview` — the global toggle (default off);
   *  - the Lights layer's own visibility — a hidden layer means no illumination either
   *    (the marker groups are hidden too, and three skips a hidden subtree's lights, but
   *    this makes the rule explicit rather than a side effect of traversal);
   *  - the {@link planPreviewBudget} instance budget — at most
   *    {@link import('./lightVolume').MAX_PREVIEW_LIGHTS} INSTANCES in document order,
   *    since each preview light re-links every shader program in the scene.
   *
   * Writes only each `LightObject`'s own preview state — never `group.visible`, which
   * {@link applyLayerView} owns. Publishes the enabled/total counts so the View menu can
   * say when the cap truncated.
   */
  private applyLightPreview(): void {
    const part = $part.get();
    const view = $layerView.get();
    const on = this.lightSettings.livePreview;
    const budget = planPreviewBudget(
      part.lights.map((l) => this.lightObjects.get(l.id)?.length ?? 0),
    );
    let enabled = 0;
    part.lights.forEach((light, li) => {
      const objs = this.lightObjects.get(light.id);
      if (!objs) return;
      const layerVisible = layerViewState(view, light.layerId).visible && isKindVisible('light');
      const allowed = on && layerVisible ? budget.perLight[li] : 0;
      enabled += allowed;
      objs.forEach((obj, i) => obj.setPreview(i < allowed));
    });
    setLightPreviewCount({ enabled, total: budget.total });
  }

  /**
   * Scores the current collision volume against the part's sampled geometry and publishes
   * the report (which also drives the uncovered-point dots). Runs here rather than in the
   * store because both halves — the geometry sample and the owner-frame resolution — need
   * the scene.
   */
  private handleCoverageCheck(): void {
    $coverageRequest.set(false);
    const part = $part.get();
    const points = collectWorldPoints(
      [...this.objects.values()].map((o) => o.group),
      $colliderSettings.get().precision,
    );
    // Every collider, lifted into Part space — a SubPart-owned one is scored once per
    // placement of its template, exactly as it exists in-game.
    const placed: PlacedCollider[] = [];
    for (const collider of part.colliders) {
      const owners = this.colliderOwners(part, collider);
      const frames: Transform[] =
        owners.length > 0 ? owners.map((o) => colliderWorld(collider, o)) : [collider];
      for (const f of frames) {
        // Through coords.matrixFromTransform so the Euler convention stays in one place.
        const q = new THREE.Quaternion();
        matrixFromTransform(f).decompose(new THREE.Vector3(), q, new THREE.Vector3());
        placed.push({ collider, position: { ...f.position }, quaternion: [q.x, q.y, q.z, q.w] });
      }
    }
    setCoverageReport(evaluateCoverage(points, placed));
  }

  /** Draws (or clears) the uncovered sample points from the latest coverage report. */
  private applyCoverageDots(): void {
    const report = $coverageReport.get();
    const points = report?.uncovered ?? [];
    if (points.length === 0) {
      if (this.coverageDots) {
        this.root.remove(this.coverageDots);
        this.coverageDots.geometry.dispose();
        (this.coverageDots.material as THREE.Material).dispose();
        this.coverageDots = null;
      }
      return;
    }
    const positions = new Float32Array(points.length * 3);
    points.forEach((p, i) => {
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (this.coverageDots) {
      this.coverageDots.geometry.dispose();
      this.coverageDots.geometry = geometry;
      return;
    }
    const dots = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: 0xff3355, size: 6, sizeAttenuation: false }),
    );
    dots.name = 'collider-coverage-gaps';
    dots.raycast = () => {}; // a readout, never selectable
    this.coverageDots = dots;
    this.root.add(dots);
  }

  /**
   * Runs a pending collider fit: samples the requested geometry, fits the primitive in the
   * chosen frame (the pure {@link fitCollider}), and writes it back through the store.
   * Clears the request either way so a repeated identical fit still fires.
   */
  private handleColliderFit(req: ColliderFitRequest): void {
    $colliderFitRequest.set(null);
    const settings = $colliderSettings.get();
    const part = $part.get();

    // "Fit to selection" means the selected MESHES; with nothing selected (or when the
    // caller asked for it) fall back to the whole part — an empty part fits nothing.
    const selected = req.useSelection ? this.selectedPlacementGroups() : [];
    const targets = selected.length > 0 ? selected : [...this.objects.values()].map((o) => o.group);
    const points = collectWorldPoints(targets, settings.precision);
    if (points.length === 0) {
      console.warn('flexo: nothing to fit a collider to (no geometry loaded yet?)');
      return;
    }

    // Orient to the LAST selected placement so a tilted tank gets a tilted cylinder.
    const frameSource = selected.length > 0 ? selected[selected.length - 1] : null;
    let frame: Quat = IDENTITY_QUAT;
    if (settings.orientToSelection && frameSource) {
      const q = frameSource.getWorldQuaternion(new THREE.Quaternion());
      frame = [q.x, q.y, q.z, q.w];
    }

    const fit = fitCollider(req.shape, points, frame, settings.margin);
    if (!fit) return;
    // Quaternion → KSA Euler goes through coords.ts, the one sanctioned place.
    const transform = transformFromMatrix(
      new THREE.Matrix4().compose(
        new THREE.Vector3(fit.position.x, fit.position.y, fit.position.z),
        new THREE.Quaternion(...fit.quaternion),
        new THREE.Vector3(fit.size.x, fit.size.y, fit.size.z),
      ),
    );

    if (req.target.kind === 'new') {
      addCollider(req.shape, transform);
      return;
    }
    const existing = part.colliders[req.target.index];
    if (!existing) return;
    // Refit keeps the collider's id and owner; a SubPart-owned one must come back into
    // its template's local frame or it would jump by the placement transform.
    const owner = existing.ownerTemplateId
      ? part.placements.find((p) => p.subPartTemplateId === existing.ownerTemplateId)
      : undefined;
    const local = owner ? colliderLocalFromWorld(transform, owner) : transform;
    pushUndo('fit collider', existing.id);
    updateColliderTransform(req.target.index, local);
  }

  /**
   * Runs a pending "aim at selection": points the seat's forward axis at the world-space
   * centroid of the selected placements and writes the resulting rotation back through
   * {@link aimIvaSeat} (which owns the single undo step). Clears the request either way so
   * a repeated identical aim still fires.
   *
   * With nothing selected — which is the norm, since selecting a seat clears the SubPart
   * selection — the whole part's geometry is the target, the same fallback
   * {@link handleColliderFit} uses.
   */
  private handleIvaSeatAim(req: IvaSeatAimRequest): void {
    clearIvaSeatAimRequest();
    const part = $part.get();
    const seat = part.ivaSeats[req.index];
    if (!seat) return;

    const centroid = this.selectedGeometryCentroid();
    if (!centroid) {
      // Silence here reads as a dead button: the aim needs BUILT geometry (the selection's,
      // or the whole part's), which a still-loading or empty part does not have.
      console.warn('flexo: nothing to aim an IVA seat at (no geometry loaded yet?)');
      // Transient, not a `warning`: this is immediate feedback on a button the user just
      // pressed, so it belongs in the status channel and NOT in the notification center
      // (design-system-services §2.2 — the wording carries the warning, the route doesn't).
      toast({
        title: 'Nothing to aim at',
        description: 'No SubPart geometry is loaded yet.',
      });
      return;
    }
    const forward = {
      x: centroid.x - seat.position.x,
      y: centroid.y - seat.position.y,
      z: centroid.z - seat.position.z,
    };
    // Keep the seat's current up where it survives the new forward, so re-aiming doesn't
    // silently roll the camera; otherwise take a default that is not parallel to forward.
    const current = req.keepUp ? seatAxesFromRotation(seat.rotation).up : null;
    const up = current && !isParallel(forward, current) ? current : perpendicularUp(forward);
    // Degenerate (seat sitting exactly on the centroid, or an unusable up): do NOTHING
    // rather than store a NaN rotation — that is what the null return is for.
    const rotation = seatRotationFromAxes(forward, up);
    if (!rotation) return;
    aimIvaSeat(req.index, rotation);
  }

  /**
   * World-space centroid of the selected SubPart placements' geometry (their bounding-box
   * centers, averaged), falling back to every built SubPart when nothing is selected.
   * Null when the part has no built geometry at all.
   *
   * Reads the SCENE, not the store — which is exactly why aiming is an intent atom the
   * scene consumes rather than a store action (see ivaSeatStore).
   */
  private selectedGeometryCentroid(): Vec3 | null {
    const selected = this.selectedPlacementGroups();
    const groups = selected.length > 0 ? selected : [...this.objects.values()].map((o) => o.group);
    const centers: Vec3[] = [];
    const box = new THREE.Box3();
    const center = new THREE.Vector3();
    for (const group of groups) {
      box.setFromObject(group);
      if (box.isEmpty()) continue;
      box.getCenter(center);
      centers.push({ x: center.x, y: center.y, z: center.z });
    }
    return centers.length > 0 ? centroidOf(centers) : null;
  }

  /** Rebuilds every connector from scratch (cube/arrow sizes are global settings). */
  private rebuildConnectors(): void {
    for (const obj of this.connectorObjects.values()) {
      this.root.remove(obj.group);
      obj.dispose();
    }
    this.connectorObjects.clear();
    this.reconcileConnectors($part.get());
    this.applyLayerView();
    this.updateSelection();
  }

  /** Rebuilds every seat marker from scratch (marker size / gaze cone are global settings). */
  private rebuildIvaSeats(): void {
    for (const obj of this.seatObjects.values()) {
      this.root.remove(obj.group);
      obj.dispose();
    }
    this.seatObjects.clear();
    this.reconcileIvaSeats($part.get());
    this.applyLayerView();
    this.updateSelection();
  }

  /** Rebuilds every light marker from scratch (marker size is a global setting). */
  private rebuildLights(): void {
    for (const objs of this.lightObjects.values()) {
      for (const obj of objs) {
        this.root.remove(obj.group);
        obj.dispose();
      }
    }
    this.lightObjects.clear();
    this.reconcileLights($part.get());
    this.applyLayerView();
    this.updateSelection();
  }

  /**
   * **Frame Selection** (`F` / View menu / palette — LOCKED #7): fits the selection in view
   * and re-centers the orbit target on it. With nothing selected it frames **the whole
   * part** (design: design-build-mode.md §5.3 "No selection ⇒ frame-all (whole part; empty
   * part ⇒ origin at default distance)") — not just the SubPart placements: a project whose
   * only entities are a collider, a light or an IVA seat still has something to look at, and
   * framing nothing there would read as a dead key.
   *
   * The fallback deliberately measures only what is DRAWN
   * ({@link computeVisibleWorldBounds}) — hidden layers and a light marker's hidden coverage
   * shells never inflate the box.
   */
  private frameSelection(): void {
    const selected = this.selectedObjects().map((o) => o.group);
    const bounds =
      selected.length > 0
        ? computeSelectionBounds(selected, 'world')
        : computeVisibleWorldBounds(this.allEntityGroups());
    if (!bounds) {
      this.viewport.frameBounds(new THREE.Vector3(), new THREE.Vector3());
      return;
    }
    this.viewport.frameBounds(
      new THREE.Vector3(bounds.center.x, bounds.center.y, bounds.center.z),
      new THREE.Vector3(bounds.size.x, bounds.size.y, bounds.size.z),
    );
  }

  /**
   * Renders ONE offscreen 384×216 frame of the current document and hands it to
   * `projectStore.storeThumbnail` as WebP (design-projects-export.md §1.6, D15).
   *
   * Deterministic framing, so a thumbnail never depends on where the user left the camera:
   * frame-all of the drawn entities (the same {@link allEntityGroups} set Frame Selection
   * falls back to, so hidden layers never inflate the box), viewed from azimuth 45° /
   * elevation 30° at the fitted distance. An empty document captures NOTHING — the manager
   * shows its ⬚ placeholder instead.
   *
   * Every editor aid is hidden for the draw: grids, the transform gizmo, measurement and
   * container layers and the chain preview all live as scene-level siblings of `root`, so
   * hiding every non-light sibling leaves exactly the Part plus its lighting.
   *
   * This is a single render into a `WebGLRenderTarget` — the visible canvas is untouched and
   * the on-demand loop is NOT flipped continuous (foundation §14.5).
   */
  private async captureThumbnail(): Promise<void> {
    const projectId = $currentProjectId.get();
    const bounds = computeVisibleWorldBounds(this.allEntityGroups());
    if (!bounds || !projectId) {
      await storeThumbnail(projectId, null);
      return;
    }

    const width = 384;
    const height = 216;
    const renderer = this.viewport.renderer;
    const fov = this.viewport.camera.fov;
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.01, 1_000_000);
    const center = new THREE.Vector3(bounds.center.x, bounds.center.y, bounds.center.z);
    const distance = frameDistance(bounds.size, fov, width / height);
    const azimuth = Math.PI / 4;
    const elevation = Math.PI / 6;
    camera.position.set(
      center.x + distance * Math.cos(elevation) * Math.sin(azimuth),
      center.y + distance * Math.sin(elevation),
      center.z + distance * Math.cos(elevation) * Math.cos(azimuth),
    );
    camera.lookAt(center);
    camera.near = Math.max(distance * 0.01, 0.001);
    camera.far = distance * 10;
    camera.updateProjectionMatrix();

    const hidden: THREE.Object3D[] = [];
    for (const child of this.viewport.scene.children) {
      if (child === this.root || (child as THREE.Light).isLight || !child.visible) continue;
      child.visible = false;
      hidden.push(child);
    }

    const target = new THREE.WebGLRenderTarget(width, height, { samples: 4 });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const pixels = new Uint8Array(width * height * 4);
    try {
      renderer.setRenderTarget(target);
      renderer.render(this.viewport.scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    } finally {
      renderer.setRenderTarget(null);
      target.dispose();
      for (const child of hidden) child.visible = true;
      // The visible frame was never drawn over, but the renderer's target changed — take one
      // ordinary on-demand frame so nothing depends on that assumption.
      this.viewport.invalidate();
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      await storeThumbnail(projectId, null);
      return;
    }
    // GL reads bottom-up; ImageData is top-down.
    const image = ctx.createImageData(width, height);
    const rowBytes = width * 4;
    for (let y = 0; y < height; y++) {
      image.data.set(
        pixels.subarray((height - 1 - y) * rowBytes, (height - y) * rowBytes),
        y * rowBytes,
      );
    }
    ctx.putImageData(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.8),
    );
    await storeThumbnail(projectId, blob);
  }

  /**
   * Every built entity group in the scene — placements, connectors, colliders (one per
   * placement of a SubPart-owned one), IVA seats, kittens and lights. The frame-all set.
   * Editor aids that are not part of the Part (measurements, reference containers, grids)
   * are deliberately excluded.
   */
  private allEntityGroups(): THREE.Object3D[] {
    const groups: THREE.Object3D[] = [];
    for (const obj of this.objects.values()) groups.push(obj.group);
    for (const obj of this.connectorObjects.values()) groups.push(obj.group);
    for (const objs of this.colliderObjects.values())
      for (const obj of objs) groups.push(obj.group);
    for (const obj of this.seatObjects.values()) groups.push(obj.group);
    for (const obj of this.kittenObjects.values()) groups.push(obj.group);
    for (const objs of this.lightObjects.values()) for (const obj of objs) groups.push(obj.group);
    return groups;
  }

  /**
   * World bounds centre of the current selection, or null when nothing (built) is selected —
   * the orbit target for Frame Selection and the camera snaps.
   *
   * NOT {@link selectionCentroid}, which averages Part-space transform ORIGINS for the gizmo
   * pivot: a single off-centre mesh would orbit around its origin rather than around what
   * you can see. The design's "selection centroid" (design-build-mode.md §5.3) is the
   * visual centre, which is the bounds centre.
   */
  private selectionWorldCenter(): THREE.Vector3 | null {
    const objects = this.selectedObjects().map((o) => o.group);
    if (objects.length === 0) return null;
    const bounds = computeSelectionBounds(objects, 'world');
    return bounds ? new THREE.Vector3(bounds.center.x, bounds.center.y, bounds.center.z) : null;
  }

  /** Resolves all currently selected scene objects (SubParts + connectors + colliders + seats + kittens + lights) that are built. */
  private selectedObjects(): SelectableObject[] {
    const out: SelectableObject[] = [];
    for (const ref of $selection.get()) {
      switch (ref.kind) {
        case 'subpart': {
          const obj = this.objects.get(ref.id);
          if (obj) out.push(obj);
          break;
        }
        case 'connector': {
          const obj = this.connectorObjects.get(ref.id);
          if (obj) out.push(obj);
          break;
        }
        case 'collider':
          // Every instance of a SubPart-owned collider highlights together — they are one
          // document entity, so highlighting only the gizmo target would read as a bug.
          for (const obj of this.colliderObjects.get(ref.id) ?? []) out.push(obj);
          break;
        case 'ivaSeat': {
          const obj = this.seatObjects.get(ref.id);
          if (obj) out.push(obj);
          break;
        }
        case 'kitten': {
          const obj = this.kittenObjects.get(ref.id);
          if (obj) out.push(obj);
          break;
        }
        case 'light': {
          // The CONTEXT instance only (last-clicked, default 0): a SubPart-owned light is
          // one document entity drawn N times, and highlighting just the instance being
          // worked through is what tells the user which frame their edits go through
          // (plans/LIGHT_MANAGEMENT_PLAN.md §3.7-4 — deliberately unlike colliders).
          const objs = this.lightObjects.get(ref.id) ?? [];
          const obj = objs[this.lightContextIndex(ref.id, objs.length)];
          if (obj) out.push(obj);
          break;
        }
      }
    }
    return out;
  }

  /** The built scene groups of the selected SubPart placements (fit + aim targets). */
  private selectedPlacementGroups(): THREE.Group[] {
    return $selection.get().flatMap((ref) => {
      if (ref.kind !== 'subpart') return [];
      const obj = this.objects.get(ref.id);
      return obj ? [obj.group] : [];
    });
  }

  /**
   * Re-seats the bulk pivot: at the selection centroid, unit scale, and oriented per
   * {@link $gizmoSpace} — identity in `world` (v1's only behavior), the PRIMARY
   * (last-selected) entity's Part-space orientation in `local`, so the rotate rings turn
   * about that entity's axes through the shared centroid (design-build-mode.md §4.2).
   *
   * **Scale mode keeps the identity orientation on purpose.** A per-axis scale factor about
   * rotated axes is not representable as the (position, Euler, scale) triple every entity
   * stores — it would need a shear — so orienting the pivot for Scale would show handles
   * whose drag cannot be honoured. (three's `TransformControls` also forces local space for
   * scale internally, so with an identity pivot the two agree by construction.)
   */
  private repositionPivot(): void {
    const refs = liftedSelectionRefs();
    const c = centroidOf(refs.map((r) => r.transform.position));
    this.pivot.position.set(c.x, c.y, c.z);
    this.pivot.scale.set(1, 1, 1);

    const primaryId = $selection.get().at(-1)?.id;
    const primary = refs.find((r) => r.id === primaryId);
    if ($gizmoSpace.get() === 'local' && $effectiveToolMode.get() !== 'scale' && primary) {
      // Through `matrixFromTransform` so the KSA↔three Euler order stays coords.ts's alone.
      // Unit scale, because a mirrored placement would otherwise decompose its reflection
      // into the quaternion and tilt the handles.
      matrixFromTransform({
        position: { x: 0, y: 0, z: 0 },
        rotation: primary.transform.rotation,
        scale: { x: 1, y: 1, z: 1 },
      }).decompose(new THREE.Vector3(), this.pivot.quaternion, new THREE.Vector3());
    } else {
      this.pivot.quaternion.identity();
    }
  }

  /**
   * The gizmo space the CURRENT attach target honours — the exhaust proxy stays world (see
   * attachGizmo). Posing never reaches here: `PoseGizmo` owns the pose proxy outright and
   * TransformControls is detached (`attachGizmo(null)`) for the whole pose-editing session.
   */
  private applyGizmoSpace(): void {
    const proxy = this.attachedObject === this.engineProxy;
    this.gizmo.setSpace(proxy ? 'world' : $gizmoSpace.get());
  }

  /**
   * Data mode's scope tint + the one-shot hover/eye flash (design §A2, §A5). A TINT, not a
   * selection: it runs through the same emissive path at a lower strength, and a placement
   * that is genuinely SELECTED keeps the full highlight (the selection always wins, so the
   * two can never half-overwrite each other).
   *
   * Re-run from {@link updateSelection} as well as from its own subscriptions, because
   * deselecting a tinted placement must put its tint back rather than the base emissive.
   */
  private applyDataTint(): void {
    const selected = new Set(this.selectedObjects());
    const wanted = new Set<SubPartObject>();
    const flash = $dataFlash.get();
    for (const id of [...$dataHighlight.get(), ...(flash?.instanceIds ?? [])]) {
      const obj = this.objects.get(id);
      if (obj && !selected.has(obj)) wanted.add(obj);
    }
    for (const obj of this.tinted) {
      if (!wanted.has(obj) && !selected.has(obj)) obj.setTint(0);
    }
    for (const obj of wanted) obj.setTint(DATA_TINT_STRENGTH);
    this.tinted = [...wanted];

    // Connector markers have no tint channel — only the binary selection highlight — so the
    // Coupling section's "Show →" eye borrows it for the flash window and hands it straight
    // back. A genuinely selected connector is excluded, so the two can never fight.
    const wantedConnectors = new Set<ConnectorObject>();
    for (const id of flash?.connectorIds ?? []) {
      const obj = this.connectorObjects.get(id);
      if (obj && !selected.has(obj)) wantedConnectors.add(obj);
    }
    for (const obj of this.flashedConnectors) {
      if (!wantedConnectors.has(obj) && !selected.has(obj)) obj.setSelected(false);
    }
    for (const obj of wantedConnectors) obj.setSelected(true);
    this.flashedConnectors = [...wantedConnectors];
  }

  /**
   * Surface mode's **face highlight** (design-surface-assets.md §1.5, D12): the picked face
   * tints on EVERY placement of the picked mesh, which is what makes "face config is
   * per-template data" visible instead of implied.
   *
   * A genuinely SELECTED placement keeps the selection highlight (the two share the emissive
   * channel, so the selection always wins), and `applyDataTint` is re-run afterwards because
   * clearing a face tint restores base emissives that a Data-mode scope tint may have owned.
   */
  private applyFaceHighlight(): void {
    const highlight = $faceHighlight.get();
    const selected = new Set(this.selectedObjects());
    const wanted: SubPartObject[] = [];
    let groupIndex: number | null = null;
    let whole = false;

    if (highlight) {
      const part = $part.get();
      const mesh = part.customMeshes.find((m) => m.id === highlight.meshId);
      if (mesh) {
        const keys = faceKeysFor(mesh);
        // No face grid at all (imported / kitten), or the single-key 'all' of a sphere or
        // plane, or "no face picked" ⇒ the whole mesh tints.
        whole = keys.length <= 1 || highlight.faceKey === null;
        const index = highlight.faceKey ? keys.indexOf(highlight.faceKey) : -1;
        groupIndex = index >= 0 ? index : null;
        for (const p of part.placements) {
          if (p.subPartTemplateId !== mesh.subPartId) continue;
          const obj = this.objects.get(p.instanceId);
          if (obj) wanted.push(obj);
        }
      }
    }

    const wantedSet = new Set(wanted);
    for (const obj of this.faceHighlighted) {
      if (wantedSet.has(obj)) continue;
      obj.setFaceHighlight(null, false);
      if (selected.has(obj)) obj.setSelected(true);
    }
    for (const obj of wanted) {
      if (selected.has(obj)) continue;
      obj.setFaceHighlight(groupIndex, whole);
    }
    this.faceHighlighted = wanted;
    this.applyDataTint();
  }

  /**
   * The left Face card's LIVE UV draft (design-surface-assets.md §1.4): while the user types,
   * the picked mesh's placements render a geometry baked with the draft's scale/offset, and
   * only the field's COMMIT reaches the document as one undo step.
   *
   * It re-bakes through `applyFaceUvTransforms` — the same function the render cache and the
   * exporter use (guardrail 15, "no new preview math") — so what you see while typing is what
   * the commit will produce. The draft geometry is owned here and disposed on clear.
   */
  private applyFaceDraft(): void {
    for (const obj of this.faceDraftObjects) obj.setGeometryOverride(null);
    this.faceDraftObjects = [];
    if (this.faceDraftGeometry) {
      this.faceDraftGeometry.dispose();
      this.faceDraftGeometry = null;
    }

    const draft = $faceDraft.get();
    if (!draft) return;
    const part = $part.get();
    const mesh = part.customMeshes.find((m) => m.id === draft.meshId);
    if (!mesh?.primitive) return;

    const geometry = buildPrimitiveGeometry(mesh.primitive);
    applyFaceUvTransforms(geometry, faceKeysFor(mesh), {
      ...mesh.faceTextures,
      [draft.faceKey]: draft.cfg,
    });
    this.faceDraftGeometry = geometry;
    for (const p of part.placements) {
      if (p.subPartTemplateId !== mesh.subPartId) continue;
      const obj = this.objects.get(p.instanceId);
      if (!obj) continue;
      obj.setGeometryOverride(geometry);
      this.faceDraftObjects.push(obj);
    }
  }

  /** Syncs the selection highlight and gizmo attachment to the current selection. */
  private updateSelection(): void {
    // "Coverage on the selected light" is selection-driven, so it re-applies here too —
    // before the mid-drag early-return, so it also tracks a change of edit context.
    this.applyLightCoverage();
    const selected = this.selectedObjects();
    const next = new Set(selected);
    for (const obj of this.highlighted) if (!next.has(obj)) obj.setSelected(false);
    for (const obj of selected) obj.setSelected(true);
    this.highlighted = selected;
    // After the selection has been applied, so a just-deselected placement of the Data-mode
    // scope goes back to the TINT — or of the Surface-mode pick, back to its FACE tint —
    // rather than to its base emissive. `applyFaceHighlight` re-runs `applyDataTint` itself.
    this.applyFaceHighlight();
    // …and, after the Data/Surface tints have settled, the Animation-mode membership tints
    // (the three are mutually exclusive in practice — each is gated on its own mode).
    this.applyMembershipTint();
    this.measurements.refresh();
    // Recompute container out-of-bounds warnings here too: this runs after
    // reconcile (so removed meshes are already gone) and inside the async SubPart
    // build callback (so newly-added meshes exist with geometry loaded). The
    // layer's own `$part` subscription only catches mesh *moves*, firing before
    // reconcile — too early to see adds/removes.
    this.containers.refresh();

    // Gizmo attachment — never re-attach mid-drag (it would reset the drag).
    if (this.gizmo.isDragging || this.poseGizmo.isDragging) return;

    // Pose-editing takes precedence: when a joint + keyframe are active, the ANIMATION
    // gizmo (§9.2) edits the joint's pose via an empty proxy positioned at the joint's
    // world frame. TransformControls detaches entirely — it is Build/Engine's gizmo now.
    const poseTarget = this.poseEditTarget();
    if (poseTarget) {
      const m = jointWorld(poseTarget.anim, poseTarget.joint.id, poseTarget.kf.timeSec);
      m.decompose(this.poseProxy.position, this.poseProxy.quaternion, this.poseProxy.scale);
      this.poseProxy.updateMatrixWorld(true);
      this.applyPoseGizmo(poseTarget);
      this.attachGizmo(null);
      return;
    }
    this.poseGizmo.attach(null);

    // Engine designer: when the exhaust gizmo is on, attach it to a proxy posed at the
    // targeted nozzle's exhaust POINT and AXIS, so Move relocates the point and Rotate
    // re-aims the direction. Posing the proxy's rotation (rather than resetting it to
    // identity) is what makes the rotate rings mean something.
    const nozzle = this.activeNozzleTarget();
    if (nozzle && $activeTool.get() === 'exhaust') {
      const pos = exhaustWorldLocation(nozzle.location, nozzle.frame);
      this.engineProxy.position.set(pos.x, pos.y, pos.z);
      this.engineProxy.quaternion.copy(
        aimQuaternion(exhaustWorldDirection(nozzle.direction, nozzle.frame)),
      );
      this.engineProxy.scale.setScalar(1);
      this.engineProxy.updateMatrixWorld(true);
      this.attachGizmo(this.engineProxy);
      return;
    }

    // 2+ entities -> attach to the centroid pivot for bulk transforms; otherwise
    // attach directly to the single selected object (SubPart, connector, seat, ...).
    const part = $part.get();
    const sel = $selection.get();
    const colliderRefs = sel.filter((r) => r.kind === 'collider');
    const lightRefs = sel.filter((r) => r.kind === 'light');
    const multi = sel.length > 1;
    let target: THREE.Object3D | null;

    // Suppress the gizmo when any selected entity is in a locked layer (items
    // can be selected from the entity list for inspection but must not be moved).
    const anyLocked = sel.some((r) => isLayerLocked(refLayerId(part, r)));
    // While the preview shows a POSED frame (t>0 / editing), an animated SubPart's
    // group sits at its animated transform — suppress the gizmo so a drag can't write
    // the posed transform back as the static placement. At rest (t=0) it's safe.
    const previewLocked = this.isPreviewPosed() && this.selectedIsAnimated();
    // Publish it (§9.6): the status bar's persistent message, the Tool bar's disabled state
    // and the transport chip all read this one answer, so the lock is legible instead of
    // silent (census pain 8). The scene→UI report pattern (foundation §13).
    if ($posedPlacementLock.get() !== previewLocked) $posedPlacementLock.set(previewLocked);
    // Sitting in a seat: the gizmo would render at (or inside) the camera and there is
    // nothing to aim it with — the whole viewport is the preview.
    if (anyLocked || previewLocked || $seatView.get() !== null) {
      target = null;
    } else if (multi) {
      this.repositionPivot();
      target = this.pivot;
    } else if (colliderRefs.length === 1) {
      // A SubPart-owned collider has one visual PER PLACEMENT; attach to whichever the
      // user last clicked ($colliderEditContext) so the drag has an unambiguous frame.
      const id = colliderRefs[0].id;
      const objs = this.colliderObjects.get(id) ?? [];
      target = objs[this.colliderContextIndex(id, objs.length)]?.group ?? null;
    } else if (lightRefs.length === 1) {
      // Same rule for a SubPart-owned light: attach to the CONTEXT instance
      // ($lightEditContext — last clicked, default 0) so the drag has an unambiguous
      // frame; handleGizmoChange converts back through the same placement via
      // lightGizmoFrame. (selectedObjects() already returns only this instance, but
      // resolving it here keeps the attach rule explicit and collider-parallel.)
      const id = lightRefs[0].id;
      const objs = this.lightObjects.get(id) ?? [];
      target = objs[this.lightContextIndex(id, objs.length)]?.group ?? null;
    } else {
      target = selected[0]?.group ?? null;
    }
    this.attachGizmo(target);
  }

  /**
   * The single gizmo attach point. Re-applies the effective tool mode after every attach,
   * because what the gizmo is attached TO decides which modes are meaningful (exhaust
   * placement has no scale) — see {@link $effectiveToolMode}.
   */
  private attachGizmo(target: THREE.Object3D | null): void {
    if (target !== this.attachedObject) {
      this.gizmo.attach(target);
      this.attachedObject = target;
    }
    this.gizmo.setMode($effectiveToolMode.get());
    // The pose and exhaust proxies keep v1's world-space handles: `$gizmoSpace` is a BUILD
    // tool parameter (design-build-mode.md §4.2), and posing/aiming already carry their own
    // oriented proxies. Every entity target honours it — for a single owned collider/light
    // the gizmo is attached to the instance VISUAL, which already sits in the owner's
    // world frame, so `local` aligns to the entity's own axes with no extra work.
    this.applyGizmoSpace();
  }

  /**
   * Attaches + configures the pose gizmo for the pinned joint (§9.2): amber handles when the
   * drag is routed to the pivot, rotation about the working pivot when one is set, and rings
   * sized to the member set's bounding sphere at the pinned time.
   */
  private applyPoseGizmo(target: {
    anim: PartAnimation;
    joint: PartAnimation['joints'][number];
    kf: PartAnimation['keyframes'][number];
  }): void {
    const pivotRouting = $pivotRouting.get();
    this.poseGizmo.setStyle(pivotRouting ? 'pivot' : 'pose');
    this.poseGizmo.setMode(poseToolMode($effectiveToolMode.get(), pivotRouting));
    const working = $workingPivot.get();
    this.poseGizmo.setPivotPoint(
      working
        ? new THREE.Vector3(working.position.x, working.position.y, working.position.z)
        : null,
    );
    this.poseGizmo.setRadius(this.memberRadius(target.joint.memberInstanceIds));
    this.poseGizmo.attach(this.poseProxy);
  }

  /**
   * The bounding-sphere radius of a joint's member meshes AS CURRENTLY DRAWN (the preview
   * override has already posed them), which is what makes the rotate rings wrap the geometry
   * they swing. Falls back to a sane default for a joint with no members yet.
   */
  private memberRadius(memberInstanceIds: readonly string[]): number {
    const box = new THREE.Box3();
    let any = false;
    for (const id of memberInstanceIds) {
      const obj = this.objects.get(id);
      if (!obj) continue;
      const objBox = new THREE.Box3().setFromObject(obj.group);
      if (objBox.isEmpty()) continue;
      box.union(objBox);
      any = true;
    }
    if (!any) return 0.5;
    return Math.max(1e-3, box.getSize(new THREE.Vector3()).length() / 2);
  }

  /** Streams a gizmo change back to the store (single entity) or all selected (bulk). */
  private handleGizmoChange(object: THREE.Object3D): void {
    if (this.bulkSnapshot) {
      this.applyBulkFromPivot();
      return;
    }
    const world = readPlacementTransform(object);
    // A collider visual sits in PART space; its document transform is in its owner's
    // frame, so a SubPart-owned one has to be converted back before it is stored.
    const sel = object.userData.selectable as { kind?: string; id?: string } | undefined;
    if (sel?.kind === 'collider') {
      const index = $part.get().colliders.findIndex((c) => c.id === sel.id);
      if (index >= 0) {
        const frame = this.colliderGizmoFrame(index);
        updateColliderTransform(index, frame ? colliderLocalFromWorld(world, frame) : world);
        return;
      }
    }
    // Same for a light visual — converted through the CONTEXT placement's STATIC frame
    // (lightGizmoFrame), which is exactly the frame positionLights placed this object
    // with: while the animation preview shows a POSED owner, selectedIsAnimated()
    // detaches the gizmo entirely (the collider rule), so a drag can never read a
    // posed pose and write it back as the modeled transform.
    if (sel?.kind === 'light') {
      const index = $part.get().lights.findIndex((l) => l.id === sel.id);
      if (index >= 0) {
        // lightLocalFromWorld takes the null frame itself (part-level ⇒ verbatim).
        updateLightTransform(index, lightLocalFromWorld(world, this.lightGizmoFrame(index)));
        return;
      }
    }
    updateSelectedTransform(world);
  }

  /**
   * The placement a collider's gizmo currently edits through — the instance the user last
   * clicked (see {@link colliderInstance}). Null for a part-level collider, or one whose
   * owner template isn't placed: those live directly in Part space.
   */
  private colliderGizmoFrame(index: number): Transform | null {
    const part = $part.get();
    const collider = part.colliders[index];
    if (!collider) return null;
    const owners = this.colliderOwners(part, collider);
    if (owners.length === 0) return null;
    return owners[this.colliderContextIndex(collider.id, owners.length)] ?? null;
  }

  /**
   * The context instance index for a collider — the visual last clicked
   * ({@link $colliderEditContext}; default 0, clamped to `count`). The collider twin of
   * {@link lightContextIndex}, and the same rule `selectionTransform` applies, so the
   * gizmo, the numeric fields and the keyboard tools always work through one frame.
   */
  private colliderContextIndex(colliderId: string, count: number): number {
    const i = $colliderEditContext.get()[colliderId] ?? 0;
    return Math.max(0, Math.min(i, count - 1));
  }

  /**
   * The placement a light's gizmo (and the inspector's part-frame fields) currently
   * edit through — the instance the user last clicked ({@link $lightEditContext},
   * default 0). Null for a part-level light, or one whose owner template isn't placed:
   * those render directly in the Part frame ({@link lightWorld} with a null owner).
   * Always the STATIC placement, which is what {@link positionLights} placed the visual
   * with outside a posed preview — and during one, {@link selectedIsAnimated} locks the
   * gizmo so no drag can go through the wrong frame.
   */
  private lightGizmoFrame(index: number): Transform | null {
    const part = $part.get();
    const light = part.lights[index];
    if (!light) return null;
    const owners = this.lightOwners(part, light);
    if (owners.length === 0) return null;
    return owners[this.lightContextIndex(light.id, owners.length)] ?? null;
  }

  /** The active pose-edit target (active animation + joint + keyframe), or null. */
  private poseEditTarget(): {
    anim: PartAnimation;
    joint: PartAnimation['joints'][number];
    kf: PartAnimation['keyframes'][number];
  } | null {
    // Only while the Animation editor is open (its atoms persist across mode switches).
    if ($mode.get() !== 'animation') return null;
    const animId = $activeAnimationId.get();
    const jointId = $activeJointId.get();
    const kfId = $editKeyframeId.get();
    if (!animId || !jointId || !kfId) return null;
    const anim = $part.get().animations.find((a) => a.id === animId);
    const joint = anim?.joints.find((j) => j.id === jointId);
    const kf = anim?.keyframes.find((k) => k.id === kfId);
    if (!anim || !joint || !kf) return null;
    return { anim, joint, kf };
  }

  /**
   * Writes a pose-gizmo drag back to the document. The proxy's local matrix is the joint's
   * world frame (the root is at identity), so the new local pose is
   * `parentWorld(t)⁻¹ · proxy`. STREAMING — the drag start pushed the single undo step.
   *
   * **The §9.4 routing, and the death of v1's t=0 special case.** When the pinned column is
   * the REST ANCHOR (`$pivotRouting`) there is no meaningful "pose" — the composed pose there
   * equals the modeled placements — so Move relocates the hinge (`moveJointPivot`, rigid,
   * geometry-invariant at every t) and Rotate re-bases it (`reorientJointPivot`). Scale is
   * absent there (a pivot stays unit-scaled) and the gizmo degrades it to Move. Every other
   * column, including t=0 on an imported deploy clip, is a plain pose edit — which is exactly
   * the inconsistency census §4.6 recorded, now gone.
   */
  private handlePoseGizmoChange(): void {
    const target = this.poseEditTarget();
    if (!target) return;
    const { anim, joint, kf } = target;
    const proxyWorld = new THREE.Matrix4().compose(
      this.poseProxy.position,
      this.poseProxy.quaternion,
      this.poseProxy.scale,
    );
    const parentWorld = joint.parentJointId
      ? jointWorld(anim, joint.parentJointId, kf.timeSec)
      : new THREE.Matrix4();
    const newLocal = parentWorld.invert().multiply(proxyWorld);
    const t = transformFromMatrix(newLocal);

    if ($pivotRouting.get()) {
      const mode = poseToolMode($effectiveToolMode.get(), true);
      if (mode === 'translate') {
        const cur = kf.poses[joint.id]?.position ?? { x: 0, y: 0, z: 0 };
        moveJointPivot(anim.id, joint.id, {
          x: t.position.x - cur.x,
          y: t.position.y - cur.y,
          z: t.position.z - cur.z,
        });
      } else if (mode === 'rotate') {
        // proxyWorld is the pivot's Part-space frame; rebase converts to parent-local.
        reorientJointPivot(anim.id, joint.id, transformFromMatrix(proxyWorld));
      }
      return;
    }
    setJointPose(anim.id, kf.id, joint.id, t);
  }

  /**
   * Every nozzle-exhaust handle to draw right now — the open engine's nozzles across both
   * flavors and both channels, resolved against `$part` by {@link $resolvedNozzleTargets}.
   * Empty outside the Engine designer (the engine atoms deliberately survive mode switches,
   * so the mode gate lives here rather than in the store).
   */
  private nozzleTargets(): NozzleTarget[] {
    return $mode.get() === 'engine' ? $resolvedNozzleTargets.get() : [];
  }

  /** The one nozzle placement the exhaust gizmo edits, or null. */
  private activeNozzleTarget(): NozzleTarget | null {
    return $mode.get() === 'engine' ? $activeNozzleTarget.get() : null;
  }

  /**
   * Reconciles the exhaust markers against {@link nozzleTargets} — create, pose, dim,
   * remove. Handles are keyed by target key (scope + flavor + index + channel), so a
   * nozzle removal or an FX override being switched off retires exactly its own handle.
   * They are disposed rather than merely hidden when the designer closes: they are pickable
   * now, and a hidden-but-pickable marker would keep stealing clicks (three.js raycasts
   * invisible objects).
   */
  private applyEngineHandles(): void {
    const targets = this.nozzleTargets();
    const wanted = new Set(targets.map((t) => t.key));
    for (const [key, handle] of this.nozzleHandles) {
      if (wanted.has(key)) continue;
      this.root.remove(handle.group);
      handle.dispose();
      this.nozzleHandles.delete(key);
      this.nozzleRefs.delete(key);
    }
    for (const target of targets) {
      let handle = this.nozzleHandles.get(target.key);
      if (!handle) {
        handle = new NozzleHandleObject(target.key, target.ref.channel);
        this.nozzleHandles.set(target.key, handle);
        this.root.add(handle.group);
      }
      this.nozzleRefs.set(target.key, target.ref);
      const pos = exhaustWorldLocation(target.location, target.frame);
      const dir = exhaustWorldDirection(target.direction, target.frame);
      handle.setPose(
        new THREE.Vector3(pos.x, pos.y, pos.z),
        new THREE.Vector3(dir.x, dir.y, dir.z),
      );
      handle.setActive(target.isActive);
    }
  }

  /**
   * Writes an exhaust-gizmo drag back to the targeted nozzle, in the channel it names.
   *
   * - **Move** → the exhaust LOCATION: the proxy's Part-space position converted into the
   *   owner's assembly frame (which is what the vectors are expressed in — a rotated owner
   *   carries its exhaust with it, exactly as `Part.MatrixAsmb2VehicleAsmb` composes it).
   * - **Rotate** → the exhaust DIRECTION: the proxy's local +X, back through the owner's
   *   rotation. Roll about the exhaust axis is undefined in-game (the plume is axially
   *   symmetric and `Vehicle.SpawnThrusterSparks` invents an arbitrary basis), so a roll
   *   drag simply has no effect rather than being locked out.
   *
   * The PHYSICS direction is normalized on every write — KSA applies thrust as
   * `TotalThrust * -ExhaustDirection` **unnormalized** (`VehicleUpdateState.cs:294`), so a
   * non-unit vector silently rescales thrust. The FX direction keeps its authored MAGNITUDE
   * (stock ships non-unit FX vectors like `0, 0.550, -1.000`, and every FX consumer
   * `NormalizeOrZero()`s first) — a re-aim must not quietly renormalize someone's data.
   *
   * STREAMING (drag-start pushed undo once).
   */
  private handleEngineGizmoChange(): void {
    const target = this.activeNozzleTarget();
    if (!target) return;
    const { ref, frame, nozzle } = target;
    const isFx = ref.channel === 'fx';

    if ($toolMode.get() === 'rotate') {
      const world = new THREE.Vector3(1, 0, 0).applyQuaternion(this.engineProxy.quaternion);
      const local = exhaustLocalDirection({ x: world.x, y: world.y, z: world.z }, frame);
      if (!isFx) {
        updateNozzleAt(ref, { exhaustDirection: normalizedVec(local) });
        return;
      }
      const authored = nozzle.fxExhaustDirection ?? nozzle.exhaustDirection;
      const scale = Math.hypot(authored.x, authored.y, authored.z) || 1;
      const unit = normalizedVec(local);
      updateNozzleAt(ref, {
        fxExhaustDirection: { x: unit.x * scale, y: unit.y * scale, z: unit.z * scale },
      });
      return;
    }

    const p = this.engineProxy.position;
    const local = exhaustLocalLocation({ x: p.x, y: p.y, z: p.z }, frame);
    updateNozzleAt(ref, isFx ? { fxExhaustLocation: local } : { exhaustLocation: local });
  }

  /**
   * Snapshots all selected entities' transforms at the start of a bulk gizmo drag.
   *
   * `force` re-routes a SINGLE-entity drag through the bulk path too, which is what the
   * ⌥-duplicate gesture needs: the freshly duplicated entity's scene object may not exist
   * yet (SubPart geometry builds asynchronously), so the gizmo drags {@link pivot} and the
   * delta is fanned out to the copies by id — see {@link beginDuplicateDrag}.
   */
  private beginBulkDrag(force = false): void {
    const refs = liftedSelectionRefs();
    if (refs.length === 0 || (refs.length === 1 && !force)) {
      this.bulkSnapshot = null;
      return;
    }
    this.bulkSnapshot = {
      centroid: centroidOf(refs.map((r) => r.transform.position)),
      // The pivot's frame AT DRAG START. `TransformControls` writes `start · Δ` into the
      // attached object every move, so every delta below is taken against these three —
      // which is also what lets the duplicate drag seed the pivot from whatever object the
      // gizmo actually grabbed (identity/centroid in the ordinary multi-select case).
      startPos: this.pivot.position.clone(),
      startQuat: this.pivot.quaternion.clone(),
      startScale: this.pivot.scale.clone(),
      items: refs,
    };
  }

  /**
   * ⌥ held at gizmo drag start ⇒ **duplicate, then drag the copies** (design-build-mode.md
   * §5.1; foundation §14.2, LOCKED #7). Returns true when it took over the gesture.
   *
   * ONE undo step for the whole gesture: `duplicateSelected` pushes `'duplicate'` and the
   * caller then SKIPS its own `'move'`/`'rotate'`/`'scale'` push, so a single ⌘Z removes the
   * copies entirely (DCC convention) instead of leaving them parked on their sources.
   *
   * Mechanics: the copies land exactly on their sources (`offset: false` — the drag IS the
   * offset) and become the selection, but their scene objects may not be built yet, so the
   * gizmo is re-seated onto {@link pivot} carrying the grabbed object's exact local frame.
   * `TransformControls` captured its `_positionStart`/`_quaternionStart`/`_scaleStart` from
   * that same object one statement earlier, so the swap is invisible to the drag math, and
   * `applyBulkFromPivot` fans the delta out to the copies by id every frame.
   */
  private beginDuplicateDrag(): boolean {
    if (!$heldModifiers.get().alt) return false;
    // The exhaust proxy is not the selection — ⌥ means nothing there.
    const grabbed = this.attachedObject;
    if (!grabbed || grabbed === this.engineProxy) return false;
    if ($selection.get().length === 0) return false;

    duplicateSelected({ offset: false });

    if (grabbed !== this.pivot) {
      this.pivot.position.copy(grabbed.position);
      this.pivot.quaternion.copy(grabbed.quaternion);
      this.pivot.scale.copy(grabbed.scale);
      this.pivot.updateMatrixWorld(true);
      this.attachGizmo(this.pivot);
    }
    this.beginBulkDrag(true);
    return true;
  }

  /** Applies the pivot's delta (per the active tool mode) to every snapshotted entity. */
  private applyBulkFromPivot(): void {
    const snap = this.bulkSnapshot;
    if (!snap) return;
    const mode = $toolMode.get();
    const updates = snap.items.map(({ kind, id, index, transform: base }) => {
      if (mode === 'translate') {
        const delta = {
          x: this.pivot.position.x - snap.startPos.x,
          y: this.pivot.position.y - snap.startPos.y,
          z: this.pivot.position.z - snap.startPos.z,
        };
        return { kind, id, index, transform: translatedTransform(base, delta) };
      }
      if (mode === 'rotate') {
        // The DELTA since drag start, not the pivot's absolute orientation: in local space
        // the pivot starts at the primary entity's orientation, and applying that would
        // spin the whole selection the moment the ring is touched.
        const delta = this.pivot.quaternion.clone().multiply(snap.startQuat.clone().invert());
        return {
          kind,
          id,
          index,
          transform: rotatedAroundOriginTransform(base, delta, snap.centroid),
        };
      }
      // RELATIVE to the drag-start scale: the ordinary pivot starts unit-scaled, but a
      // ⌥-duplicate drag seeds it from the grabbed object, which may not be.
      const factor = {
        x: this.pivot.scale.x / snap.startScale.x,
        y: this.pivot.scale.y / snap.startScale.y,
        z: this.pivot.scale.z / snap.startScale.z,
      };
      return {
        kind,
        id,
        index,
        transform: groupScaledTransform(
          kind,
          base,
          factor,
          $bulkScaleMode.get() === 'smart' ? snap.centroid : null,
        ),
      };
    });
    // Owner-local again on the way back down — each kind through the inverse of the SAME
    // lift `liftedSelectionRefs` took it up with (shared with the keyboard tools).
    writeBackLifted(updates);
  }

  /** Ends a bulk drag: drops the snapshot and re-centers the pivot on the new layout. */
  private endBulkDrag(): void {
    if (!this.bulkSnapshot) return;
    this.bulkSnapshot = null;
    this.repositionPivot();
  }

  // ── marquee box select (design-build-mode.md §1.4; foundation §14.1) ────────
  //
  // Three ways in, one gesture: the `B` tool arms a one-shot REPLACE marquee; ⇧-drag
  // starting on empty canvas ADDS; ⌥⇧-drag SUBTRACTS. A plain drag is still orbit, and a
  // ⇧-drag that starts ON an entity is still the additive click. The rectangle is DOM
  // (`MarqueeOverlay` reads `$marqueeRect`), so the on-demand render loop never wakes.
  //
  // Marquee NEVER creates an undo step.

  /** Does a raycast at the pointer hit any selectable entity? (⇧-drag only starts on empty.) */
  private hitsSelectable(e: PointerEvent): boolean {
    const dom = this.viewport.renderer.domElement;
    const rect = dom.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.viewport.camera,
    );
    for (const hit of this.raycaster.intersectObjects(this.root.children, true)) {
      for (let node: THREE.Object3D | null = hit.object; node; node = node.parent)
        if (node.userData?.selectable) return true;
    }
    return false;
  }

  private readonly onMarqueePointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || this.marquee) return;
    // Never steal the pointer from a gizmo drag, a measurement pick or seat view — nor from
    // a pose-gizmo handle the pointer is already over (its own listener runs after this one).
    if (this.suppressPickDrag || this.suppressPickMeasure || this.suppressPickSeatView) return;
    if (this.poseGizmo.hitTest(e.clientX, e.clientY)) return;
    const armed = $activeTool.get() === 'marquee';
    // Another tool holds the slot: its gesture wins (single-slot invariant, foundation §2.6).
    if (!armed && $activeTool.get() !== null) return;

    let mode: 'replace' | 'add' | 'subtract';
    if (armed) mode = 'replace';
    else if (e.shiftKey && !this.hitsSelectable(e)) mode = e.altKey ? 'subtract' : 'add';
    else return; // plain drag stays orbit; ⇧-click on an entity stays the additive click

    const rect = this.viewport.renderer.domElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.marquee = {
      mode,
      armed,
      downX: e.clientX,
      downY: e.clientY,
      x0: x,
      y0: y,
      x1: x,
      y1: y,
      boxes: this.marqueeBoxes(rect),
      pointerId: e.pointerId,
    };
    // Capture so a drag that leaves the canvas keeps reporting (and still releases).
    this.viewport.renderer.domElement.setPointerCapture(e.pointerId);
    // Orbit off (which is also what freezes the projection the boxes were taken from) and
    // click-select off, so releasing the drag never also fires a pick.
    this.viewport.controls.enabled = false;
    this.suppressPickMarquee = true;
    this.applySelectionSuppression();
    // Every marquee — armed or gesture-started — occupies the tool slot while it runs, so
    // the status segment, the Esc rung and cancel-on-mode-switch all have one thing to name.
    if (!armed) armTool('marquee');
    $marqueeRect.set({ x0: x, y0: y, x1: x, y1: y, count: 0 });
  };

  private readonly onMarqueePointerMove = (e: PointerEvent): void => {
    const marquee = this.marquee;
    if (!marquee) return;
    const rect = this.viewport.renderer.domElement.getBoundingClientRect();
    marquee.x1 = e.clientX - rect.left;
    marquee.y1 = e.clientY - rect.top;
    $marqueeRect.set({
      x0: marquee.x0,
      y0: marquee.y0,
      x1: marquee.x1,
      y1: marquee.y1,
      count: marqueeHits(marquee, marquee.boxes).length,
    });
  };

  private readonly onMarqueePointerUp = (e: PointerEvent): void => {
    const marquee = this.marquee;
    if (!marquee) return;
    this.endMarquee();
    // Under 4px in BOTH axes is a click, not a drag: an armed `B` micro-click just disarms,
    // and a ⇧ micro-drag on empty space is the no-op that a ⇧-click on empty space already is.
    const moved =
      Math.abs(e.clientX - marquee.downX) >= 4 || Math.abs(e.clientY - marquee.downY) >= 4;
    if (!moved) return;

    const hits = marqueeHits(marquee, marquee.boxes);
    if (marquee.mode === 'subtract') {
      deselectRefs(hits.map((h) => h.ref));
      return;
    }
    // Record the edit context for every multi-instance entity caught, exactly as a click
    // on one of its visuals would (design §1.4).
    for (const hit of hits) {
      if (hit.firstInstance === undefined) continue;
      if (hit.ref.kind === 'collider') setColliderEditContext(hit.ref.id, hit.firstInstance);
      else if (hit.ref.kind === 'light') setLightEditContext(hit.ref.id, hit.firstInstance);
    }
    select(
      hits.map((h) => h.ref),
      { additive: marquee.mode === 'add' },
    );
  };

  /** Cancels a marquee in flight without selecting anything (Esc-ladder rung 5). */
  private cancelMarquee(): void {
    if (!this.marquee) return;
    this.endMarquee();
  }

  /** Restores orbit + picking, clears the rect, and releases the one-shot tool slot. */
  private endMarquee(): void {
    const dom = this.viewport.renderer.domElement;
    if (this.marquee && dom.hasPointerCapture(this.marquee.pointerId))
      dom.releasePointerCapture(this.marquee.pointerId);
    this.marquee = null;
    this.viewport.controls.enabled = true;
    this.suppressPickMarquee = false;
    this.applySelectionSuppression();
    $marqueeRect.set(null);
    // One-shot: the tool disarms itself after a single marquee (foundation §2.6). Guarded on
    // the id so a successor tool armed meanwhile is not stomped; `disarmTool` re-enters
    // `onCancel` → `cancelMarquee`, which is a no-op now that `this.marquee` is null.
    if ($activeTool.get() === 'marquee') disarmTool('marquee');
  }

  /**
   * Screen-space AABBs for every marquee-eligible visual, in canvas pixels.
   *
   * Eligibility mirrors click-select exactly: entities on a HIDDEN or LOCKED layer are
   * excluded (§1.4). Aids — measurements, containers, the grid, the gizmo — are not in the
   * entity maps at all, so they are excluded for free.
   */
  private marqueeBoxes(rect: DOMRect): ScreenAabb[] {
    const part = $part.get();
    const boxes: ScreenAabb[] = [];
    const camera = this.viewport.camera;
    const box3 = new THREE.Box3();
    const corner = new THREE.Vector3();

    const push = (
      kind: EntityKind,
      id: string,
      group: THREE.Object3D,
      instanceIndex?: number,
    ): void => {
      box3.setFromObject(group);
      if (box3.isEmpty()) return;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < 8; i++) {
        corner.set(
          i & 1 ? box3.max.x : box3.min.x,
          i & 2 ? box3.max.y : box3.min.y,
          i & 4 ? box3.max.z : box3.min.z,
        );
        corner.project(camera);
        // Behind the camera the projection mirrors; a box straddling the near plane would
        // otherwise report a bogus screen extent, so skip the whole entity.
        if (corner.z > 1) return;
        const x = ((corner.x + 1) / 2) * rect.width;
        const y = ((1 - corner.y) / 2) * rect.height;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      boxes.push({ kind, id, instanceIndex, minX, minY, maxX, maxY });
    };

    const eligible = (layerId: string): boolean =>
      isLayerVisible(layerId) && !isLayerLocked(layerId);
    const displayed = (kind: EntityKind): boolean => this.isKindDisplayed(kind);

    if (displayed('subpart'))
      for (const p of part.placements) {
        if (!eligible(p.layerId)) continue;
        const obj = this.objects.get(p.instanceId);
        if (obj) push('subpart', p.instanceId, obj.group);
      }
    if (displayed('connector'))
      for (const c of part.connectors) {
        if (!eligible(c.layerId)) continue;
        const obj = this.connectorObjects.get(c.id);
        if (obj) push('connector', c.id, obj.group);
      }
    if (displayed('collider'))
      for (const c of part.colliders) {
        if (!eligible(c.layerId)) continue;
        // Each instance tests independently; marqueeHits collapses them to one entity.
        (this.colliderObjects.get(c.id) ?? []).forEach((obj, i) =>
          push('collider', c.id, obj.group, i),
        );
      }
    if (displayed('ivaSeat'))
      for (const seat of part.ivaSeats) {
        if (!eligible(seat.layerId)) continue;
        const obj = this.seatObjects.get(seat.id);
        if (obj) push('ivaSeat', seat.id, obj.group);
      }
    if (displayed('kitten'))
      for (const k of part.kittens) {
        if (!eligible(k.layerId)) continue;
        const obj = this.kittenObjects.get(k.id);
        if (obj) push('kitten', k.id, obj.group);
      }
    if (displayed('light'))
      for (const light of part.lights) {
        if (!eligible(light.layerId)) continue;
        (this.lightObjects.get(light.id) ?? []).forEach((obj, i) =>
          push('light', light.id, obj.group, i),
        );
      }
    return boxes;
  }

  /**
   * **View ▸ Display Filters** (design-build-mode.md §5.4): is this kind currently shown?
   *
   * The ONE predicate the three enforcement sites share — {@link applyLayerView} (which
   * composes it into `group.visible`), the click-select guards, and
   * {@link marqueeBoxes} — so a hidden kind is invisible, unclickable and unmarquee-able by
   * the same rule a hidden LAYER is. SubParts have no filter and are always displayed.
   */
  private isKindDisplayed(kind: EntityKind): boolean {
    return kind === 'subpart' || isKindVisible(kind);
  }

  private readonly onPickPointerDown = (e: PointerEvent): void => {
    const tool = $activeTool.get();
    if (tool !== 'measure' && tool !== 'member-paint' && tool !== 'pivot-pick') return;
    this.pickPointerDown = { x: e.clientX, y: e.clientY };
  };

  private readonly onPickPointerUp = (e: PointerEvent): void => {
    if ($activeTool.get() === 'pivot-pick') {
      const down = this.pickPointerDown;
      this.pickPointerDown = null;
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return; // orbit drag
      this.pickPivotPointAt(e);
      return;
    }
    if ($activeTool.get() === 'member-paint') {
      const down = this.pickPointerDown;
      this.pickPointerDown = null;
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return; // orbit drag
      this.paintMemberAt(e);
      return;
    }
    if ($activeTool.get() !== 'measure') return;
    const down = this.pickPointerDown;
    this.pickPointerDown = null;
    // Treat >4px of movement as an orbit drag, not a pick.
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;

    const point = this.pickWorldPoint(e);
    if (!point) return;

    if (this.pendingMeasurementId === null) {
      const id = addMeasurement({ source: 'point', a: point, b: point });
      this.pendingMeasurementId = id;
      setActiveMeasurement(null); // keep the editor/gizmo away until the 2nd click
      // Publish the half-placed state: the status segment's second instruction and the left
      // sidebar's tool parameter card both read it (design-build-mode.md §8.1, §3.10).
      setMeasurePending(point);
    } else {
      updateMeasurement(this.pendingMeasurementId, { b: point });
      setActiveMeasurement(this.pendingMeasurementId);
      this.pendingMeasurementId = null;
      setMeasurePending(null);
      setMeasureTool('none');
    }
  };

  /**
   * ONE `pivot-pick` click (design-animation-mode.md §9.4 item 3): the world-space point on
   * whatever mesh surface was clicked becomes either the ACTIVE JOINT's real pivot
   * (`setJointPivotPoint` — position only, discrete undo, rest-anchored like every other
   * pivot op) or the throwaway WORKING pivot. One click, then the tool disarms itself.
   */
  private pickPivotPointAt(e: PointerEvent): void {
    const target = $pivotPickTarget.get();
    const point = this.pickSurfacePoint(e);
    if (!point) {
      status('Click a mesh surface to place the pivot', { severity: 'warning' });
      return;
    }
    if (target === 'working') {
      $workingPivot.set({ kind: 'point', position: point });
      status(
        `Working pivot at (${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)})`,
      );
      disarmTool('pivot-pick');
      return;
    }
    const jointId = $activeJointId.get();
    if (!jointId) {
      status('Select a joint first', { severity: 'warning' });
      disarmTool('pivot-pick');
      return;
    }
    const name = this.activeAnimation()?.joints.find((j) => j.id === jointId)?.name ?? 'joint';
    setJointPivotPoint(jointId, point);
    status(`Pivot of ${name} moved to the picked point`, {
      severity: 'success',
      action: undoStatusAction(),
    });
    disarmTool('pivot-pick');
  }

  /**
   * The raw world point under the cursor on a PART mesh — no vertex snapping (that is the
   * measure tool's rule, not the pivot's) and no editor furniture: a joint marker is drawn in
   * the same root, so it is filtered out rather than allowed to place a pivot on itself.
   */
  private pickSurfacePoint(e: PointerEvent): Vec3 | null {
    const dom = this.viewport.renderer.domElement;
    const rect = dom.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.viewport.camera,
    );
    for (const hit of this.raycaster.intersectObjects(this.root.children, true)) {
      let kind: string | undefined;
      for (let node: THREE.Object3D | null = hit.object; node; node = node.parent) {
        const selectable = node.userData?.selectable as { kind?: string } | undefined;
        if (selectable) {
          kind = selectable.kind;
          break;
        }
      }
      if (kind === 'joint' || kind === 'nozzle') continue;
      return { x: hit.point.x, y: hit.point.y, z: hit.point.z };
    }
    return null;
  }

  /**
   * ONE member-paint click (design-animation-mode.md §7.4). Resolves the pick through the
   * SAME rule as plain selection, then routes SubParts to `paintMemberOnTarget` (assign /
   * unassign / reassign, one discrete undo step each) and explains every refusal:
   *
   * - a locked layer refuses (matching selection's own guard);
   * - a hidden layer never gets here (three.js raycasts invisible objects, so the guard is
   *   explicit, exactly as it is in the selection callback);
   * - a connector / kitten / collider / seat / light says WHY it cannot be a member — that is
   *   the KSA limitation, not a flexo choice (§7.5);
   * - empty space does nothing at all: no deselect surprise while painting.
   */
  private paintMemberAt(e: PointerEvent): void {
    const picked = this.selection.pickAt(e.clientX, e.clientY);
    // Neither is a document entity, and both are absent while painting anyway (the joint
    // markers are removed, the nozzle handles are Engine-mode furniture).
    if (!picked || picked.kind === 'nozzle' || picked.kind === 'joint') return;
    if (picked.kind !== 'subpart') {
      status(`${NON_CAPABLE_NOUN[picked.kind]} can never be joint members — KSA animates SubParts`);
      return;
    }
    const part = $part.get();
    const placement = part.placements.find((p) => p.instanceId === picked.id);
    if (!placement) return;
    if (isLayerLocked(placement.layerId)) {
      status('Layer is locked — unlock it to change membership', { severity: 'warning' });
      return;
    }
    if (!isLayerVisible(placement.layerId)) return;
    const outcome = paintMemberOnTarget(picked.id);
    switch (outcome.result) {
      case 'attached':
        status(`${picked.id} → ${outcome.jointName}`, {
          severity: 'success',
          action: undoStatusAction(),
        });
        break;
      case 'reassigned':
        status(`${picked.id}: ${outcome.fromJointName} → ${outcome.jointName}`, {
          severity: 'success',
          action: undoStatusAction(),
        });
        break;
      case 'detached':
        status(`${picked.id} removed from ${outcome.jointName}`, {
          severity: 'success',
          action: undoStatusAction(),
        });
        break;
      case 'not-a-subpart':
        status('Only SubParts can be joint members', { severity: 'warning' });
        break;
      default:
        status('Pick a target joint first', { severity: 'warning' });
    }
  }

  /**
   * The membership tint pass (design-animation-mode.md §7.6). Runs while the Members view is
   * open OR `member-paint` is armed: the target joint's members get the strong tint, every
   * other joint's members a weak one, and the hovered row's placement the full highlight.
   *
   * It reuses the emissive tint pipeline `applyDataTint` uses (a second mechanism would fight
   * it for the same uniform) and, like that pass, never downgrades a genuinely SELECTED
   * object. Invalidation is subscription-driven — nothing here forces continuous rendering.
   */
  private applyMembershipTint(): void {
    const on =
      $mode.get() === 'animation' &&
      ($membersView.get().open || $activeTool.get() === 'member-paint');
    const selected = new Set(this.selectedObjects());
    const wanted = new Map<SubPartObject, number>();
    if (on) {
      const anim = $activeAnimation.get();
      const targetId = $memberPaintTarget.get();
      const hoverId = $memberHoverId.get();
      for (const joint of anim?.joints ?? []) {
        const strength = joint.id === targetId ? MEMBER_TINT_TARGET : MEMBER_TINT_OTHER;
        for (const id of joint.memberInstanceIds) {
          const obj = this.objects.get(id);
          if (obj && !selected.has(obj)) wanted.set(obj, strength);
        }
      }
      const hovered = hoverId ? this.objects.get(hoverId) : undefined;
      if (hovered && !selected.has(hovered)) wanted.set(hovered, MEMBER_TINT_HOVER);
    }
    for (const obj of this.membershipTinted) {
      if (!wanted.has(obj) && !selected.has(obj)) obj.setTint(0);
    }
    for (const [obj, strength] of wanted) obj.setTint(strength);
    this.membershipTinted = [...wanted.keys()];
  }

  /** Raycasts the pointer against part meshes, snapping to the nearest face vertex. */
  private pickWorldPoint(e: PointerEvent): Vec3 | null {
    const dom = this.viewport.renderer.domElement;
    const rect = dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.viewport.camera);
    const hits = this.raycaster.intersectObjects(this.root.children, true);
    const hit = hits[0];
    if (hit) {
      const snapped = nearestFaceVertex(hit);
      const p = snapped ?? hit.point;
      return { x: p.x, y: p.y, z: p.z };
    }
    // No mesh under the cursor: fall back to the Y=0 ground plane so points can
    // be placed in empty space.
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(ground, target)) {
      return { x: target.x, y: target.y, z: target.z };
    }
    return null;
  }

  private cancelPendingMeasurement(): void {
    setMeasurePending(null);
    if (this.pendingMeasurementId !== null) {
      removeMeasurement(this.pendingMeasurementId);
      this.pendingMeasurementId = null;
    }
  }

  dispose(): void {
    // The scene going away takes the preview with it — the bar must not survive it.
    exitSeatView();
    if (this.faceDraftGeometry) {
      this.faceDraftGeometry.dispose();
      this.faceDraftGeometry = null;
    }
    if (this.coverageDots) {
      this.root.remove(this.coverageDots);
      this.coverageDots.geometry.dispose();
      (this.coverageDots.material as THREE.Material).dispose();
      this.coverageDots = null;
    }
    for (const objs of this.colliderObjects.values()) {
      for (const obj of objs) {
        this.root.remove(obj.group);
        obj.dispose();
      }
    }
    this.colliderObjects.clear();
    for (const objs of this.lightObjects.values()) {
      for (const obj of objs) {
        this.root.remove(obj.group);
        obj.dispose();
      }
    }
    this.lightObjects.clear();
    // The cap report describes a scene that no longer exists.
    setLightPreviewCount({ enabled: 0, total: 0 });
    const dom = this.viewport.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPickPointerDown);
    dom.removeEventListener('pointerup', this.onPickPointerUp);
    dom.removeEventListener('pointerdown', this.onMarqueePointerDown);
    dom.removeEventListener('pointermove', this.onMarqueePointerMove);
    dom.removeEventListener('pointerup', this.onMarqueePointerUp);
    this.cancelMarquee();
    dom.style.cursor = '';
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers.length = 0;
    this.selection.dispose();
    this.gizmo.dispose();
    this.poseGizmo.dispose();
    this.jointMarkers.dispose();
    this.trajectories.dispose();
    this.root.remove(this.poseProxy);
    this.chainPreview.dispose();
    this.root.remove(this.engineProxy);
    for (const handle of this.nozzleHandles.values()) {
      this.root.remove(handle.group);
      handle.dispose();
    }
    this.nozzleHandles.clear();
    this.nozzleRefs.clear();
    this.measurements.dispose();
    this.containers.dispose();
    for (const obj of this.objects.values()) obj.dispose();
    this.objects.clear();
    for (const obj of this.connectorObjects.values()) obj.dispose();
    this.connectorObjects.clear();
    for (const obj of this.seatObjects.values()) {
      this.root.remove(obj.group);
      obj.dispose();
    }
    this.seatObjects.clear();
    for (const obj of this.kittenObjects.values()) obj.dispose();
    this.kittenObjects.clear();
    this.viewport.dispose();
  }
}

/**
 * The rotation that takes local **+X** onto `dir` — the exhaust proxy's (and every flexo
 * marker's) "facing = +X" convention, so the gizmo's rotate rings sit on the exhaust axis.
 * A degenerate direction falls back to identity rather than producing a NaN quaternion.
 */
function aimQuaternion(dir: Vec3): THREE.Quaternion {
  const v = new THREE.Vector3(dir.x, dir.y, dir.z);
  if (v.lengthSq() < 1e-18) return new THREE.Quaternion();
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), v.normalize());
}

/** Unit-length copy of `v`; a zero vector degenerates to KSA's default exhaust axis (−X). */
function normalizedVec(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  if (!(len > 0)) return { x: -1, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** True when `a` and `b` point along (or against) the same line — where `seatRotationFromAxes` NaNs. */
function isParallel(a: Vec3, b: Vec3): boolean {
  const la = Math.hypot(a.x, a.y, a.z);
  const lb = Math.hypot(b.x, b.y, b.z);
  if (!(la > 0) || !(lb > 0)) return true;
  const cx = a.y * b.z - a.z * b.y;
  const cy = a.z * b.x - a.x * b.z;
  const cz = a.x * b.y - a.y * b.x;
  return Math.hypot(cx, cy, cz) / (la * lb) < 1e-6;
}

/**
 * A usable up axis for `forward` when the seat's own is unusable: KSA's own default up
 * (`SEAT_LOCAL_UP`, i.e. −Z) unless `forward` runs along it, in which case +Y. Need not be
 * perpendicular — `seatRotationFromAxes` orthogonalises exactly as the game does.
 */
function perpendicularUp(forward: Vec3): Vec3 {
  if (!isParallel(forward, SEAT_LOCAL_UP)) return { ...SEAT_LOCAL_UP };
  return { x: 0, y: 1, z: 0 };
}

/**
 * Snaps a raycast hit to the nearest of its triangle's three vertices (in world
 * space), so point measurements land on geometry corners. Returns null if the
 * intersection has no usable face/geometry.
 */
function nearestFaceVertex(hit: THREE.Intersection): THREE.Vector3 | null {
  const face = hit.face;
  const mesh = hit.object as THREE.Mesh;
  const geom = mesh.geometry as THREE.BufferGeometry | undefined;
  const pos = geom?.attributes?.position as THREE.BufferAttribute | undefined;
  if (!face || !pos) return null;
  let best: THREE.Vector3 | null = null;
  let bestDist = Infinity;
  for (const idx of [face.a, face.b, face.c]) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, idx).applyMatrix4(mesh.matrixWorld);
    const d = v.distanceToSquared(hit.point);
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return best;
}
