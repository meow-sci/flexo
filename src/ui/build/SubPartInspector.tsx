import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { Button, SectionTitle, Switch, TextField } from '../kit';
import { TransformGroups } from './TransformGroups';
import {
  $part,
  isGlassTemplate,
  pushUndo,
  setPlacementsInternal,
  setSubPartInstanceId,
} from '../../state/editorStore';
import { $catalogIndex } from '../../state/catalogStore';
import { setManagingMeshId } from '../../state/customAssetStore';
import { resolveInternal } from '../../ksa/modExport';
import { openSubPartData } from '../data/subPartDataJump';
import type { SubPartPlacement } from '../../ksa/types';

/**
 * The SubPart focus card (design: design-build-mode.md §3.2). Transform groups plus the
 * three things that are only true of a placement: its **instance id** (the name every
 * animation/coupling reference uses), the per-TEMPLATE **`<Internal>`** flag, and the two
 * cross-mode jumps.
 *
 * The instance-id field and the Interior switch are ported verbatim from v1's
 * `SubPartHeader` and the Outliner row menu respectively — same store calls, same
 * per-template blast-radius wording, same glass gate.
 *
 * **Undo enrollment**: the id field is streaming (one `'edit instance ID'` push on focus);
 * `setPlacementsInternal` is discrete and pushes its own step.
 */
export function SubPartInspector({
  index,
  placement,
  locked,
}: {
  index: number;
  placement: SubPartPlacement;
  locked: boolean;
}) {
  const part = useStore($part);
  const catalogIndex = useStore($catalogIndex);
  const [draft, setDraft] = useState<string | null>(null);

  const templateId = placement.subPartTemplateId;
  const placements = part.placements.filter((p) => p.subPartTemplateId === templateId).length;
  const interior = resolveInternal(part, templateId, catalogIndex.get(templateId));
  const glass = isGlassTemplate(part, templateId);
  const customMesh = part.customMeshes.find((m) => m.subPartId === templateId);

  return (
    <>
      <div className="flex flex-col gap-0.5">
        <SectionTitle>Instance ID</SectionTitle>
        <TextField
          size="sm"
          aria-label="Instance ID"
          value={draft ?? placement.instanceId}
          inputClassName="font-mono"
          isDisabled={locked}
          onFocus={() => {
            setDraft(placement.instanceId);
            pushUndo('edit instance ID', placement.instanceId);
          }}
          onChange={(v) => {
            setDraft(v);
            if (v.trim()) setSubPartInstanceId(index, v.trim());
          }}
          onBlur={() => setDraft(null)}
        />
        <span className="truncate text-xs text-fg-subtle" title={templateId}>
          {templateId}
        </span>
      </div>

      <TransformGroups
        transform={placement}
        entityName={placement.instanceId}
        locked={locked}
        third={{ kind: 'scale' }}
      />

      {/* KSA's <Internal> lives on the template's <PartModel>, so this is never
          per-placement — say so where the user flips it. */}
      <div className="flex flex-col gap-0.5">
        <Switch
          isSelected={interior}
          isDisabled={locked || glass}
          onChange={(on) => setPlacementsInternal([index], on)}
        >
          {glass ? 'Interior (IVA) — n/a for glass' : 'Interior (IVA only)'}
        </Switch>
        <span className="text-xs leading-snug text-fg-subtle">
          {glass
            ? 'KSA glass (<PartModelGlass>) has no <Internal> field, so the flag would be silently ignored.'
            : `Applies to all ${placements} placement${placements === 1 ? '' : 's'} of this template.`}
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        {/* TODO(P6): re-point at the Data-mode jump command (template scope). */}
        <Button size="sm" variant="secondary" onPress={() => openSubPartData(templateId)}>
          SubPart Data →
        </Button>
        {/* TODO(P8): re-point at the Surface-mode jump command (mesh picked). */}
        {customMesh && (
          <Button size="sm" variant="secondary" onPress={() => setManagingMeshId(customMesh.id)}>
            Edit Surface →
          </Button>
        )}
      </div>
    </>
  );
}
