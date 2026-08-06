import { useRef } from 'react';
import { useStore } from '@nanostores/react';
import { ListBoxItem, Select, Switch } from '../kit';
import { SurfaceSection } from './SurfaceSection';
import { GlowSettings } from './GlowSection';
import { ColorAlphaField } from '../ColorAlphaField';
import { setMeshGlassStreaming, setMeshSurface } from '../../state/customAssetStore';
import { $simulateGlass, setSimulateGlass } from '../../state/settingsStore';
import { hexToRgb, rgbToHex } from '../../ktx/glowRamp';
import type { CustomMesh, VisorSurface as VisorSurfaceMode } from '../../ksa/types';

/**
 * **Visor Surface** — the glass-capable kitten submesh's controls (design:
 * design-surface-assets.md §1.3 "Visor Surface"; census §1.13; guardrail 7).
 *
 * Rendered only when `mesh.kitten?.transparent`. The three surface modes are KSA-shaped, not
 * cosmetic: `glass` exports a `<PartModelGlass>` shell, `glow` an opaque emissive SubPart,
 * and `glassGlow` the layered two-SubPart expansion (kitten-only — the inset heuristic is
 * unsafe on arbitrary geometry). Both configs persist across mode switches, so toggling never
 * discards the user's tint or glow.
 *
 * **Undo enrollment**: surface mode = discrete (`setMeshSurface`); the tint drag = streaming
 * (`setMeshGlassStreaming`, one push at interaction start); `Simulate in-game glass` is a
 * GLOBAL preview preference and never an undo step.
 */
export function VisorSection({ mesh }: { mesh: CustomMesh }) {
  const simulate = useStore($simulateGlass);
  const surface: VisorSurfaceMode = mesh.surface ?? 'glass';
  const showGlass = surface === 'glass' || surface === 'glassGlow';
  const showGlow = surface === 'glow' || surface === 'glassGlow';

  return (
    <SurfaceSection title="Visor surface">
      <Select
        label="Surface"
        size="sm"
        selectedKey={surface}
        onSelectionChange={(k) => void setMeshSurface(mesh.id, k as VisorSurfaceMode)}
      >
        <ListBoxItem id="glass">Glass (translucent)</ListBoxItem>
        <ListBoxItem id="glow">Glow (opaque)</ListBoxItem>
        <ListBoxItem id="glassGlow">Glass + Glow (layered)</ListBoxItem>
      </Select>
      {showGlass && (
        <>
          <TintField mesh={mesh} />
          <p className="text-[11px] leading-snug text-fg-subtle">
            Editor opacity only — in-game opacity is engine-fixed at about 0.75.
          </p>
          <Switch isSelected={simulate} onChange={setSimulateGlass}>
            Simulate in-game glass (global)
          </Switch>
        </>
      )}
      {showGlow && mesh.emissive && <GlowSettings mesh={mesh} glow={mesh.emissive} />}
      <p className="text-[11px] leading-snug text-fg-subtle">
        In-game KSA renders glass darker/subtler than shown (it can&apos;t glow). “Glow” makes the
        visor opaque; “Glass + Glow” keeps it see-through with a glow layer behind it.
      </p>
    </SurfaceSection>
  );
}

/** Tint + editor-preview opacity for a glass surface. Streaming undo (one push per drag). */
export function TintField({ mesh }: { mesh: CustomMesh }) {
  const first = useRef(true);
  const glass = mesh.glass ?? { tint: { r: 120, g: 200, b: 255 }, opacity: 0.45 };
  return (
    <ColorAlphaField
      label="Tint"
      color={rgbToHex(glass.tint)}
      opacity={glass.opacity ?? 0.45}
      onInteractionStart={() => {
        first.current = true;
      }}
      onChange={({ color, opacity }) => {
        void setMeshGlassStreaming(mesh.id, { tint: hexToRgb(color), opacity }, first.current);
        first.current = false;
      }}
    />
  );
}
