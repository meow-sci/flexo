/**
 * Export dialog (plans/ICRP_PLAN.md P8.04, v1): builds the mod plan, shows the
 * preflight findings and per-file previews, downloads a zip. Reminder shown:
 * KSA appends new mods to manifest.toml DISABLED (fact L9).
 */
import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  Button,
  Dialog,
  DialogHeader,
  Modal,
  TextField,
  ToggleButton,
} from '../../../../src/ui/kit';
import { createZip } from '../../../../src/util/zip';
import { sanitizeBaseName } from '../../../../src/ksa/modExport';
import {
  buildModPlan,
  type ExportMode,
  type ModPlanResult,
  type SystemFilePlan,
} from '../ksa/modPlan';
import { buildSystemXml } from '../ksa/systemXml';
import { $pieceIndex } from '../state/catalogStore';
import { ensureCorpusLoaded } from '../state/corpusStore';
import { $project } from '../state/docStore';
import { $installPath, $texturePathMode } from '../state/toolStore';

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Mount only while open (the plan effect runs for the dialog's lifetime). */
export function ExportDialog({ onClose }: { onClose: () => void }) {
  const project = useStore($project);
  const pieceIndex = useStore($pieceIndex);
  const installPath = useStore($installPath);
  const texturePathMode = useStore($texturePathMode);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [plan, setPlan] = useState<ModPlanResult | null>(null);
  const [mode, setMode] = useState<ExportMode>('system-mod');

  // The plan build is async only because the <System> scenario needs the Core
  // celestial corpus (fetched once); everything else is pure/sync.
  useEffect(() => {
    let stale = false;
    void (async () => {
      let system: SystemFilePlan | null = null;
      // System-mod mode ALWAYS ships the custom system — the full stock-planet
      // clone with any site-hosting bodies (Earth) inlined — even with zero
      // sites, so the mod is a complete selectable scenario from day one.
      if (mode === 'system-mod') {
        const corpus = await ensureCorpusLoaded();
        if (corpus) {
          const modId = sanitizeBaseName(project.modName);
          const built = buildSystemXml({
            systemId: `${modId}_sol`,
            displayName: `Sol — ${project.modName}`,
            modId,
            corpus,
            sites: project.sites,
            texturePaths:
              texturePathMode === 'absolute'
                ? { mode: 'absolute', installPath }
                : { mode: 'core-relative' },
          });
          system = {
            fileName: `${modId.toLowerCase()}_system.xml`,
            xml: built.xml,
            bodiesFileName: built.bodiesXml ? `${modId}Bodies.xml` : null,
            bodiesXml: built.bodiesXml,
          };
        }
      }
      if (!stale) setPlan(buildModPlan(project, pieceIndex, system, mode));
    })();
    return () => {
      stale = true;
    };
  }, [project, pieceIndex, mode, installPath, texturePathMode]);

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
    // `fullscreen` variant: the kit's default `center` modal clamps to max-w-md,
    // which made 44rem content overflow the rendered popup (the reported bug).
    <Modal isOpen onOpenChange={(open) => !open && onClose()} isDismissable variant="fullscreen">
      <Dialog className="flex min-h-0 flex-1 flex-col p-4">
        <DialogHeader title="Export KSA mod" onClose={onClose} />
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <TextField
            label="Mod name"
            value={project.modName}
            onChange={(v) => $project.set({ ...$project.get(), modName: v })}
          />
          <div className="flex items-center gap-1.5">
            <ToggleButton
              size="sm"
              isSelected={mode === 'system-mod'}
              onChange={() => setMode('system-mod')}
            >
              System mod (new sites)
            </ToggleButton>
            <ToggleButton
              size="sm"
              isSelected={mode === 'extend-stock-pad'}
              onChange={() => setMode('extend-stock-pad')}
            >
              Extend stock pad
            </ToggleButton>
          </div>
          {mode === 'system-mod' && (
            <div className="flex items-center gap-2">
              <TextField
                label="KSA install path (for absolute Core texture paths)"
                value={installPath}
                onChange={(v) => $installPath.set(v)}
              />
              <label className="mt-4 flex items-center gap-1 text-xs text-fg-muted">
                <input
                  type="checkbox"
                  checked={texturePathMode === 'core-relative'}
                  onChange={(e) =>
                    $texturePathMode.set(e.target.checked ? 'core-relative' : 'absolute')
                  }
                />
                ../Core/ paths (Content install)
              </label>
            </div>
          )}
          {mode === 'extend-stock-pad' && (
            <div className="text-[11px] text-fg-subtle">
              Appends every object's placements onto Core's launch pad prefab — the additions appear
              at ALL FIVE stock Earth sites (they share it). No system file is written.
            </div>
          )}
          {plan && (
            <>
              <div className="text-xs text-fg-muted">
                {project.objects.length} object(s) · {project.sites.length} site(s) ·{' '}
                {plan.vesselPieceIds.length} vessel-derived piece(s) declared · install as{' '}
                <code className="text-fg">
                  &lt;Documents&gt;/My Games/Kitten Space Agency/mods/{plan.modId}/
                </code>{' '}
                — then ENABLE it in Settings → Mods (new mods load disabled).
              </div>
              <div className="rounded border border-border bg-panel-sunken px-2 py-1 text-xs">
                <div className="mb-0.5 font-semibold text-fg-muted">Placement in the world</div>
                {project.sites.length === 0 ? (
                  <div className="text-warning">
                    No launch sites — objects export but are placed nowhere. Add sites in the right
                    sidebar.
                  </div>
                ) : (
                  project.sites.map((s) => {
                    const obj = project.objects.find((o) => o.id === s.staticObjectId);
                    return (
                      <div key={s.id} className="text-fg-muted">
                        <span className="text-fg">{s.landmarkId}</span> on {s.bodyId} (
                        {s.latDeg.toFixed(2)}°, {s.lonDeg.toFixed(2)}°) →{' '}
                        <span className="text-fg">{obj?.name ?? s.staticObjectId}</span>
                      </div>
                    );
                  })
                )}
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
                <pre className="min-h-0 flex-1 overflow-auto rounded bg-panel-sunken p-2 text-[11px] leading-4 text-fg-muted">
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
