import { useStore } from '@nanostores/react'
import { Trash2, Plus } from 'lucide-react'
import { Button } from './kit'
import { $part, addSubPart } from '../state/editorStore'
import {
  $customTextureUrls,
  removeCustomTexture,
  removeCustomMesh,
} from '../state/customAssetStore'

/**
 * Workspace list of the project's custom assets: uploaded textures (with a
 * thumbnail) and created primitive meshes. Each can be deleted; a mesh can be
 * re-placed in the scene. Hidden entirely when the project has no custom assets.
 */
export function CustomAssetsPanel() {
  const part = useStore($part)
  const thumbs = useStore($customTextureUrls)
  const { customTextures, customMeshes } = part
  if (customTextures.length === 0 && customMeshes.length === 0) return null

  return (
    <div className="flex flex-col gap-2 border-b border-border p-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Custom assets</div>

      {customTextures.length > 0 && (
        <div className="flex flex-col gap-1">
          {customTextures.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-md px-1 py-0.5 text-sm">
              <span className="h-7 w-7 shrink-0 overflow-hidden rounded border border-border bg-panel-sunken">
                {thumbs[t.id] && (
                  <img src={thumbs[t.id]} alt={t.name} className="h-full w-full object-cover" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate" title={`${t.name} (${t.width}×${t.height})`}>
                {t.name}
              </span>
              <Button
                size="sm"
                variant="danger-ghost"
                aria-label={`Delete texture ${t.name}`}
                onPress={() => removeCustomTexture(t.id)}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
      )}

      {customMeshes.length > 0 && (
        <div className="flex flex-col gap-1">
          {customMeshes.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-md px-1 py-0.5 text-sm">
              <span className="min-w-0 flex-1 truncate" title={m.subPartId}>
                {m.name} <span className="text-xs text-fg-muted">({m.primitive.kind})</span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Add ${m.name} to scene`}
                onPress={() => addSubPart(m.subPartId)}
              >
                <Plus size={14} />
              </Button>
              <Button
                size="sm"
                variant="danger-ghost"
                aria-label={`Delete mesh ${m.name}`}
                onPress={() => void removeCustomMesh(m.id)}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
