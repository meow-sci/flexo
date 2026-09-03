import { Button, Field, SectionTitle, Switch, TextField } from '../../kit';
import { PreciseNumberInput } from '../../PreciseNumberInput';
import { EditorTagsField } from '../../EditorTagsField';
import { DataSection } from '../DataSection';
import type { SectionMeta } from '../sectionMeta';
import {
  pushUndo,
  setControllable,
  setCrashTolerance,
  setCrashToleranceEnabled,
  setDiameter,
  setDiameterEnabled,
  setDisplayName,
  setEditorTags,
  setExtraDiameters,
  setPartId,
} from '../../../state/editorStore';
import type { EditingPart } from '../../../ksa/types';

/**
 * **Identity** — the Part-scope section that names the part for KSA and the VAB (design:
 * design-data-engine-modes.md §A4.1; census `part-data-gamedata.md` §1.1 Identity table).
 *
 * Field-for-field the v1 dialog's Identity block, plus **Additional size classes** (decision
 * D3): `gameData.extraDiametersM` was modeled and round-tripped but had no widget, so an
 * imported adapter silently carried size classes its editor refused to show.
 *
 * **Undo enrollment** (design §A10): text/number fields are STREAMING — one push at
 * interaction start, so a typing session collapses to a single step. The size-class
 * add/remove buttons are discrete and push their own labelled step before calling the
 * streaming setter.
 */
export function IdentitySection({ part, meta }: { part: EditingPart; meta: SectionMeta }) {
  const g = part.gameData;
  const diameterEnabled = g.diameterM != null;
  const crashToleranceEnabled = g.crashTolerancePa != null;

  return (
    <DataSection sectionId="identity" count={meta.count} issue={meta.issue} defaultExpanded>
      <Field label="Part Id (the export id for the whole mod entry)">
        <TextField
          size="sm"
          aria-label="Part Id"
          inputClassName="font-mono"
          placeholder="part_id"
          value={part.partId}
          onFocus={() => pushUndo('edit part ID', part.partId)}
          onChange={setPartId}
        />
      </Field>

      <Field label="Display Name (in-game name; blank uses the Part Id)">
        <TextField
          size="sm"
          aria-label="Display name"
          value={g.displayName}
          placeholder="(uses Part Id)"
          onFocus={() => pushUndo('edit display name', g.displayName)}
          onChange={setDisplayName}
        />
      </Field>

      <div className="flex flex-col gap-1">
        <SectionTitle>Editor Tags</SectionTitle>
        <EditorTagsField tags={part.editorTags} onChange={setEditorTags} />
      </div>

      <Switch isSelected={diameterEnabled} onChange={setDiameterEnabled}>
        Diameter size class
      </Switch>
      {diameterEnabled && (
        <>
          <Field label="Diameter (m)">
            <PreciseNumberInput
              aria-label="Part diameter in meters"
              value={g.diameterM ?? 0}
              min={0}
              onInteractionStart={() => pushUndo('edit diameter', '')}
              onCommit={setDiameter}
            />
          </Field>
          <span className="text-xs text-fg-subtle">VAB filter only, no physics.</span>
          <ExtraDiameters values={g.extraDiametersM} />
        </>
      )}

      <Switch isSelected={crashToleranceEnabled} onChange={setCrashToleranceEnabled}>
        Crash tolerance override
      </Switch>
      {crashToleranceEnabled && (
        <>
          <Field label="Crash tolerance (Pa)">
            <PreciseNumberInput
              aria-label="Crash tolerance in pascals"
              value={g.crashTolerancePa ?? 0}
              min={0}
              onInteractionStart={() => pushUndo('edit crash tolerance', '')}
              onCommit={setCrashTolerance}
            />
          </Field>
          <span className="text-xs text-fg-subtle">
            Contact pressure that breaks the part. Off ⇒ KSA derives it from mass ÷ volume (0.1–20
            MPa). Core engines author 3e6.
          </span>
        </>
      )}

      <Switch isSelected={g.controllable} onChange={setControllable}>
        Command capable (controllable)
      </Switch>
    </DataSection>
  );
}

/**
 * **Additional size classes** (D3) — the repeated `<Diameter M/>` entries an adapter authors
 * so it appears under every rack size it bridges.
 *
 * Edits stream through `setExtraDiameters` (which pushes nothing); the add/remove buttons
 * push their own discrete step first, the `PowerList` convention.
 */
function ExtraDiameters({ values }: { values: readonly number[] }) {
  const replace = (next: readonly number[]) => setExtraDiameters(next);

  return (
    <div className="flex flex-col gap-1">
      <SectionTitle>Additional size classes</SectionTitle>
      {values.map((value, i) => (
        // Index keys are correct here: the row IS the position in the list, and the value is
        // the whole row (no per-row state to bleed).
        <div key={i} className="flex items-center gap-1">
          <PreciseNumberInput
            className="min-w-0 flex-1"
            aria-label={`Additional size class ${i + 1} in meters`}
            value={value}
            min={0}
            onInteractionStart={() => pushUndo('edit size class', '')}
            onCommit={(n) => replace(values.map((v, j) => (j === i ? n : v)))}
          />
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Remove size class ${i + 1}`}
            onPress={() => {
              pushUndo('remove size class', '');
              replace(values.filter((_, j) => j !== i));
            }}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        className="self-start"
        onPress={() => {
          pushUndo('add size class', '');
          replace([...values, 0]);
        }}
      >
        + Size class
      </Button>
      <span className="text-xs text-fg-subtle">
        Extra &lt;Diameter&gt; entries — adapters match several racks.
      </span>
    </div>
  );
}
