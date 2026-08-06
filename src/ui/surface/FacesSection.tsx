import { useStore } from '@nanostores/react';
import { Button, Tooltip, cn, useIsPhone } from '../kit';
import { SurfaceSection } from './SurfaceSection';
import { openInspectorSheet } from '../shell/phone/phoneSheets';
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
 *
 * **Phone hand-off**: the two sidebars are two sheets sharing one slot, so selecting a face
 * in the Panel sheet closes it and opens the Inspector sheet on the Face card — the hand-off
 * Data mode's navigator already makes (foundation §12; design-data-engine-modes §A8).
 * Without it the selector would silently populate a surface the user cannot see.
 *
 * The chip GESTURES stay identical on both platforms (tapping the active chip deselects), so
 * no phone user loses the whole-mesh view. Re-reaching the editor for an ALREADY-selected
 * face — which fires no selection change and so cannot piggyback on the chips — is what the
 * phone-only caption button is for.
 */
export function FacesSection({ mesh }: { mesh: CustomMesh }) {
  const active = useStore($surfaceFace);
  const isPhone = useIsPhone();
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
                onClick={() => {
                  pickSurfaceFace(selected ? null : key);
                  if (isPhone && !selected) openInspectorSheet();
                }}
              >
                <span>{FACE_LABELS[key] ?? key}</span>
                {textured && <span className="text-accent">●</span>}
              </button>
            </Tooltip>
          );
        })}
      </div>
      {isPhone ? (
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          isDisabled={active === null}
          onPress={openInspectorSheet}
        >
          Edit face in the Inspector sheet →
        </Button>
      ) : (
        <p className="text-[11px] leading-snug text-fg-subtle">(edits in the left Face card)</p>
      )}
    </SurfaceSection>
  );
}
