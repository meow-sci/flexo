import { useStore } from '@nanostores/react';
import { Tooltip, cn } from '../kit';
import { SurfaceSection } from './SurfaceSection';
import { $surfaceFace, faceKeysFor, pickSurfaceFace } from '../../state/surfaceModeStore';
import { FACE_LABELS } from '../../three/primitives';
import type { CustomMesh } from '../../ksa/types';

/**
 * **Faces** — the chip row that drives `$surfaceFace` (design: design-surface-assets.md §1.3
 * "Faces"). The face's EDITOR is the left Face card; this is the selector, which is the
 * LOCKED right/left split (foundation §8.5 item 2, §7.5).
 *
 * Hidden for sphere/plane (whose only key is `'all'`) and for imported/kitten meshes, which
 * have no per-face grid at all — one glTF primitive is one KSA `<PartModel>` with exactly one
 * material.
 *
 * **No document mutation happens here** — picking a face is mode sub-state and is never an
 * undo step (design §1.8 last row).
 */
export function FacesSection({ mesh }: { mesh: CustomMesh }) {
  const active = useStore($surfaceFace);
  const keys = faceKeysFor(mesh);
  if (keys.length <= 1) return null;

  return (
    <SurfaceSection title="Faces">
      <div className="flex flex-wrap gap-1">
        {keys.map((key) => {
          const textured = !!mesh.faceTextures[key]?.textureId;
          const selected = active === key;
          return (
            <Tooltip key={key} content={FACE_LABELS[key] ?? key}>
              <button
                type="button"
                aria-pressed={selected}
                className={cn(
                  'flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
                  selected
                    ? 'border-accent bg-accent/15 text-fg'
                    : 'border-border text-fg-muted hover:border-border-strong',
                )}
                // Clicking the ACTIVE chip deselects (design §1.3 "clicking the active chip
                // deselects"), which is how you get back to the whole-mesh tint.
                onClick={() => pickSurfaceFace(selected ? null : key)}
              >
                <span>{FACE_LABELS[key] ?? key}</span>
                {textured && <span className="text-accent">●</span>}
              </button>
            </Tooltip>
          );
        })}
      </div>
      <p className="text-[11px] leading-snug text-fg-subtle">(edits in the left Face card)</p>
    </SurfaceSection>
  );
}
