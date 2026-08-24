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
 * Ground lock (default ON): translate constrained to the ground plane (KSA Y/Z),
 * rotate constrained to about-up. `G` toggles.
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

/** Site overlays (footprint disc, clutter/collider rings, spawn plane) visible? */
export const $overlaysVisible = persistentJSON<boolean>('icrp:overlays', true);
