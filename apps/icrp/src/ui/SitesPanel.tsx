/**
 * Launch-site management (plan P7.02/P7.03): the project's sites, each binding
 * a lat/lon on a body to one exported `<StaticObject>` plus a terrain-flattening
 * decal. Exported as a self-contained `<System>` scenario (D2) — the panel
 * explains the per-body facts (no heading, ≤4 clutter-cleared pads).
 */
import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { MapPin, Trash2 } from 'lucide-react';
import { Button, ListBoxItem, Select, TextField } from '../../../../src/ui/kit';
import { NumberField } from '../../../../src/ui/NumberField';
import {
  $project,
  addSite,
  beginGesture,
  pushUndo,
  removeSite,
  updateSite,
} from '../state/docStore';
import { $bodyIds, $stockLandmarks, ensureCorpusLoaded } from '../state/corpusStore';
import { defaultDecal, type Site } from '../ksa/siteTypes';

function SiteRow({ site }: { site: Site }) {
  const project = useStore($project);
  const bodyIds = useStore($bodyIds);
  const stockLandmarks = useStore($stockLandmarks);
  const stockForBody = stockLandmarks.get(site.bodyId) ?? [];
  const replacesStock = stockForBody.some((l) => l.id === site.landmarkId);
  const objectOptions = [
    ...project.objects.map((o) => ({ id: o.id, label: o.name })),
    { id: 'CoreLaunchPadA_Prefab_LaunchPadA', label: 'Core launch pad (stock)' },
  ];
  const decal = site.decal;
  return (
    <div className="flex flex-col gap-1.5 rounded border border-border p-2">
      <div className="flex items-center gap-1">
        <MapPin size={12} className="shrink-0 text-fg-muted" />
        <TextField
          aria-label="Landmark name"
          value={site.landmarkId}
          onFocus={() => beginGesture('Rename site')}
          onChange={(v) => updateSite(site.id, { landmarkId: v })}
        />
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Delete site ${site.landmarkId}`}
          onPress={() => removeSite(site.id)}
        >
          <Trash2 size={12} />
        </Button>
      </div>
      <Select
        aria-label="Body"
        size="sm"
        searchable
        selectedKey={site.bodyId}
        onSelectionChange={(k) => {
          pushUndo('Move site to body');
          updateSite(site.id, { bodyId: String(k) });
        }}
        items={bodyIds.map((id) => ({ id }))}
      >
        {(item) => <ListBoxItem id={item.id}>{item.id}</ListBoxItem>}
      </Select>
      <div className="flex gap-1">
        <NumberField
          label="φ"
          ariaLabel="Latitude (degrees)"
          value={site.latDeg}
          min={-90}
          max={90}
          step={0.01}
          onInteractionStart={() => beginGesture('Edit site latitude')}
          onCommit={(v) => updateSite(site.id, { latDeg: v })}
        />
        <NumberField
          label="λ"
          ariaLabel="Longitude (degrees)"
          value={site.lonDeg}
          min={-180}
          max={180}
          step={0.01}
          onInteractionStart={() => beginGesture('Edit site longitude')}
          onCommit={(v) => updateSite(site.id, { lonDeg: v })}
        />
      </div>
      <Select
        aria-label="Static object at this site"
        size="sm"
        selectedKey={site.staticObjectId}
        onSelectionChange={(k) => {
          pushUndo('Bind site object');
          updateSite(site.id, { staticObjectId: String(k) });
        }}
        items={objectOptions}
      >
        {(item) => <ListBoxItem id={item.id}>{item.label}</ListBoxItem>}
      </Select>
      {stockForBody.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-fg-subtle">Replace stock:</span>
          {stockForBody
            .filter((l) => l.isLaunchPad)
            .map((l) => (
              <button
                key={l.id}
                type="button"
                className="rounded border border-border px-1.5 py-0.5 text-[11px] text-fg-muted hover:bg-wash-hover"
                onClick={() => {
                  pushUndo('Retarget stock site');
                  updateSite(site.id, {
                    landmarkId: l.id,
                    latDeg: l.latDeg,
                    lonDeg: l.lonDeg,
                    // stock sites already ship a terrain decal
                    decal: null,
                  });
                }}
              >
                {l.id}
              </button>
            ))}
        </div>
      )}
      {replacesStock && (
        <div className="text-[11px] text-accent">
          Replaces the stock site's pad (same landmark id — retargeted, not duplicated).
        </div>
      )}
      <label className="flex items-center gap-1.5 text-xs text-fg-muted">
        <input
          type="checkbox"
          checked={decal !== null}
          onChange={(e) => {
            pushUndo(e.target.checked ? 'Add terrain decal' : 'Remove terrain decal');
            updateSite(site.id, { decal: e.target.checked ? defaultDecal() : null });
          }}
        />
        Terrain-flattening decal
      </label>
      {decal && (
        <div className="flex flex-col gap-1 pl-4">
          <NumberField
            label="R"
            ariaLabel="Decal radius (m)"
            value={decal.radiusM}
            min={10}
            step={10}
            onInteractionStart={() => beginGesture('Edit decal radius')}
            onCommit={(v) => updateSite(site.id, { decal: { ...decal, radiusM: v } })}
          />
          <NumberField
            label="H"
            ariaLabel="Terrain height at the site (m)"
            value={decal.terrainHeightM}
            step={1}
            onInteractionStart={() => beginGesture('Edit decal terrain height')}
            onCommit={(v) => updateSite(site.id, { decal: { ...decal, terrainHeightM: v } })}
          />
          <div className="text-[11px] text-fg-subtle">
            H = the LOCAL TERRAIN HEIGHT in metres (read it in-game at the lat/lon; Canaveral ≈ 17,
            Vandenberg SLC-4 ≈ 225). The terrain is flattened to it.
          </div>
        </div>
      )}
    </div>
  );
}

export function SitesPanel() {
  const project = useStore($project);
  useEffect(() => {
    void ensureCorpusLoaded();
  }, []);
  return (
    <div className="flex flex-col gap-2 border-t border-border px-3 py-2">
      <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
        Launch sites
      </div>
      {project.sites.map((site) => (
        <SiteRow key={site.id} site={site} />
      ))}
      <Button size="sm" variant="ghost" onPress={() => addSite('Earth')}>
        + New site
      </Button>
      <div className="text-[11px] text-fg-subtle">
        Sites export as a self-contained system (a full copy of each body carrying sites — KSA mods
        cannot patch Core bodies). No heading exists: a complex faces up/east/north; rotate its
        placements instead. Max 4 clutter-cleared pads per body.
      </div>
    </div>
  );
}
