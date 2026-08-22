import { SectionTitle, useIsPhone } from '../kit';
import { NumberField } from '../NumberField';
import { TouchNudgeCluster } from './TouchNudgeCluster';
import { DEG2RAD, RAD2DEG } from '../format';
import {
  pushUndo,
  updateSelectedTransform,
  type PlacementTransform,
} from '../../state/editorStore';
import {
  colliderSizeLabels,
  setColliderSizeAxis,
  type ColliderSizeLabel,
} from '../../ksa/colliderSize';
import type { ColliderShape } from '../../ksa/types';

/**
 * The generic Position / Rotation / third numeric groups shared by every non-light focus
 * card (design: design-build-mode.md §3.1). Guts ported verbatim from v1's
 * `TransformInspector` generic groups — same store call (`updateSelectedTransform`, which
 * routes by the primary selection ref), same undo labels, same degree ↔ radian boundary.
 *
 * **Undo enrollment: streaming.** Nothing here pushes per keystroke; each field's
 * `onInteractionStart` pushes ONE step on focus, so a whole typing session collapses into a
 * single undo (editorStore's invariant block, pattern 2).
 *
 * The third group is the only per-kind difference, and it is a genuine semantic split, not
 * styling: a SubPart/kitten `scale` is a multiplier, a connector's `<Scale>` is KSA's attach
 * -node size CLASS, a collider's `scale` IS its outer size in METERS (so only the axes the
 * shape can independently control get a field), and an `<IVASeat>` has no size at all.
 */

type Axis = 'x' | 'y' | 'z';

export type ThirdGroup =
  /** IVA seat — `<IVASeat>` carries no size, and the store pins scale to (1,1,1). */
  | { kind: 'none' }
  /** SubPart / kitten — a plain multiplier. */
  | { kind: 'scale' }
  /** Connector — the attach-node size class (never re-graded by a group scale). */
  | { kind: 'connectorScale' }
  /** Collider — outer size in metres, labelled per shape. */
  | { kind: 'colliderSize'; shape: ColliderShape };

/** Section shell: a title over a three-column numeric grid. Shared with the light card. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <SectionTitle>{title}</SectionTitle>
      <div className="grid grid-cols-3 gap-1">{children}</div>
    </div>
  );
}

export function TransformGroups({
  transform,
  entityName,
  locked,
  third,
}: {
  transform: PlacementTransform;
  /** Undo detail — the entity's display name. */
  entityName: string;
  locked: boolean;
  third: ThirdGroup;
}) {
  const isPhone = useIsPhone();

  const commit = (mutate: (t: PlacementTransform) => void) => {
    const next: PlacementTransform = {
      position: { ...transform.position },
      rotation: { ...transform.rotation },
      scale: { ...transform.scale },
    };
    mutate(next);
    updateSelectedTransform(next);
  };

  const posField = (axis: Axis) => (
    <NumberField
      label={axis.toUpperCase()}
      value={transform.position[axis]}
      isDisabled={locked}
      onInteractionStart={() => pushUndo('move', entityName)}
      onCommit={(n) => commit((t) => (t.position[axis] = n))}
    />
  );
  const rotField = (axis: Axis) => (
    <NumberField
      label={axis.toUpperCase()}
      value={transform.rotation[axis] * RAD2DEG}
      isDisabled={locked}
      onInteractionStart={() => pushUndo('rotate', entityName)}
      onCommit={(deg) => commit((t) => (t.rotation[axis] = deg * DEG2RAD))}
    />
  );
  const scaleField = (axis: Axis, label?: ColliderSizeLabel) => (
    <NumberField
      label={label?.short ?? axis.toUpperCase()}
      ariaLabel={label?.full}
      value={transform.scale[axis]}
      isDisabled={locked}
      onInteractionStart={() => pushUndo('scale', entityName)}
      onCommit={(n) =>
        commit((t) => {
          // A collider's size axes are COUPLED (a cylinder's X and Z are one diameter),
          // and the store's normalize resolves the pair with max(). Writing the raw axis
          // would leave the untouched sibling holding the old value and winning that max,
          // so a shrink snapped straight back — the field looked uneditable. The edited
          // axis has to drive its partners.
          if (third.kind === 'colliderSize') {
            t.scale = setColliderSizeAxis(third.shape, t.scale, axis, n);
          } else {
            t.scale[axis] = n;
          }
        })
      }
    />
  );

  // A collider's size is normalized per shape on write (a cylinder's X and Z are one
  // diameter), so only the independently-editable axes get a field.
  const sizeLabels = third.kind === 'colliderSize' ? colliderSizeLabels(third.shape) : null;

  return (
    <>
      <Section title="Position (m)">
        {posField('x')}
        {posField('y')}
        {posField('z')}
      </Section>
      <Section title="Rotation (°)">
        {rotField('x')}
        {rotField('y')}
        {rotField('z')}
      </Section>
      {sizeLabels && (
        <Section title="Size (m)">
          {sizeLabels[0] && scaleField('x', sizeLabels[0])}
          {sizeLabels[1] && scaleField('y', sizeLabels[1])}
          {sizeLabels[2] && scaleField('z', sizeLabels[2])}
        </Section>
      )}
      {third.kind === 'scale' && (
        <Section title="Scale (×)">
          {scaleField('x')}
          {scaleField('y')}
          {scaleField('z')}
        </Section>
      )}
      {third.kind === 'connectorScale' && (
        <div className="flex flex-col gap-1">
          <Section title="Scale (size class)">
            {scaleField('x')}
            {scaleField('y')}
            {scaleField('z')}
          </Section>
          <p className="text-xs leading-snug text-fg-subtle">
            Attach-node size class — group scale never changes this.
          </p>
        </div>
      )}
      {/* The phone's answer to the arrow-key nudge and the W/S rotate keys, appended to the
          transform card exactly where design-build-mode.md §11 item 2 puts it. Desktop
          keeps the status-bar chips instead. */}
      {isPhone && <TouchNudgeCluster locked={locked} />}
    </>
  );
}
