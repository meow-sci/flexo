import { useRef } from 'react';
import { useStore } from '@nanostores/react';
import { Button, Kbd, keyLabel } from '../kit';
import { MeshPicker } from './MeshPicker';
import { IdentitySection } from './IdentitySection';
import { MaterialSection } from './MaterialSection';
import { FacesSection } from './FacesSection';
import { GlowSection } from './GlowSection';
import { VisorSection } from './VisorSection';
import { ImportedSection } from './ImportedSection';
import { $surfaceMeshId } from '../../state/surfaceModeStore';
import { $part } from '../../state/editorStore';
import { runCommand } from '../../state/commandStore';
import { meshKind } from '../../ksa/types';

/**
 * **Surface mode's right sidebar** — the mode primary (design: design-surface-assets.md §1.3;
 * foundation §8.5, LOCKED: *the right sidebar IS the material/glow/UV editor*).
 *
 * Two halves: the pinned mesh picker, then the picked mesh's full surface editor as a stack
 * of `SurfaceSection`s. Which sections appear is a pure function of the mesh's KIND
 * (`meshKind`, never `primitive!` — census constraint):
 *
 * | Section  | primitive | imported | kitten |
 * |----------|-----------|----------|--------|
 * | Identity | ✓ (+ params) | ✓ | ✓ |
 * | Material | ✓ | ✓ | — (a kitten submesh carries its own KSA PBR set) |
 * | Faces    | ✓ (>1 key) | — | — |
 * | Glow     | ✓ | ✓ | ✓ unless glass-capable (the Visor section owns it then) |
 * | Visor    | — | — | ✓ when `kitten.transparent` |
 * | Imported | — | ✓ | — |
 *
 * This replaces the floating `ManageTexturesPanel` (foundation §6.3 death list), which
 * collided with every other left-edge surface and had no room for the Identity fields at all.
 *
 * **Undo enrollment: NONE of its own** — every section's mutators push their own steps.
 */
export function SurfaceSidebar() {
  const part = useStore($part);
  const pickedId = useStore($surfaceMeshId);
  const scrollRef = useRef<HTMLDivElement>(null);

  const mesh = pickedId ? part.customMeshes.find((m) => m.id === pickedId) : undefined;
  const kind = mesh ? meshKind(mesh) : undefined;
  const glassCapable = !!mesh?.kitten?.transparent;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 rounded-xl border border-border bg-panel p-(--density-panel-p)">
      <div className="flex items-center gap-1 px-1">
        <span className="flex-1 text-xs font-medium uppercase tracking-wide text-fg-muted">
          Surface
        </span>
        <Button size="xs" variant="ghost" onPress={() => runCommand('window.assetManager')}>
          Asset Manager… <Kbd>{`${keyLabel('mod')}${keyLabel('shift')}A`}</Kbd>
        </Button>
      </div>

      <div className="shrink-0 px-1">
        <MeshPicker onPicked={() => scrollRef.current?.scrollTo({ top: 0 })} />
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        {!mesh ? (
          <p className="px-1 py-2 text-xs text-fg-subtle">
            Pick a mesh above to edit its material, faces and glow.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <IdentitySection mesh={mesh} />
            {kind !== 'kitten' && <MaterialSection mesh={mesh} />}
            {kind === 'primitive' && <FacesSection mesh={mesh} />}
            {/* A glass-capable visor's glow lives INSIDE the visor section (v1 logic: the
                surface mode gates which of tint/glow renders and exports). */}
            {!glassCapable && <GlowSection mesh={mesh} />}
            {glassCapable && <VisorSection mesh={mesh} />}
            {kind === 'imported' && mesh.imported && (
              <ImportedSection mesh={mesh} imported={mesh.imported} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
