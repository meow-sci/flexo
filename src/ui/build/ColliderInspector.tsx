import { useStore } from '@nanostores/react';
import { ListBoxItem } from 'react-aria-components';
import { Button, Select } from '../kit';
import { TransformGroups } from './TransformGroups';
import { CoveragePanel } from './CoveragePanel';
import { $part, setColliderOwner, setColliderShape } from '../../state/editorStore';
import { requestColliderFit } from '../../state/colliderStore';
import { colliderLocalFromWorld, colliderWorld } from '../../three/coords';
import { COLLIDER_SHAPES, type ColliderShape, type PartCollider } from '../../ksa/types';

/** Select key standing in for `ownerTemplateId: null` (a Select can't carry null). */
export const PART_OWNER_KEY = '\u0000part';

/**
 * The collider focus card (design: design-build-mode.md §3.4) — v1's `ColliderHeader` +
 * `CoveragePanel`, guts unchanged.
 *
 * **Owner** is the load-bearing control. `Part (assembly)` emits the shape under
 * `<PartGameData>` in the Part's own frame; picking a SubPart template emits it under that
 * template's `<SubPartGameData>`, where it applies to EVERY placement of that template and
 * follows joint animation. KSA has no per-instance collider, so the wording says so
 * explicitly rather than letting the user assume it attaches to the one they clicked.
 *
 * **Undo enrollment**: shape/owner writes are discrete (they push inside the store); the
 * numeric groups are streaming; a fit result is one scene-side step.
 */
export function ColliderInspector({
  index,
  collider,
  locked,
}: {
  index: number;
  collider: PartCollider;
  locked: boolean;
}) {
  const part = useStore($part);
  // Every DISTINCT template actually placed in the part is a candidate owner.
  const templates = [...new Set(part.placements.map((p) => p.subPartTemplateId))].sort();
  const owner = collider.ownerTemplateId;
  const instances = owner ? part.placements.filter((p) => p.subPartTemplateId === owner).length : 0;

  /**
   * Re-homes the collider, CONVERTING its transform through the old and new owners'
   * placements so it stays where the user last saw it. Without this, switching owner would
   * reinterpret the same numbers in a different frame and the shape would jump. Falls back
   * to a plain re-home when a frame is unavailable (an unplaced template).
   */
  const changeOwner = (next: string | null) => {
    const from = owner ? part.placements.find((p) => p.subPartTemplateId === owner) : null;
    const to = next ? part.placements.find((p) => p.subPartTemplateId === next) : null;
    const world = from ? colliderWorld(collider, from) : collider;
    setColliderOwner(index, next, to ? colliderLocalFromWorld(world, to) : world);
  };

  // KSA composes only position + rotation, so a non-unit placement scale silently halves
  // (or doubles) the collider relative to what you see — warn rather than compensate.
  const scaledOwner =
    owner != null &&
    part.placements.some(
      (p) =>
        p.subPartTemplateId === owner && (p.scale.x !== 1 || p.scale.y !== 1 || p.scale.z !== 1),
    );

  return (
    <>
      <div className="grid grid-cols-2 gap-1">
        <Select
          size="sm"
          aria-label="Collider shape"
          value={collider.shape}
          isDisabled={locked}
          onChange={(key) => setColliderShape(index, key as ColliderShape)}
        >
          {COLLIDER_SHAPES.map((shape) => (
            <ListBoxItem key={shape} id={shape}>
              {shape}
            </ListBoxItem>
          ))}
        </Select>
        <Select
          size="sm"
          aria-label="Collider owner"
          value={owner ?? PART_OWNER_KEY}
          isDisabled={locked}
          onChange={(key) => changeOwner(key === PART_OWNER_KEY ? null : String(key))}
        >
          <ListBoxItem id={PART_OWNER_KEY}>Part (assembly)</ListBoxItem>
          <>
            {templates.map((t) => (
              <ListBoxItem key={t} id={t}>
                {t.split('_').pop() || t}
              </ListBoxItem>
            ))}
          </>
        </Select>
      </div>
      {owner != null && (
        <span className="text-xs leading-snug text-fg-subtle">
          {instances === 0
            ? 'Owner template is not placed — this collider is dead data.'
            : `Applies to all ${instances} placement${instances === 1 ? '' : 's'} of this template; follows joint animation.`}
        </span>
      )}
      {scaledOwner && (
        <span className="text-xs leading-snug text-warn">
          KSA ignores placement scale for colliders — this owner has a non-unit scale, so the
          in-game size will not match the mesh.
        </span>
      )}

      <TransformGroups
        transform={collider}
        entityName={collider.id}
        locked={locked}
        third={{ kind: 'colliderSize', shape: collider.shape }}
      />

      <div className="flex flex-col gap-0.5">
        <Button
          size="sm"
          variant="secondary"
          isDisabled={locked}
          onPress={() => requestColliderFit(collider.shape, { kind: 'existing', index })}
        >
          Fit to Selection
        </Button>
        {/* The margin / orient-to-selection knobs get their UI in Settings → Viewport
            (foundation §10.7, built by P9.17b) — never duplicated here. */}
        <span className="text-xs leading-snug text-fg-subtle">
          Fit options in Settings → Viewport.
        </span>
      </div>

      <CoveragePanel />
    </>
  );
}
