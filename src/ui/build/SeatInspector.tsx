import { useStore } from '@nanostores/react';
import { Cat, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { Button, Chip, SectionTitle } from '../kit';
import { TransformGroups } from './TransformGroups';
import { $part, addKittenAtSeat, aimIvaSeat, moveIvaSeat } from '../../state/editorStore';
import { $catalogIndex } from '../../state/catalogStore';
import { requestIvaSeatAim } from '../../state/ivaSeatStore';
import { enterSeatView } from '../../state/ivaStore';
import { $hideInterior, setHideInterior } from '../../state/viewStore';
import { SEAT_LOCAL_UP, seatAxesFromRotation, seatRotationFromAxes } from '../../ksa/ivaSeatAxes';
import { formatG6 } from '../../ksa/formatG6';
import { resolveInternal } from '../../ksa/modExport';
import type { IvaSeat, Vec3 } from '../../ksa/types';

/**
 * The IVA seat focus card (design: design-build-mode.md §3.5) — v1's `IvaSeatHeader`
 * verbatim, plus the §3.5.6 discoverability fix (the "no interior geometry" warning now
 * carries an inline Hide-Interior toggle instead of naming a menu the user has to find).
 *
 * The `<IVASeat>` element carries a position and a `<ForwardAxis>`/`<UpAxis>` PAIR, but
 * flexo edits seats with the same rotation gizmo as everything else, so the two vectors are
 * shown read-only: they are what actually ships, derived through `seatAxesFromRotation` and
 * printed with the exporter's own G6 formatter.
 *
 * Seat ORDER is authored data, not an implementation detail — the game cycles seats in
 * document order with `C` and opens IVA on the first one — hence the reorder buttons and the
 * badge on index 0.
 *
 * **Undo enrollment**: `moveIvaSeat` / `aimIvaSeat` / `addKittenAtSeat` are discrete and push
 * their own step; the numeric groups are streaming; `enterSeatView` and the Hide-Interior
 * toggle are view state and push nothing.
 */

/**
 * The six axis-aligned aim presets. `+X` is called out as the nose because that is KSA's own
 * `<ForwardAxis>` default and the direction Core's capsule seats look.
 */
const AIM_PRESETS: readonly { id: string; label: string; forward: Vec3 }[] = [
  { id: '+x', label: '+X (nose)', forward: { x: 1, y: 0, z: 0 } },
  { id: '-x', label: '−X (tail)', forward: { x: -1, y: 0, z: 0 } },
  { id: '+y', label: '+Y', forward: { x: 0, y: 1, z: 0 } },
  { id: '-y', label: '−Y', forward: { x: 0, y: -1, z: 0 } },
  { id: '+z', label: '+Z', forward: { x: 0, y: 0, z: 1 } },
  { id: '-z', label: '−Z', forward: { x: 0, y: 0, z: -1 } },
];

/** `x, y, z` through the SAME G6 formatter the exporter writes the seat axes with. */
const fmtVec = (v: Vec3) => `${formatG6(v.x)}, ${formatG6(v.y)}, ${formatG6(v.z)}`;

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

/** Cosine beyond which two unit axes count as parallel (KSA would NaN the camera). */
const PARALLEL_DOT = 0.999;

export function SeatInspector({
  index,
  seat,
  locked,
}: {
  index: number;
  seat: IvaSeat;
  locked: boolean;
}) {
  const part = useStore($part);
  const catalogIndex = useStore($catalogIndex);
  const hideInterior = useStore($hideInterior);
  const total = part.ivaSeats.length;
  const { forward, up } = seatAxesFromRotation(seat.rotation);
  // KSA culls back faces unconditionally, so from a seat the surrounding hull is simply not
  // there: without interior-only geometry the seat looks straight out at space.
  const hasInterior = part.placements.some((p) =>
    resolveInternal(part, p.subPartTemplateId, catalogIndex.get(p.subPartTemplateId)),
  );

  /**
   * Re-aims the seat along `nextForward`, KEEPING the current up axis so a re-aim never
   * silently rolls the camera — except where that up would be (near) parallel to the new
   * forward, which `Camera.LookAtRotation` turns into NaN; then fall back to a perpendicular
   * default. A degenerate pair is never written: a null rotation is a no-op.
   */
  const aim = (nextForward: Vec3) => {
    const nextUp =
      Math.abs(dot(nextForward, up)) < PARALLEL_DOT
        ? up
        : Math.abs(dot(nextForward, SEAT_LOCAL_UP)) < PARALLEL_DOT
          ? SEAT_LOCAL_UP
          : { x: 0, y: 1, z: 0 };
    const rotation = seatRotationFromAxes(nextForward, nextUp);
    if (rotation) aimIvaSeat(index, rotation);
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <span className="flex-1 text-xs text-fg-subtle">Order in the IVA cycle</span>
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          className="size-5 shrink-0"
          aria-label="Move seat earlier in the cycle"
          isDisabled={locked || index === 0}
          onPress={() => moveIvaSeat(index, -1)}
        >
          <ChevronUp className="size-3.5" />
        </Button>
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          className="size-5 shrink-0"
          aria-label="Move seat later in the cycle"
          isDisabled={locked || index >= total - 1}
          onPress={() => moveIvaSeat(index, 1)}
        >
          <ChevronDown className="size-3.5" />
        </Button>
      </div>
      {index === 0 && <Chip className="self-start text-accent">IVA opens on this seat</Chip>}

      {/* KSA's <IVASeat> carries no size, so there is no third numeric group at all. */}
      <TransformGroups
        transform={seat}
        entityName={seat.id}
        locked={locked}
        third={{ kind: 'none' }}
      />

      {/* The game's editor has NO IVA preview, so this is the only way to check a seat before
          launching: sit in it and look around under the real clamps. Allowed even on a locked
          layer — it moves the camera, never the document. */}
      <Button size="sm" variant="secondary" onPress={() => enterSeatView(seat.id)}>
        <Eye className="size-4" />
        Sit in This Seat
      </Button>
      {/* Editor-only aide (never exported) — a body at the seat makes eye height and head
          clearance judgeable. Placed with the seat's yaw only; a kitten stands upright.
          Allowed on a locked layer: it adds a kitten, it never touches the seat. */}
      <Button size="sm" variant="secondary" onPress={() => addKittenAtSeat(index)}>
        <Cat className="size-4" />
        Add Kitten at Seat
      </Button>
      <p className="text-xs leading-snug text-fg-subtle">
        Lands at the seat position facing the same way — but a kitten&apos;s origin is{' '}
        <b>not its eye point</b>, so expect to nudge it into place. Kittens are an editor aide and
        are never exported.
      </p>
      <p className="text-xs leading-snug text-fg-subtle">
        Seat order is exported data, not a list order: <b>C</b> cycles seats in this order in game,
        and the first one is where IVA opens.
      </p>

      <div className="flex flex-col gap-1">
        <SectionTitle>Axes (exported)</SectionTitle>
        <span className="font-mono text-xs leading-snug text-fg-subtle">
          Forward ({fmtVec(forward)}) · Up ({fmtVec(up)})
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <SectionTitle>Aim</SectionTitle>
        <div className="flex flex-wrap gap-1">
          {AIM_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              size="sm"
              variant="ghost"
              isDisabled={locked}
              onPress={() => aim(preset.forward)}
            >
              {preset.label}
            </Button>
          ))}
          {/* Aiming at the selection needs its world-space centroid, which only the 3D scene
              has — publish an intent the way a collider fit request does. */}
          <Button
            size="sm"
            variant="ghost"
            isDisabled={locked}
            onPress={() => requestIvaSeatAim(index)}
          >
            Aim at Selection
          </Button>
        </div>
      </div>
      <p className="text-xs leading-snug text-fg-subtle">
        A seat can never look more than 90° away from its forward axis — two directions means two
        seats.
      </p>

      {!hasInterior && (
        <p className="text-xs leading-snug text-warning">
          No <code className="font-mono">&lt;Internal&gt;</code> geometry in this part — a seat here
          looks out at space. Mark interior SubParts with <b>Interior (IVA only)</b> on the SubPart
          card.{' '}
          {/* The census' discoverability nit: naming the View item is not the same as offering
              it. This flips the same view flag the View menu does — never an undo step. */}
          <button
            type="button"
            className="underline underline-offset-2 outline-none focus-visible:ring-1 focus-visible:ring-accent"
            onClick={() => setHideInterior(!hideInterior)}
          >
            {hideInterior ? 'Show interior geometry' : 'Toggle Hide Interior'}
          </button>
        </p>
      )}
    </>
  );
}
