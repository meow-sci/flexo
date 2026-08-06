import { useStore } from '@nanostores/react';
import { Field, TextField } from '../kit';
import { PreciseNumberInput } from '../PreciseNumberInput';
import { Vec3Field } from '../Vec3Field';
import { ownerOf } from './editorKit';
import { VecLabel } from './FlashField';
import { $part, pushUndo } from '../../state/editorStore';
import {
  updatePartSolidGrainSegment,
  updateSubPartSolidGrainSegment,
} from '../../state/editorStore';
import type { SolidGrainSegment } from '../../ksa/types';

/**
 * **The grain segment editor** (design: design-data-engine-modes.md §B4.5) — one
 * `<SolidGrainSegment>`, at either scope.
 *
 * A grain segment is the solid analogue of a tank: a stackable block of propellant that is
 * ALSO an addressable feed container, which is why its id is a first-class field — a motor
 * reaches it through `Feeds from → Container`. Segments stack in the vehicle editor across
 * connectors that declare the `SolidMotorCase` capability.
 *
 * **Undo enrollment**: all fields stream (one push per typing session).
 */
export function GrainSegmentEditor({
  templateId,
  index,
}: {
  templateId: string | null;
  index: number;
}) {
  const part = useStore($part);
  const segment = ownerOf(part, templateId)?.solidGrainSegments[index];
  if (!segment) return null;

  const begin = () => pushUndo('edit grain segment', segment.id);
  const update = (patch: Partial<SolidGrainSegment>) =>
    templateId === null
      ? updatePartSolidGrainSegment(index, patch)
      : updateSubPartSolidGrainSegment(templateId, index, patch);

  return (
    <div className="flex flex-col gap-2">
      <Field label="Feed id (reference it from a motor's Feeds from → Container)">
        <TextField
          size="sm"
          aria-label="Grain segment feed id"
          inputClassName="font-mono"
          value={segment.id}
          onFocus={begin}
          onChange={(id) => update({ id })}
        />
      </Field>
      <Field label="Casing material id">
        <TextField
          size="sm"
          aria-label="Grain casing material id"
          inputClassName="font-mono"
          value={segment.wallMaterialId}
          onFocus={begin}
          onChange={(wallMaterialId) => update({ wallMaterialId })}
        />
      </Field>
      <Field label="Outer radius (m)">
        <PreciseNumberInput
          aria-label="Grain outer radius in meters"
          value={segment.outerRadiusM}
          min={0}
          step={0.1}
          onInteractionStart={begin}
          onCommit={(n) => update({ outerRadiusM: n })}
        />
      </Field>
      <Field label="Wall thickness (mm)">
        <PreciseNumberInput
          aria-label="Grain wall thickness in millimeters"
          value={segment.wallThicknessMm}
          min={0}
          onInteractionStart={begin}
          onCommit={(n) => update({ wallThicknessMm: n })}
        />
      </Field>
      <Field label="Length (m)">
        <PreciseNumberInput
          aria-label="Grain length in meters"
          value={segment.lengthM}
          min={0}
          step={0.1}
          onInteractionStart={begin}
          onCommit={(n) => update({ lengthM: n })}
        />
      </Field>
      <div className="flex flex-col gap-1">
        <VecLabel>Location offset (m, assembly frame)</VecLabel>
        <Vec3Field
          value={segment.locationAsmb}
          onInteractionStart={begin}
          onCommit={(axis, v) => update({ locationAsmb: { ...segment.locationAsmb, [axis]: v } })}
        />
      </div>
    </div>
  );
}
