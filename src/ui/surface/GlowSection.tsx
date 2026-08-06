import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button as AriaButton } from 'react-aria-components';
import { Button, ListBoxItem, Select, Slider, Tooltip } from '../kit';
import { SurfaceSection } from './SurfaceSection';
import { ColorAlphaField } from '../ColorAlphaField';
import { SliderRow } from '../SliderRow';
import { openDialog } from '../../state/dialogStore';
import { addLight } from '../../state/editorStore';
import { setMeshGlow, setMeshGlowStreaming } from '../../state/customAssetStore';
import { setMode } from '../../state/modeStore';
import { status } from '../../state/statusStore';
import { decodeImage } from '../../ktx/decodeImage';
import {
  GLOW_RAMP_PRESETS,
  defaultGlowRamp,
  glowRampCss,
  glowRampFromImage,
  hexToRgb,
  normalizeGlowRamp,
  rgbToHex,
  sampleGlowRamp,
} from '../../ktx/glowRamp';
import {
  createGlow,
  type CustomMesh,
  type EmissiveConfig,
  type GlowRamp,
  type GlowRampStop,
  type RgbColor,
} from '../../ksa/types';

/**
 * **Surface mode's Glow (emissive) section** (design: design-surface-assets.md §1.3 "Glow";
 * census custom-assets.md §1.11). The v1 inventory verbatim — modes, color, coverage,
 * emissive + the wash-out warning, the ramp editor with presets and import-from-image, the
 * paint-dialog entry and "Add Matching Light" — rehosted from the floating
 * `ManageTexturesPanel` into the docked sidebar (which is why `ManageTexturesPanel` imports
 * these components rather than keeping a second copy until it is deleted).
 *
 * **The two sliders are deliberately independent**, because KSA's emissive can only ever ADD
 * WHITE (`MeshIndirect.frag:286` — `gammaToLinear(vec3(mask) * 1.25)`, no colour input on
 * that path):
 *  - **Color** puts the glow colour in the `<Diffuse>`; it reads wherever the surface is lit.
 *  - **Emissive** is the `<Emissive>` mask value; it is the white the game adds, and the only
 *    thing visible in shadow. Past ~0.6 it swamps the colour, which is the "my green glow is
 *    white" symptom. See analysis/KSA_EMISSIVE_AND_LUT.md.
 *
 * **Undo enrollment** (design §1.8): mode / colour / ramp edits are DISCRETE (one
 * `setMeshGlow` step each); the Coverage and Emissive sliders are STREAMING — one push at
 * interaction start via `setMeshGlowStreaming`, so a whole drag is one undo entry.
 *
 * **Preview == export**: every change re-runs the shared `glowComposite`/`glowRamp` math
 * through the mesh-signature rebuild. No preview math lives here.
 */

/** Emissive mask values above this blow a glow's color out to white in-game. */
export const GLOW_WASHOUT_STRENGTH = 0.6;

export function GlowSection({ mesh }: { mesh: CustomMesh }) {
  const mode = mesh.emissive?.shape ?? 'off';
  const setMode_ = (m: string) => {
    if (m === 'off') {
      void setMeshGlow(mesh.id, undefined);
      return;
    }
    void setMeshGlow(mesh.id, {
      ...(mesh.emissive ?? createGlow()),
      shape: m as 'whole' | 'painted',
    });
  };

  return (
    <SurfaceSection title="Glow (emissive)" headerAction={<GlowHelp />}>
      <Select
        label="Mode"
        size="sm"
        selectedKey={mode}
        onSelectionChange={(k) => setMode_(String(k))}
      >
        <ListBoxItem id="off">Off</ListBoxItem>
        <ListBoxItem id="whole">Whole mesh</ListBoxItem>
        <ListBoxItem id="painted">Painted spots</ListBoxItem>
      </Select>
      {mesh.emissive && <GlowSettings mesh={mesh} glow={mesh.emissive} />}
      {mesh.emissive?.shape === 'painted' && (
        <Button
          size="sm"
          variant="secondary"
          onPress={() => openDialog({ id: 'glow-paint', params: { meshId: mesh.id } })}
        >
          Edit paint…
        </Button>
      )}
    </SurfaceSection>
  );
}

/** The section's ⓘ — both KSA facts, stated where the sliders are (design §1.3). */
function GlowHelp() {
  return (
    <Tooltip content="KSA has no colored emissive: it adds WHITE × mask × 1.25 after lighting. Color lives in the base color (visible where lit); Emissive is the white (visible in shadow). Add Matching Light is the only path to colored LIGHT.">
      <span
        tabIndex={0}
        aria-label="How KSA emissive works"
        className="shrink-0 cursor-help rounded px-1 text-xs text-fg-subtle outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        ⓘ
      </span>
    </Tooltip>
  );
}

/**
 * The glow controls shared by the plain-mesh section and the visor section. Exported so the
 * Visor Surface section renders the identical set (v1's `glassGlow` shows both).
 */
export function GlowSettings({ mesh, glow }: { mesh: CustomMesh; glow: EmissiveConfig }) {
  // The "first event of this interaction" latch behind the streaming undo split. A ref, not
  // state: it must not re-render, and it must be readable synchronously inside onChange.
  const first = useRef(true);
  const patch = (next: Partial<EmissiveConfig>) => void setMeshGlow(mesh.id, { ...glow, ...next });
  const stream = (next: Partial<EmissiveConfig>) => {
    void setMeshGlowStreaming(mesh.id, next, first.current);
    first.current = false;
  };
  const ramped = !!glow.ramp;

  return (
    <>
      {glow.shape === 'painted' && (
        <Select
          label="Color source"
          size="sm"
          selectedKey={ramped ? 'ramp' : 'solid'}
          onSelectionChange={(k) =>
            k === 'ramp'
              ? patch({ ramp: defaultGlowRamp() })
              : void setMeshGlow(mesh.id, { ...glow, ramp: undefined })
          }
        >
          <ListBoxItem id="solid">Solid color</ListBoxItem>
          <ListBoxItem id="ramp">Color ramp (LUT)</ListBoxItem>
        </Select>
      )}
      {ramped && glow.ramp ? (
        <GlowRampEditor ramp={glow.ramp} onChange={(ramp) => patch({ ramp })} />
      ) : (
        <ColorAlphaField
          label="Color"
          color={rgbToHex(glow.color)}
          opacity={glow.coverage}
          onChange={({ color, opacity }) => patch({ color: hexToRgb(color), coverage: opacity })}
        />
      )}
      {ramped && (
        <SliderRow
          label="Coverage"
          ariaLabel="Glow color coverage"
          value={glow.coverage}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => stream({ coverage: v })}
          onInteractionStart={() => {
            first.current = true;
          }}
          onInteractionEnd={() => {
            first.current = true;
          }}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      )}
      <SliderRow
        label="Emissive"
        ariaLabel="Emissive mask strength"
        value={glow.strength}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => stream({ strength: v })}
        onInteractionStart={() => {
          first.current = true;
        }}
        onInteractionEnd={() => {
          first.current = true;
        }}
        format={(v) => `${Math.round(v * 100)}%`}
      />
      {glow.strength > GLOW_WASHOUT_STRENGTH && (
        <p className="text-[11px] leading-snug text-warning">
          KSA adds this as WHITE, so this much emissive will wash the color out. Lower it and add a
          matching light for colored light.
        </p>
      )}
      <AddMatchingLightButton mesh={mesh} glow={glow} />
    </>
  );
}

/**
 * Adds a `<Light>` on this SubPart seeded with the glow's colour — the only mechanism that makes a
 * KSA part actually cast COLOURED light (`LightModule.TemplateData.ColorRgb`), since the emissive
 * map is white-only. A Point light at the SubPart origin; range/aim are edited in SubPart Data.
 *
 * `addLight` pushes its own discrete undo step; the status flash offers the Build-mode jump
 * because the light it just made is a Build-mode entity (design §1.3).
 */
export function AddMatchingLightButton({ mesh, glow }: { mesh: CustomMesh; glow: EmissiveConfig }) {
  const color = glow.ramp ? sampleGlowRamp(glow.ramp, 1) : glow.color;
  return (
    <Button
      size="sm"
      variant="secondary"
      onPress={() => {
        addLight(mesh.subPartId, {
          type: 'Point',
          color: { r: color.r / 255, g: color.g / 255, b: color.b / 255 },
        });
        status('Light added — edit in Build mode', {
          severity: 'success',
          action: { label: 'Go →', run: () => setMode('build') },
        });
      }}
    >
      Add matching light
    </Button>
  );
}

/**
 * Editor for a {@link GlowRamp} — the greyscale-key → color gradient that mirrors how KSA keys its
 * own effects through a 1-px LUT (`temperatureLut`). KSA has no per-material LUT slot, so flexo
 * bakes the ramp into the diffuse at composite time; this is purely an authoring surface.
 *
 * Importing reads the image's MIDDLE row across its FULL width — flexo does not guess where a
 * gradient starts, so a screenshot with background margins imports those margins too (crop first,
 * or drag the stops afterwards).
 */
export function GlowRampEditor({
  ramp,
  onChange,
}: {
  ramp: GlowRamp;
  onChange: (r: GlowRamp) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState('');

  const importImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      const decoded = await decodeImage(file);
      onChange(normalizeGlowRamp(glowRampFromImage(decoded.levels[0]).stops));
      setImportError('');
    } catch {
      setImportError('Could not read that image.');
    }
  };

  const patchStop = (i: number, next: Partial<GlowRampStop>) =>
    onChange(normalizeGlowRamp(ramp.stops.map((s, j) => (j === i ? { ...s, ...next } : s))));

  return (
    <div className="flex flex-col gap-2">
      <div
        className="h-5 w-full rounded border border-border"
        style={{ background: glowRampCss(ramp) }}
        aria-label="Color ramp preview"
      />
      <div className="flex items-center gap-2">
        {/* A command menu, not a value: selectedKey stays null so it re-shows the placeholder
            after a pick (the stops are editable afterwards, so there is no "current preset"). */}
        <Select
          aria-label="Ramp preset"
          size="sm"
          placeholder="Preset…"
          selectedKey={null}
          onSelectionChange={(k) => {
            const preset = GLOW_RAMP_PRESETS.find((p) => p.id === String(k));
            if (preset) onChange(normalizeGlowRamp(preset.ramp.stops));
          }}
          className="flex-1"
        >
          {GLOW_RAMP_PRESETS.map((p) => (
            <ListBoxItem key={p.id} id={p.id}>
              {p.label}
            </ListBoxItem>
          ))}
        </Select>
        <Button size="sm" variant="secondary" onPress={() => fileInput.current?.click()}>
          Import…
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void importImage(e.target.files?.[0])}
        />
      </div>
      {importError && <p className="text-[11px] text-warning">{importError}</p>}
      {ramp.stops.map((stop, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="color"
            aria-label={`Ramp stop ${i + 1} color`}
            className="h-6 w-6 shrink-0 cursor-pointer rounded border border-border bg-transparent"
            value={rgbToHex(stop.color)}
            onChange={(e) => patchStop(i, { color: hexToRgb(e.target.value) })}
          />
          <Slider
            aria-label={`Ramp stop ${i + 1} position`}
            className="flex-1"
            minValue={0}
            maxValue={1}
            step={0.01}
            value={stop.at}
            onChange={(v) => patchStop(i, { at: v as number })}
          />
          <span className="w-8 shrink-0 text-right font-mono text-[11px] text-fg-subtle">
            {Math.round(stop.at * 100)}%
          </span>
          <AriaButton
            aria-label={`Remove ramp stop ${i + 1}`}
            className="shrink-0 rounded p-0.5 text-fg-subtle hover:text-fg disabled:opacity-30"
            isDisabled={ramp.stops.length <= 2}
            onPress={() => onChange({ stops: ramp.stops.filter((_, j) => j !== i) })}
          >
            <X size={12} />
          </AriaButton>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        onPress={() =>
          onChange(normalizeGlowRamp([...ramp.stops, { at: 0.5, color: midStop(ramp) }]))
        }
      >
        Add stop
      </Button>
    </div>
  );
}

/** The ramp's own color at the midpoint — so a new stop lands on the curve instead of jumping. */
function midStop(ramp: GlowRamp): RgbColor {
  return sampleGlowRamp(ramp, 0.5);
}
