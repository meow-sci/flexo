import { useState } from 'react'
import { PackageOpen } from 'lucide-react'
import { openImportModel } from '../state/customAssetStore'

/**
 * Drag a `.glb` (or a `.gltf` + its sidecars) onto the 3D workspace to import it — the entry
 * point users try first, and the fastest one. Wraps {@link ViewportCanvas} so the drop area is
 * exactly the 3D view: the toolbars, inspector and dialogs are siblings ABOVE this box, so a
 * drop on one of them never lands here (and the texture dialog's own image drop zone keeps
 * working).
 *
 * Deliberately a React wrapper, not something inside the three.js layer: these are plain DOM
 * drag events on a div, `src/three/` owns no UI, and the drop just opens
 * {@link ImportModelDialog} with the files — nothing is imported until the user confirms.
 *
 * `dragover` MUST call `preventDefault()` or the browser refuses the drop (and navigates to
 * the file instead). Drags that carry no file at all (text, a gizmo, a page element) are
 * ignored so normal editor dragging is unaffected.
 */
export function ViewportDropZone({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false)

  /** True only for an OS file drag — `types` is all we're allowed to read during dragover. */
  const carriesFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')

  return (
    <div
      className="absolute inset-0"
      onDragOver={(e) => {
        if (!carriesFiles(e)) return
        e.preventDefault() // required for `drop` to fire at all
        e.dataTransfer.dropEffect = 'copy'
        if (!active) setActive(true)
      }}
      onDragLeave={(e) => {
        // Only the drag leaving the zone itself counts; moving between children re-enters.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setActive(false)
      }}
      onDrop={(e) => {
        if (!carriesFiles(e)) return
        e.preventDefault()
        setActive(false)
        const files = Array.from(e.dataTransfer.files)
        // No model in the drop ⇒ not ours. Say nothing and let the user try again; the
        // dialog's own drop zone is where a mistaken file gets an explanation.
        if (!files.some(isModelFile)) return
        openImportModel(files)
      }}
    >
      {children}
      {active && (
        <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent/10">
          <span className="flex items-center gap-2 rounded-lg bg-panel-raised/90 px-3 py-2 text-sm text-fg shadow-popover">
            <PackageOpen size={18} />
            Drop to import a model
          </span>
        </div>
      )}
    </div>
  )
}

/** The entry files `loadModelFile` accepts (sidecars ride along but never trigger a drop). */
function isModelFile(file: File): boolean {
  return /\.(glb|gltf)$/i.test(file.name)
}
