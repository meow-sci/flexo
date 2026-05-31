import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { Boxes } from 'lucide-react'
import { Toolbar, Button } from './kit'
import { $part } from '../state/editorStore'
import { LayersButton } from './LayersButton'
import { CustomAssetsModal } from './CustomAssetsModal'

/**
 * Toolbar above the Assets list. Holds the Layers button (stretches to fill,
 * shows the layer count + active layer) and a "Custom (N)" button that opens the
 * custom-assets management modal (N = custom meshes + uploaded textures).
 */
export function AssetsToolbar() {
  const part = useStore($part)
  const [customOpen, setCustomOpen] = useState(false)
  const customCount = part.customTextures.length + part.customMeshes.length

  return (
    <>
      <Toolbar aria-label="Assets">
        <div className="min-w-0 flex-1">
          <LayersButton />
        </div>
        <Button size="sm" variant="secondary" className="shrink-0" onPress={() => setCustomOpen(true)}>
          <Boxes size={16} className="shrink-0" />
          Custom ({customCount})
        </Button>
      </Toolbar>
      <CustomAssetsModal isOpen={customOpen} onOpenChange={setCustomOpen} />
    </>
  )
}
