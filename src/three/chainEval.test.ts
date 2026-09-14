import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createEmptyPart, DEFAULT_LAYER_ID, type PartCollider } from '../ksa/types';
import { $chainSession, closeChain, openChain } from '../state/chainStore';
import { $canUndo, $part, $selection, newPart, select, undo } from '../state/editorStore';
import { $layerView, setLayerLocked, toggleLayerVisible } from '../state/layerStore';
import { beginActionChain, chainSelectionError } from '../ui/chain/openChainPalette';
import { applyChainSession } from '../ui/chain/applyChainSession';
import { $chainEval } from './chainEval';
import { ChainPreviewLayer } from './ChainPreviewLayer';
import type { Viewport } from './Viewport';

const cylinder = (id: string, ownerTemplateId: string | null = null): PartCollider => ({
  id,
  ownerTemplateId,
  shape: 'Cylinder',
  position: { x: 10, y: 2, z: 3 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 4, y: 0.5, z: 4 },
  layerId: DEFAULT_LAYER_ID,
});

beforeEach(() => {
  closeChain();
  newPart();
  $layerView.set({});
});

function openRing(seed: PartCollider): void {
  $part.set({ ...$part.get(), colliders: [seed] });
  openChain([seed.id], 'collider');
  $chainSession.set({
    ...$chainSession.get()!,
    ops: [{ id: 'ring', kind: 'circular-array', count: 16, axis: 'y', openingDiameter: 2 }],
  });
}

describe('collider action-chain integration', () => {
  it('opens selected colliders in selection order and refuses mixed kinds or owners', () => {
    const part = createEmptyPart();
    part.colliders = [cylinder('a'), cylinder('b'), cylinder('owned', 'Wheel')];
    part.placements = [{ instanceId: 'wheel', subPartTemplateId: 'Wheel', ...cylinder('unused') }];
    $part.set(part);
    select([
      { kind: 'collider', id: 'b' },
      { kind: 'collider', id: 'a' },
    ]);
    expect(chainSelectionError()).toBeNull();
    beginActionChain();
    expect($chainSession.get()).toMatchObject({ seedKind: 'collider', seedIds: ['b', 'a'] });
    select([
      { kind: 'collider', id: 'a' },
      { kind: 'subpart', id: 'wheel' },
    ]);
    expect(chainSelectionError()).toBe('Select only SubParts or only colliders to chain');
    select([
      { kind: 'collider', id: 'a' },
      { kind: 'collider', id: 'owned' },
    ]);
    expect(chainSelectionError()).toBe('Select colliders with the same owner');
  });

  it('evaluates current collider sizes and commits a ring as one undo step', () => {
    const seed = cylinder('a');
    openRing(seed);
    const state = $chainEval.get()!;
    expect(state.result.error).toBeNull();
    expect(state.result.totalInstances).toBe(16);
    expect(state.result.instances[0].transform.position).toEqual({ x: 13, y: 2, z: 3 });
    expect($canUndo.get()).toBe(false);
    applyChainSession();
    expect($chainSession.get()).toBeNull();
    expect($part.get().colliders).toHaveLength(16);
    expect($selection.get()).toHaveLength(16);
    expect($part.get().colliders[0].position).toEqual({ x: 13, y: 2, z: 3 });
    undo();
    expect($part.get().colliders).toEqual([seed]);
    expect($canUndo.get()).toBe(false);
  });

  it('stops evaluation and Apply when a layer locks during the session', () => {
    openRing(cylinder('a'));
    setLayerLocked(DEFAULT_LAYER_ID, true);
    expect($chainEval.get()!.result.error).toBe('Selection is on a locked layer');
    applyChainSession();
    expect($part.get().colliders).toHaveLength(1);
    expect($canUndo.get()).toBe(false);
    setLayerLocked(DEFAULT_LAYER_ID, false);
    expect($chainEval.get()!.result.error).toBeNull();
  });

  it('reports incompatible owners and missing seeds while open', () => {
    const part = createEmptyPart();
    part.colliders = [cylinder('a'), cylinder('b')];
    $part.set(part);
    openChain(['b', 'a'], 'collider');
    expect($chainEval.get()!.resolvedSeedIds).toEqual(['b', 'a']);
    $part.set({
      ...part,
      colliders: [part.colliders[0], { ...part.colliders[1], ownerTemplateId: 'Wheel' }],
    });
    expect($chainEval.get()!.result.error).toBe('Select colliders with the same owner');
    $part.set({ ...part, colliders: [] });
    expect($chainEval.get()!.result.error).toBe('Seeds no longer exist');
  });

  it('previews every owner placement in its own frame and preserves collider dimensions', () => {
    const seed = cylinder('a', 'Wheel');
    const part = createEmptyPart();
    part.placements = [0, 100].map((x, i) => ({
      instanceId: `wheel${i}`,
      subPartTemplateId: 'Wheel',
      position: { x, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: Math.PI / 2 },
      scale: { x: 5, y: 5, z: 5 },
      layerId: DEFAULT_LAYER_ID,
    }));
    $part.set(part);
    openRing(seed);
    const scene = new THREE.Scene();
    const viewport = { scene, invalidate: vi.fn() } as unknown as Viewport;
    const preview = new ChainPreviewLayer(viewport, () => undefined);
    preview.refresh();
    const ghosts = scene.getObjectByName('chain-preview')!.children;
    expect(ghosts).toHaveLength(32);
    expect(ghosts[0].position.x).toBeCloseTo(-2);
    expect(ghosts[0].position.y).toBeCloseTo(13);
    expect(ghosts[1].position.x).toBeCloseTo(98);
    expect(ghosts[0].scale.toArray()).toEqual([4, 0.5, 4]);
    const intersections: THREE.Intersection[] = [];
    ghosts[0].traverse((node) => node.raycast(new THREE.Raycaster(), intersections));
    expect(intersections).toHaveLength(0);
    toggleLayerVisible(DEFAULT_LAYER_ID);
    preview.refresh();
    expect(ghosts.every((ghost) => !ghost.visible)).toBe(true);
    closeChain();
    preview.refresh();
    expect(ghosts).toHaveLength(0);
    preview.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
