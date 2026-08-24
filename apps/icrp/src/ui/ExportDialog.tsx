/**
 * Export dialog (plans/ICRP_PLAN.md P8.04, v1): builds the mod plan, shows the
 * preflight findings and per-file previews, downloads a zip. Reminder shown:
 * KSA appends new mods to manifest.toml DISABLED (fact L9).
 */
import { useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Button, Dialog, DialogHeader, Modal, TextField } from '../../../../src/ui/kit';
import { createZip } from '../../../../src/util/zip';
import { buildModPlan } from '../ksa/modPlan';
import { $pieceIndex } from '../state/catalogStore';
import { $project } from '../state/docStore';

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const project = useStore($project);
  const pieceIndex = useStore($pieceIndex);
  const [previewPath, setPreviewPath] = useState<string | null>(null);

  const plan = useMemo(
    () => (isOpen ? buildModPlan(project, pieceIndex) : null),
    [isOpen, project, pieceIndex],
  );

  const errors = plan?.issues.filter((i) => i.severity === 'error') ?? [];
  const warnings = plan?.issues.filter((i) => i.severity === 'warning') ?? [];
  const preview = plan?.files.find((f) => f.path === previewPath);

  const downloadZip = () => {
    if (!plan) return;
    const encoder = new TextEncoder();
    const blob = createZip(
      plan.files.map((f) => ({ name: `${plan.modId}/${f.path}`, data: encoder.encode(f.data) })),
    );
    download(blob, `${plan.modId}.zip`);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable>
      <Dialog className="w-[44rem] max-w-[90vw] p-4">
        <DialogHeader title="Export KSA mod" onClose={onClose} />
        <div className="flex flex-col gap-3 overflow-y-auto">
          <TextField
            label="Mod name"
            value={project.modName}
            onChange={(v) => $project.set({ ...$project.get(), modName: v })}
          />
          {plan && (
            <>
              <div className="text-xs text-fg-muted">
                {project.objects.length} object(s) · {plan.vesselPieceIds.length} vessel-derived
                piece(s) declared · install as{' '}
                <code className="text-fg">
                  &lt;Documents&gt;/My Games/Kitten Space Agency/mods/{plan.modId}/
                </code>{' '}
                — then ENABLE it in Settings → Mods (new mods load disabled).
              </div>
              {errors.length > 0 && (
                <div className="rounded border border-danger/40 bg-danger/10 px-2 py-1 text-xs text-danger">
                  {errors.map((e, i) => (
                    <div key={i}>{e.message}</div>
                  ))}
                </div>
              )}
              {warnings.length > 0 && (
                <div className="rounded border border-warning/40 bg-warning/10 px-2 py-1 text-xs text-warning">
                  {warnings.map((w, i) => (
                    <div key={i}>{w.message}</div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {plan.files.map((f) => (
                  <Button
                    key={f.path}
                    size="sm"
                    variant={previewPath === f.path ? 'primary' : 'ghost'}
                    onPress={() => setPreviewPath(previewPath === f.path ? null : f.path)}
                  >
                    {f.path}
                  </Button>
                ))}
              </div>
              {preview && (
                <pre className="max-h-72 overflow-auto rounded bg-panel-sunken p-2 text-[11px] leading-4 text-fg-muted">
                  {preview.data}
                </pre>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onPress={onClose}>
                  Cancel
                </Button>
                <Button onPress={downloadZip} isDisabled={errors.length > 0}>
                  Download {plan.modId}.zip
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </Modal>
  );
}
