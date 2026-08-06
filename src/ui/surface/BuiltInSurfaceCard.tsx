import { useStore } from '@nanostores/react';
import { focusCard } from '../build/FocusCardHeader';
import { $catalogIndex } from '../../state/catalogStore';

/**
 * **Built-in surface** — the read-only card Surface mode shows for a selected CORE SubPart
 * (design: design-surface-assets.md D7, §1.4).
 *
 * Surface mode's editor is scoped to the mesh PICKER, so selecting a built-in SubPart used to
 * be a dead end. It isn't data flexo can edit — a Core SubPart's textures are game assets —
 * but the data already exists in `CatalogSubPart`, so the mode answers with what the surface
 * IS and names the two authoring paths instead of showing nothing.
 */
export function BuiltInSurfaceCard({ templateId }: { templateId: string }) {
  const index = useStore($catalogIndex);
  const entry = index.get(templateId);
  if (!entry) return null;

  return (
    <div className={focusCard}>
      <span className="text-xs font-medium text-fg">Built-in surface</span>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
        <Row label="Template" value={templateId} />
        {entry.materialId && <Row label="Material" value={entry.materialId} mono />}
        {entry.sourceFile && <Row label="Source" value={entry.sourceFile} />}
      </dl>
      <div className="flex flex-col gap-1">
        <ChannelRow label="Diffuse" url={entry.diffuseUrl} />
        <ChannelRow label="Normal" url={entry.normalUrl} />
        <ChannelRow label="AoRoughMetal" url={entry.aoRoughMetalUrl} />
        <ChannelRow label="Emissive" url={entry.emissiveUrl} />
      </div>
      <p className="text-[11px] leading-snug text-fg-subtle">
        ⓘ Built-in surfaces are game assets and can&apos;t be edited. Import a model or create a
        primitive mesh to author surfaces of your own.
      </p>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-fg-subtle">{label}</dt>
      <dd className={`truncate text-fg-muted${mono ? ' font-mono' : ''}`} title={value}>
        {value}
      </dd>
    </>
  );
}

/**
 * One `<PbrMaterial>` channel: a thumbnail when the catalog resolved a URL, an em dash when
 * the Core material simply has no image in that slot. The URL is a `.ktx2`, which no `<img>`
 * can decode — so the swatch is a slot INDICATOR, and the filename is the readable part.
 */
function ChannelRow({ label, url }: { label: string; url?: string }) {
  const file = url ? decodeURIComponent(url.split('/').pop() ?? url) : '—';
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span
        aria-hidden
        className={`size-5 shrink-0 rounded border border-border ${url ? 'bg-accent/25' : 'bg-panel-sunken'}`}
      />
      <span className="w-24 shrink-0 text-fg-subtle">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-fg-muted" title={file}>
        {file}
      </span>
    </div>
  );
}
