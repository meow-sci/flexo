import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { MenuTrigger } from 'react-aria-components';
import { Anchor, Crosshair, X } from 'lucide-react';
import {
  Button,
  ListBoxItem,
  Menu,
  MenuItem,
  Popover,
  SectionTitle,
  Select,
  TextField,
  Tooltip,
  cn,
} from '../kit';
import { NumberField } from '../NumberField';
import { FocusCardHeader, focusCard } from '../build/FocusCardHeader';
import { $part, pushUndo, revealEntity, select } from '../../state/editorStore';
import { $selectedPlacement, $selectedPlacements } from '../../state/selectors';
import { status, undoStatusAction } from '../../state/statusStore';
import {
  $editKeyframeId,
  $pivotEditing,
  $workingPivot,
  attachToJoint,
  detachFromJoint,
  moveJointPivot,
  openMembersView,
  renameJoint,
  reorientJointPivot,
  setJointParent,
  setJointPivot,
  setJointPivotToCentroid,
  setJointPose,
  setSegmentEasingAllJoints,
} from '../../state/animationStore';
import { jointWorld, restAnchorTime } from '../../ksa/animationRig';
import { transformFromMatrix } from '../../three/coords';
import {
  identityTransform,
  type AnimationJoint,
  type PartAnimation,
  type Vec3,
} from '../../ksa/types';
import { anchorColumnId } from './dopeSheetModel';
import { EasingCurveEditor } from './EasingCurveEditor';
import { jointOptions } from './membershipModel';
import { templateCaption } from '../subPartSetModel';
import { DEG2RAD, RAD2DEG, fmt } from '../format';

/**
 * **The Joint card** — the left focus editor's workhorse and the posing cockpit
 * (design-animation-mode.md §8.3; foundation §7.2 row 3).
 *
 * Three v1 gaps close here:
 * - **Scale numerics** (census pain 13): scale poses existed in the data model and the export
 *   but were only authorable by dragging the gizmo.
 * - **The anchor swap** (census pain 6 / §4.6): when the pinned column IS the rest anchor
 *   there is no meaningful "pose" — the composed pose there equals the modeled placements. So
 *   the card swaps to PIVOT fields routed through `moveJointPivot` / `reorientJointPivot`,
 *   which are geometry-invariant at every t. v1 wrote those same numbers straight into the
 *   pose and silently skewed the whole clip.
 * - **Everything is anchored on `restAnchorTime`**, never on t=0 — the section label says so
 *   out loud, because on an imported deploy clip they are different keyframes.
 *
 * **Undo enrollment:** pose / pivot numerics are STREAMING and push exactly one step at field
 * focus (`onInteractionStart`); attach, detach, parent and the pivot snap actions are discrete
 * store actions; the working pivot is ephemeral and never undoable (§15).
 */
export function AnimJointCard({ anim, joint }: { anim: PartAnimation; joint: AnimationJoint }) {
  const part = useStore($part);
  const pinId = useStore($editKeyframeId);
  const selected = useStore($selectedPlacements);
  const singlePlacement = useStore($selectedPlacement);
  const pivotEditing = useStore($pivotEditing);
  const workingPivot = useStore($workingPivot);
  const [nameDraft, setNameDraft] = useState<string | null>(null);

  const sorted = [...anim.keyframes].sort((a, b) => a.timeSec - b.timeSec);
  const index = sorted.findIndex((k) => k.id === pinId);
  const pinned = index >= 0 ? sorted[index] : null;
  const next = index >= 0 ? sorted[index + 1] : undefined;
  const anchorId = anchorColumnId(anim);
  const anchorT = restAnchorTime(anim);
  const atAnchor = pinned !== null && pinned.id === anchorId;
  const selectedIds = selected.map((s) => s.placement.instanceId);
  const forbidden = descendants(anim, joint.id);

  return (
    <div className={focusCard}>
      <FocusCardHeader
        icon={Crosshair}
        title={`Joint: ${joint.name}`}
        subtitle={`${joint.memberInstanceIds.length} member${joint.memberInstanceIds.length === 1 ? '' : 's'}`}
        menu={
          <Menu
            onAction={(key) => {
              if (key === 'members') openMembersView(joint.id);
              else if (key === 'selectMembers') {
                select(joint.memberInstanceIds.map((id) => ({ kind: 'subpart' as const, id })));
                if (joint.memberInstanceIds[0]) revealEntity('subpart', joint.memberInstanceIds[0]);
              }
            }}
          >
            <MenuItem id="members">Members…</MenuItem>
            <MenuItem id="selectMembers" isDisabled={joint.memberInstanceIds.length === 0}>
              Select members
            </MenuItem>
          </Menu>
        }
      />

      <div className="flex items-end gap-1">
        <TextField
          size="sm"
          label="Name"
          aria-label="Joint name"
          className="min-w-0 flex-1"
          value={nameDraft ?? joint.name}
          onFocus={() => setNameDraft(joint.name)}
          onChange={setNameDraft}
          onBlur={() => {
            if (nameDraft != null && nameDraft.trim()) renameJoint(anim.id, joint.id, nameDraft);
            setNameDraft(null);
          }}
        />
        <Select
          size="sm"
          label="Parent"
          className="min-w-0 flex-1"
          searchable
          searchPlaceholder="Search joints…"
          value={joint.parentJointId ?? 'none'}
          onChange={(k) => setJointParent(anim.id, joint.id, k === 'none' ? null : String(k))}
        >
          <ListBoxItem id="none">Root (Part)</ListBoxItem>
          {jointOptions(anim)
            .filter((o) => o.id !== joint.id)
            .map((o) => (
              <ListBoxItem
                key={o.id}
                id={o.id}
                textValue={`under ${o.name}`}
                isDisabled={forbidden.has(o.id)}
              >
                under {o.name}
              </ListBoxItem>
            ))}
        </Select>
      </div>

      {/* ── MEMBERS ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <SectionTitle>Members ({joint.memberInstanceIds.length})</SectionTitle>
          <Button
            size="xs"
            variant="ghost"
            className="ml-auto"
            onPress={() => openMembersView(joint.id)}
          >
            Choose members…
          </Button>
        </div>
        {joint.memberInstanceIds.length === 0 && (
          <p className="px-1 text-[11px] text-fg-subtle">
            No members — this joint won’t export. Use “Choose members…” or paint in 3D.
          </p>
        )}
        {joint.memberInstanceIds.map((id) => {
          const placement = part.placements.find((p) => p.instanceId === id);
          const layer = part.layers.find((l) => l.id === placement?.layerId);
          return (
            <div key={id} className="flex items-center gap-1 text-xs">
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left hover:underline"
                title={id}
                onClick={() => {
                  select([{ kind: 'subpart', id }]);
                  revealEntity('subpart', id);
                }}
              >
                <span className="font-mono">{id}</span>
                {placement && (
                  <span className="text-fg-subtle">
                    {' '}
                    · {templateCaption(placement.subPartTemplateId)}
                    {layer ? ` · ${layer.name}` : ''}
                  </span>
                )}
              </button>
              <Button
                iconOnly
                size="xs"
                variant="ghost"
                className="size-5 shrink-0"
                aria-label={`Detach ${id}`}
                onPress={() => detachFromJoint(anim.id, joint.id, id)}
              >
                <X className="size-3" />
              </Button>
            </div>
          );
        })}
        {selectedIds.length > 0 && (
          <Button
            size="xs"
            variant="secondary"
            className="self-start"
            onPress={() => {
              const { attached, skipped } = attachToJoint(anim.id, joint.id, selectedIds);
              status(
                skipped > 0
                  ? `Attached ${attached} SubParts — ${skipped} skipped (KSA can't animate them)`
                  : `Attached ${attached} SubPart${attached === 1 ? '' : 's'} → ${joint.name}`,
                { severity: skipped > 0 ? 'warning' : 'success', action: undoStatusAction() },
              );
            }}
          >
            Attach {selectedIds.length} selected
          </Button>
        )}
      </div>

      {/* ── PIVOT ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <SectionTitle>Pivot</SectionTitle>
          <span className="flex items-center gap-0.5 text-[11px] text-fg-subtle">
            (rest frame <Anchor className="size-3" aria-hidden /> @{fmt(anchorT)}s)
          </span>
          <Tooltip content="Arm the pivot tool — the gizmo relocates the hinge instead of posing it (3D handles land with the pose tooling).">
            <Button
              size="xs"
              variant={pivotEditing ? 'primary' : 'ghost'}
              className="ml-auto"
              onPress={() => $pivotEditing.set(!pivotEditing)}
            >
              ⊕ Edit pivot
            </Button>
          </Tooltip>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-fg-subtle">Set to:</span>
          <Button
            size="xs"
            variant="secondary"
            isDisabled={!singlePlacement}
            onPress={() =>
              singlePlacement &&
              setJointPivot(anim.id, joint.id, singlePlacement, { orientation: true })
            }
          >
            selection
          </Button>
          <Button
            size="xs"
            variant="secondary"
            isDisabled={!singlePlacement}
            onPress={() =>
              singlePlacement &&
              setJointPivot(anim.id, joint.id, singlePlacement, { orientation: false })
            }
          >
            pos only
          </Button>
          <Button
            size="xs"
            variant="secondary"
            isDisabled={selected.length === 0}
            onPress={() => setJointPivotToCentroid(joint.id)}
          >
            centroid
          </Button>
          <Tooltip content="Clicking a surface to place the pivot arrives with the pose tooling">
            <Button size="xs" variant="ghost" isDisabled>
              pick in 3D…
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* ── POSE @t — or PIVOT @rest when the pinned column IS the anchor ─────── */}
      {pinned &&
        (atAnchor ? (
          <PivotNumerics anim={anim} joint={joint} anchorT={anchorT} />
        ) : (
          <PoseNumerics anim={anim} joint={joint} keyframeId={pinned.id} timeSec={pinned.timeSec} />
        ))}

      {/* ── WORKING PIVOT ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <SectionTitle>Working pivot</SectionTitle>
          <span className="ml-auto text-[11px] text-fg-subtle">
            {workingPivot === null
              ? 'none'
              : workingPivot.kind === 'subpart'
                ? workingPivot.sourceInstanceId
                : workingPivot.kind === 'centroid'
                  ? 'centroid'
                  : `point (${fmt(workingPivot.position.x)}, ${fmt(workingPivot.position.y)}, ${fmt(workingPivot.position.z)})`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="xs"
            variant="secondary"
            isDisabled={selected.length === 0}
            onPress={() => $workingPivot.set({ kind: 'centroid', position: centroidOf(selected) })}
          >
            Selection centroid
          </Button>
          <MenuTrigger>
            <Button size="xs" variant="secondary" isDisabled={joint.memberInstanceIds.length === 0}>
              Picked subpart
            </Button>
            <Popover className="w-56">
              <Menu
                onAction={(key) => {
                  const placement = part.placements.find((p) => p.instanceId === String(key));
                  if (placement)
                    $workingPivot.set({
                      kind: 'subpart',
                      position: { ...placement.position },
                      sourceInstanceId: placement.instanceId,
                    });
                }}
              >
                {joint.memberInstanceIds.map((id) => (
                  <MenuItem key={id} id={id}>
                    {id}
                  </MenuItem>
                ))}
              </Menu>
            </Popover>
          </MenuTrigger>
          <Tooltip content="Clicking a point in 3D arrives with the pose tooling">
            <Button size="xs" variant="ghost" isDisabled>
              Pick point…
            </Button>
          </Tooltip>
          <Button
            size="xs"
            variant="ghost"
            isDisabled={workingPivot === null}
            onPress={() => $workingPivot.set(null)}
          >
            Clear
          </Button>
        </div>
      </div>

      {/* ── EASING → next ───────────────────────────────────────────────────── */}
      {pinned && next && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <SectionTitle>Easing → next @{fmt(next.timeSec)}s</SectionTitle>
            <Button
              size="xs"
              variant="ghost"
              className="ml-auto"
              onPress={() =>
                setSegmentEasingAllJoints(anim.id, pinned.id, pinned.easings?.[joint.id] ?? {})
              }
            >
              Apply to all joints
            </Button>
          </div>
          <EasingCurveEditor
            animId={anim.id}
            keyframeId={pinned.id}
            jointId={joint.id}
            jointName={joint.name}
            segment={pinned.easings?.[joint.id]}
            nextTimeSec={next.timeSec}
          />
        </div>
      )}
    </div>
  );
}

/** POSE @t — position / rotation / **scale**, streaming with one undo per typing session. */
function PoseNumerics({
  anim,
  joint,
  keyframeId,
  timeSec,
}: {
  anim: PartAnimation;
  joint: AnimationJoint;
  keyframeId: string;
  timeSec: number;
}) {
  const kf = anim.keyframes.find((k) => k.id === keyframeId);
  const pose = kf?.poses[joint.id] ?? identityTransform();
  const axes = ['x', 'y', 'z'] as const;
  const start = () => pushUndo('pose', `${joint.name} @ ${fmt(timeSec)}s`);
  const commit = (mut: (t: ReturnType<typeof identityTransform>) => void) => {
    const nextPose = {
      position: { ...pose.position },
      rotation: { ...pose.rotation },
      scale: { ...pose.scale },
    };
    mut(nextPose);
    setJointPose(anim.id, keyframeId, joint.id, nextPose);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <SectionTitle>Pose @ {fmt(timeSec)}s</SectionTitle>
        <span className="ml-auto text-[11px] text-accent">● pinned</span>
      </div>
      <AxisRow label="Position (m)">
        {axes.map((a) => (
          <NumberField
            key={a}
            label={a.toUpperCase()}
            value={pose.position[a]}
            onInteractionStart={start}
            onCommit={(n) => commit((t) => (t.position[a] = n))}
          />
        ))}
      </AxisRow>
      <AxisRow label="Rotation (°)">
        {axes.map((a) => (
          <NumberField
            key={a}
            label={a.toUpperCase()}
            value={pose.rotation[a] * RAD2DEG}
            onInteractionStart={start}
            onCommit={(deg) => commit((t) => (t.rotation[a] = deg * DEG2RAD))}
          />
        ))}
      </AxisRow>
      <AxisRow label="Scale (×)">
        {axes.map((a) => (
          <NumberField
            key={a}
            label={a.toUpperCase()}
            value={pose.scale[a]}
            onInteractionStart={start}
            onCommit={(n) => commit((t) => (t.scale[a] = n))}
          />
        ))}
      </AxisRow>
    </div>
  );
}

/**
 * PIVOT @rest — the anchor-column swap (§8.3). The fields show the joint's rest WORLD frame
 * and write through the compensated ops, so editing them relocates the hinge and leaves the
 * rendered geometry identical at every t. Scale is deliberately absent: a pivot stays
 * unit-scaled (kept invariant).
 */
function PivotNumerics({
  anim,
  joint,
  anchorT,
}: {
  anim: PartAnimation;
  joint: AnimationJoint;
  anchorT: number;
}) {
  const world = transformFromMatrix(jointWorld(anim, joint.id, anchorT));
  const axes = ['x', 'y', 'z'] as const;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <SectionTitle>Pivot @ rest</SectionTitle>
        <span className="ml-auto flex items-center gap-0.5 text-[11px] text-accent">
          <Anchor className="size-3" aria-hidden /> pinned
        </span>
      </div>
      <p className="rounded-md bg-panel px-1.5 py-1 text-[11px] text-fg-subtle">
        Rest anchor — the pose here equals the modeled placements; these fields move the pivot.
      </p>
      <AxisRow label="Pivot position (m)">
        {axes.map((a) => (
          <NumberField
            key={a}
            label={a.toUpperCase()}
            value={world.position[a]}
            onInteractionStart={() => pushUndo('move pivot', joint.name)}
            onCommit={(n) => {
              const delta: Vec3 = { x: 0, y: 0, z: 0 };
              delta[a] = n - world.position[a];
              moveJointPivot(anim.id, joint.id, delta);
            }}
          />
        ))}
      </AxisRow>
      <AxisRow label="Pivot orientation (°)">
        {axes.map((a) => (
          <NumberField
            key={a}
            label={a.toUpperCase()}
            value={world.rotation[a] * RAD2DEG}
            onInteractionStart={() => pushUndo('reorient pivot', joint.name)}
            onCommit={(deg) => {
              const rotation = { ...world.rotation };
              rotation[a] = deg * DEG2RAD;
              reorientJointPivot(anim.id, joint.id, {
                position: { ...world.position },
                rotation,
                scale: { x: 1, y: 1, z: 1 },
              });
            }}
          />
        ))}
      </AxisRow>
    </div>
  );
}

/** A labelled XYZ triple — the shared shape of every numeric group on this card. */
function AxisRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-fg-subtle">{label}</span>
      <div className={cn('grid grid-cols-3 gap-1')}>{children}</div>
    </div>
  );
}

/** The dragged joint's own subtree — the cycle guard for the Parent select's options. */
function descendants(anim: PartAnimation, jointId: string): Set<string> {
  const out = new Set<string>([jointId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const j of anim.joints) {
      if (!out.has(j.id) && j.parentJointId && out.has(j.parentJointId)) {
        out.add(j.id);
        grew = true;
      }
    }
  }
  return out;
}

/** Centroid of the selected placements' positions, in Part space. */
function centroidOf(selected: readonly { placement: { position: Vec3 } }[]): Vec3 {
  const c = { x: 0, y: 0, z: 0 };
  for (const s of selected) {
    c.x += s.placement.position.x;
    c.y += s.placement.position.y;
    c.z += s.placement.position.z;
  }
  const n = Math.max(1, selected.length);
  return { x: c.x / n, y: c.y / n, z: c.z / n };
}
