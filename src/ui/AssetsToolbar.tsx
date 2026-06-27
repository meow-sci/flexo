import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { Boxes, Clapperboard, Rocket } from 'lucide-react'
import { Toolbar, Button } from './kit'
import { $part } from '../state/editorStore'
import { setInspectorMode } from '../state/uiStore'
import { $engineTemplateIds } from '../state/engineStore'
import { LayersButton } from './LayersButton'
import { CustomAssetsModal } from './CustomAssetsModal'

/**
 * Toolbar above the Assets list. Holds the Layers button (stretches to fill,
 * shows the layer count + active layer), a "Custom (N)" button that opens the
 * custom-assets management modal (N = custom meshes + uploaded textures), and an
 * "Anim (N)" button that swaps the inspector to the full-sidebar Animation editor.
 */
export function AssetsToolbar() {
  const part = useStore($part)
  const engineTemplateIds = useStore($engineTemplateIds)
  const [customOpen, setCustomOpen] = useState(false)
  const customCount = part.customTextures.length + part.customMeshes.length
  const animCount = part.animations.length
  const engineCount = engineTemplateIds.length

  return (
    <>
      <Toolbar aria-label="Assets">
        <div className="min-w-0 flex-1">
          <LayersButton />
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          onPress={() => setCustomOpen(true)}
        >
          <Boxes size={16} className="shrink-0" />
          Custom ({customCount})
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          onPress={() => setInspectorMode('engine')}
        >
          <Rocket size={16} className="shrink-0" />
          Engine{engineCount ? ` (${engineCount})` : ''}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          onPress={() => setInspectorMode('anim')}
        >
          <Clapperboard size={16} className="shrink-0" />
          Anim{animCount ? ` (${animCount})` : ''}
        </Button>
      </Toolbar>
      <CustomAssetsModal isOpen={customOpen} onOpenChange={setCustomOpen} />
    </>
  )
}
