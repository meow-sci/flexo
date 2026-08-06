import { atom, computed } from 'nanostores';
import { $part, $selection } from './editorStore';
import { $mode, registerModeHooks } from './modeStore';
import { closeDialog, isDialogOpen } from './dialogStore';
import { meshKind, type CustomMesh, type FaceTextureConfig } from '../ksa/types';
// The face-key table is plain data that happens to live beside the geometry builders. This
// is the SAME carve-out `customAssetStore` already takes (docs/architecture.md: three
// imports are allowed in the custom-asset modules) — nothing here touches a three object.
import { PRIMITIVE_FACE_KEYS } from '../three/primitives';

/**
 * **Surface mode's sub-state** (design: `plans/flexo_v2/design/design-surface-assets.md`
 * §1.1/§1.4/§1.5; foundation §2.4 mode entry/exit, §8.5 the LOCKED right sidebar).
 *
 * Two ephemeral designer atoms — the picked custom mesh and the picked face key — plus the
 * derived viewport affordance the three-layer scene consumes and the live UV draft the left
 * Face card streams while typing.
 *
 * **Why its own module, not `modeStore`** (DEVIATION from the plan's file list, logged):
 * `modeStore` deliberately imports no feature store, because the sub-state it would host
 * needs `$part` (clamping) and `$part`'s store is imported BY the tool/mode stores that
 * import `modeStore`. Surface therefore follows the precedent P6/P7 set — `dataModeStore` /
 * `engineStore` own their sub-state and register their choreography through
 * {@link registerModeHooks} from an `init*()` called at boot. The semantics are identical.
 *
 * **Layering (constitution)**: zero react imports.
 *
 * **Undo enrollment: NONE. Persistence: NONE.** Everything here is view state (design §1.8
 * last row: "`$surfaceMeshId` / `$surfaceFace` / picker search / `$simulateGlass` → never
 * undo"). `$surfaceMeshId` deliberately SURVIVES a mode switch so re-entering Surface
 * returns you to the mesh you were dressing (foundation §2.4).
 */

/** The picked {@link CustomMesh.id}; `null` = the picker's empty state. */
export const $surfaceMeshId = atom<string | null>(null);

/**
 * The picked face key of {@link $surfaceMeshId} (`'right'|'left'|'top'|'bottom'|'front'|
 * 'back'|'side'|'all'`), or `null` for "no face" — which is the ONLY value a non-primitive
 * mesh can hold (imported/kitten meshes have no per-face grid).
 */
export const $surfaceFace = atom<string | null>(null);

/** The ordered face keys a mesh offers — empty for imported/kitten meshes. */
export function faceKeysFor(mesh: CustomMesh | undefined): readonly string[] {
  if (!mesh || meshKind(mesh) !== 'primitive' || !mesh.primitive) return [];
  return PRIMITIVE_FACE_KEYS[mesh.primitive.kind];
}

function meshById(id: string | null): CustomMesh | undefined {
  return id ? $part.get().customMeshes.find((m) => m.id === id) : undefined;
}

/**
 * The viewport's face-highlight instruction (design §1.5, D12 — **template-scoped**: the
 * face tints on EVERY placement of the picked mesh). Null outside Surface mode, which is
 * what makes "leaving Surface clears the highlight" a property of the derivation rather
 * than an exit effect somebody has to remember to write (foundation §2.4).
 *
 * `faceKey: null` ⇒ whole-mesh tint (imported/kitten, or a primitive with no face picked).
 */
export const $faceHighlight = computed(
  [$mode, $surfaceMeshId, $surfaceFace, $part],
  (mode, meshId, faceKey, part): { meshId: string; faceKey: string | null } | null => {
    if (mode !== 'surface' || !meshId) return null;
    if (!part.customMeshes.some((m) => m.id === meshId)) return null;
    return { meshId, faceKey };
  },
);

/**
 * Picks a mesh and re-seeds the face to that mesh's FIRST key (non-primitives → null).
 * Picking is never an undo step and never touches the selection — a mesh pick and an
 * entity selection are two different things (design §1.5 "empty-click clears selection but
 * keeps `$surfaceMeshId`").
 */
export function pickSurfaceMesh(id: string | null): void {
  $surfaceMeshId.set(id);
  const keys = faceKeysFor(meshById(id));
  $surfaceFace.set(keys[0] ?? null);
  $faceDraft.set(null);
}

/** Picks (or clears, with `null`) the face key. Ignores a key the picked mesh doesn't have. */
export function pickSurfaceFace(key: string | null): void {
  if (key !== null && !faceKeysFor(meshById($surfaceMeshId.get())).includes(key)) return;
  $surfaceFace.set(key);
  $faceDraft.set(null);
}

/**
 * A "scroll the picker to this mesh and flash its row" intent (design §1.5 — the status
 * bar's surface chip and the left empty state's `[Pick a mesh →]` both fire it). The nonce
 * is what lets the SAME mesh be revealed twice in a row.
 */
export const $surfaceRevealRequest = atom<{ meshId: string | null; nonce: number } | null>(null);

/** Reveals `meshId` in the picker; `null` just focuses the picker's search field. */
export function revealSurfaceMesh(meshId: string | null): void {
  $surfaceRevealRequest.set({ meshId, nonce: ($surfaceRevealRequest.get()?.nonce ?? 0) + 1 });
}

/**
 * The left Face card's LIVE draft (design §1.4 "Preview vs commit", binding): as the user
 * types a UV number the draft streams here and `EditorScene` re-bakes the picked mesh's UVs
 * view-only; the DOCUMENT commit happens on field commit (Enter/blur) as one discrete undo
 * step. Cleared on commit, on Escape, and whenever the pick changes.
 */
export const $faceDraft = atom<{ meshId: string; faceKey: string; cfg: FaceTextureConfig } | null>(
  null,
);

export function setFaceDraft(
  draft: { meshId: string; faceKey: string; cfg: FaceTextureConfig } | null,
): void {
  $faceDraft.set(draft);
}

// ── the glow-paint close interceptor (design §1.6; foundation §14.3) ─────────

/**
 * The open GlowPaintDialog's own cancel path, registered by the dialog while it is mounted.
 * Leaving Surface mode must close the painter "via its normal cancel semantics"
 * (foundation §2.4) — i.e. through the dirty-discard confirm, not a silent `closeDialog()`
 * that would drop unsaved strokes. A plain function slot, not an atom: it is a callback
 * registry, and nothing renders from it.
 */
let glowPaintCancel: (() => void) | null = null;

export function registerGlowPaintCancel(fn: (() => void) | null): void {
  glowPaintCancel = fn;
}

// ── mode entry / exit (foundation §2.4; design §1.1) ────────────────────────

/** The cross-mode jump payload Surface mode understands (foundation §2.5). */
export interface SurfaceModePayload {
  surfaceMeshId?: string;
  surfaceFace?: string | null;
}

/** The custom mesh of the LAST-selected SubPart placement, or null. */
function selectedCustomMeshId(): string | null {
  const part = $part.get();
  for (const ref of [...$selection.get()].reverse()) {
    if (ref.kind !== 'subpart') continue;
    const templateId = part.placements.find((p) => p.instanceId === ref.id)?.subPartTemplateId;
    if (!templateId) continue;
    const mesh = part.customMeshes.find((m) => m.subPartId === templateId);
    if (mesh) return mesh.id;
  }
  return null;
}

/**
 * Clamps the pick against the live document: a mesh that no longer exists (undo past its
 * creation, remove-import) drops to null, and a face key that its kind no longer offers
 * falls back to the first key (design §1.1 "Clamping").
 */
function clampSurfacePick(): void {
  const meshId = $surfaceMeshId.get();
  if (!meshId) return;
  const mesh = meshById(meshId);
  if (!mesh) {
    $surfaceMeshId.set(null);
    $surfaceFace.set(null);
    $faceDraft.set(null);
    return;
  }
  const keys = faceKeysFor(mesh);
  const face = $surfaceFace.get();
  if (face !== null && keys.includes(face)) return;
  $surfaceFace.set(keys[0] ?? null);
}

let initialized = false;

/**
 * Registers Surface mode's entry/exit choreography and the `$part` clamp.
 *
 * **Entry**, first hit wins (foundation §2.4 "cross-mode jump payload always wins"):
 * 1. a jump payload (`Edit Surface →`, the palette's `surface.pickMesh`, an import
 *    notification's "Edit surfaces →");
 * 2. else a selected custom-mesh placement auto-picks its template;
 * 3. else the surviving `$surfaceMeshId` (clamped);
 * 4. else nothing — the picker's empty state.
 *
 * **Exit**: the face highlight goes null through {@link $faceHighlight}'s own derivation,
 * the live UV draft is dropped, and an open GlowPaintDialog closes through its normal
 * cancel semantics (its dirty-discard confirm). The picked mesh survives for the return.
 *
 * Called from boot (`main.tsx`) rather than at module scope so registration order is
 * explicit. Idempotent — StrictMode's double boot is harmless.
 */
export function initSurfaceMode(): void {
  if (initialized) return;
  initialized = true;

  $part.subscribe(() => clampSurfacePick());

  registerModeHooks('surface', {
    onEnter: (payload) => {
      const jump = payload as SurfaceModePayload | undefined;
      if (jump?.surfaceMeshId) {
        pickSurfaceMesh(jump.surfaceMeshId);
        if (jump.surfaceFace !== undefined) pickSurfaceFace(jump.surfaceFace);
        return;
      }
      const fromSelection = selectedCustomMeshId();
      if (fromSelection) {
        pickSurfaceMesh(fromSelection);
        return;
      }
      clampSurfacePick();
    },
    onExit: () => {
      $faceDraft.set(null);
      if (!isDialogOpen('glow-paint')) return;
      if (glowPaintCancel) glowPaintCancel();
      else closeDialog();
    },
  });
}
