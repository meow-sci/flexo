/**
 * Tool state: the single active tool slot (flexo's modeStore pattern, one mode
 * for now), ground lock and gizmo snap (plans/ICRP_PLAN.md P4.01/P4.02 seed).
 * View/tool state — never undo-enrolled.
 */
import { atom } from 'nanostores';
import { persistentJSON } from '@nanostores/persistent';

export type Tool = 'select' | 'translate' | 'rotate' | 'scale';

export const $tool = atom<Tool>('translate');

export function setTool(tool: Tool): void {
  $tool.set(tool);
}

/**
 * Ground lock (default ON): the ROTATE gizmo constrained to about-up (the
 * ground-plane spin). Translate always shows all three arrows — the vertical
 * arrow IS the elevation control (P4.01), so it is never hidden. `G` toggles.
 */
export const $groundLock = persistentJSON<boolean>('icrp:groundLock', true);

export interface SnapState {
  enabled: boolean;
  translateM: number;
  rotateDeg: number;
}

export const $snap = persistentJSON<SnapState>('icrp:snap', {
  enabled: true,
  translateM: 0.5,
  rotateDeg: 15,
});

export function toggleSnap(): void {
  $snap.set({ ...$snap.get(), enabled: !$snap.get().enabled });
}

/**
 * Magnetic part snapping (default ON — the lego feel): while body-dragging,
 * imported-part connectors dock to opposing connectors (full 3D, so a tank
 * dragged over another CLIMBS onto its top node), and otherwise bounding boxes
 * snap flush / center-aligned on the ground axes. `M` toggles; the magnet
 * OVERRIDES the grid increment when it engages.
 */
export const $magnet = persistentJSON<boolean>('icrp:magnet', true);

/** Site overlays (footprint disc, clutter/collider rings, spawn plane) visible? */
export const $overlaysVisible = persistentJSON<boolean>('icrp:overlays', true);

/**
 * Re-ground after scaling (default ON): when a scale gesture ends, any scaled
 * piece whose bottom sat ON the ground beforehand is re-dropped so scaling
 * never buries or floats it (below-grade pieces like terrain skirts are left
 * alone).
 */
export const $keepGrounded = persistentJSON<boolean>('icrp:keepGrounded', true);

/** Collider wireframes visible? (template = dimmed amber, editable = full). */
export const $collidersVisible = persistentJSON<boolean>('icrp:colliders', true);

/**
 * The KSA install directory — cloned-body texture paths are rewritten ABSOLUTE
 * into `<install>/Content/Core/` (user-verified: a Documents/mods install
 * cannot reach Core textures relatively, and Id-only references fail).
 */
export const $installPath = persistentJSON<string>(
  'icrp:installPath',
  'C:/Program Files/Kitten Space Agency',
);

/** 'absolute' (Documents/mods installs) or 'core-relative' (Content/<mod> installs). */
export const $texturePathMode = persistentJSON<'absolute' | 'core-relative'>(
  'icrp:texturePathMode',
  'absolute',
);
