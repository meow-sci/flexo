import { useStore } from '@nanostores/react';
import { ListBoxItem, SectionTitle, Select, Switch, TextField } from '../kit';
import {
  $kittenTextureExport,
  $modelImportSettings,
  setKittenTextureExport,
  setModelImportSettings,
  type KittenTextureExportSettings,
} from '../../state/settingsStore';

/**
 * **Settings ▸ Import & Export** — the SINGLE editable home for every preference that
 * survives one import and shapes the next one, plus the two kitten-texture export choices
 * (design: design-surface-assets.md D4 + §6 last row; foundation §10.7 "Import & Export").
 *
 * Law 1, applied to a preference that used to have no home at all. Two v1 defects die here:
 *
 * 1. **`decimateViewMeshes` was an IMPORT option that silently changed EXPORT output**
 *    (`modExport.viewMeshBudget` reads it at export time — census pain #8). It is labelled
 *    "affects export" wherever it appears, and Import Review's copy of the toggle writes
 *    this same store with a deep-link back here.
 * 2. **The kitten texture mode hid in global Settings** with no relation to anything around
 *    it (pain #9). It now sits beside the other export-shaping preferences; the Export
 *    dialog surfaces both as read-only chips deep-linking here (that half is the export
 *    area's task, foundation §10.6).
 *
 * Its own component, not a block of JSX inside `SettingsDialog`, so the tabbed Settings IA
 * can re-mount it verbatim as its Import & Export tab.
 *
 * **Persistence**: `$modelImportSettings` (`flexo:modelImport`) and `$kittenTextureExport`
 * (`flexo:kittenTextureExport`), both localStorage. **Undo enrollment: NONE** — preferences
 * are never document state.
 */
export function ImportExportSettings() {
  const model = useStore($modelImportSettings);
  const kittenTex = useStore($kittenTextureExport);

  return (
    <>
      <SectionTitle>Import &amp; Export</SectionTitle>

      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-fg-muted">Up axis in source files</span>
        <Select
          size="sm"
          aria-label="Model import up axis"
          className="w-52"
          selectedKey={model.upAxis}
          onSelectionChange={(k) => setModelImportSettings({ upAxis: k === 'z' ? 'z' : 'y' })}
        >
          <ListBoxItem id="y">Y-up (glTF / Blender default)</ListBoxItem>
          <ListBoxItem id="z">Z-up (rotate −90° about X)</ListBoxItem>
        </Select>
      </label>

      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-fg-muted">Max texture size</span>
        <Select
          size="sm"
          aria-label="Maximum imported texture size"
          className="w-52"
          selectedKey={String(model.maxTextureSize)}
          onSelectionChange={(k) =>
            setModelImportSettings({ maxTextureSize: Number(k) as 1024 | 2048 | 4096 })
          }
        >
          <ListBoxItem id="1024">1024 px</ListBoxItem>
          <ListBoxItem id="2048">2048 px</ListBoxItem>
          <ListBoxItem id="4096">4096 px (expensive)</ListBoxItem>
        </Select>
      </label>
      <span className="text-xs text-fg-subtle">
        flexo&rsquo;s KTX2 textures are uncompressed RGBA8 + Zstd, so each one costs width × height
        × 4 bytes of VRAM in-game plus a third again for its mips — a 4096² map is ~85 MB.
      </span>

      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-fg-muted">Bake scale into geometry</span>
        <Switch
          aria-label="Bake scale into geometry on import"
          isSelected={model.bakeScale}
          onChange={(bakeScale) => setModelImportSettings({ bakeScale })}
        />
      </label>

      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-fg-muted">Decimate view meshes (affects export)</span>
        <Switch
          aria-label="Decimate view meshes"
          isSelected={model.decimateViewMeshes}
          onChange={(decimateViewMeshes) => setModelImportSettings({ decimateViewMeshes })}
        />
      </label>
      <span className="text-xs text-fg-subtle">
        KSA hover-picks Parts on the CPU against a separate <span className="font-mono">_VM</span>{' '}
        view mesh. On, the exported view meshes are simplified to a triangle budget; off, they ship
        at full density. Read at <b>export</b> time, not at import.
      </span>

      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-fg-muted">Kitten mesh textures (export)</span>
        <Select
          size="sm"
          aria-label="Kitten mesh texture export mode"
          className="w-52"
          selectedKey={kittenTex.mode}
          onSelectionChange={(k) =>
            setKittenTextureExport({ mode: k as KittenTextureExportSettings['mode'] })
          }
        >
          <ListBoxItem id="reference">Reference game install</ListBoxItem>
          <ListBoxItem id="bundle">Bundle copies into mod</ListBoxItem>
        </Select>
      </label>
      {kittenTex.mode === 'reference' && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-fg-muted">Content/Core path</span>
          <TextField
            aria-label="Game Content/Core folder path"
            inputClassName="font-mono text-xs"
            placeholder="C:\Program Files\Kitten Space Agency\Content\Core"
            value={kittenTex.contentCorePath}
            onChange={(v) => setKittenTextureExport({ contentCorePath: v })}
          />
          <span className="text-xs text-fg-subtle">
            Kitten SubParts reference the game&rsquo;s own .ktx2 at this path (nothing copied into
            the mod). Tied to this install location — switch to “Bundle” for a portable mod.
          </span>
        </label>
      )}
    </>
  );
}
