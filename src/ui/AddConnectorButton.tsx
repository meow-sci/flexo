import { ToolbarButton, toast } from './kit'
import { addConnector } from '../state/editorStore'

/** Top-surface "+ Connector" action: drops a connector at the origin and selects it. */
export function AddConnectorButton() {
  return (
    <ToolbarButton
      onPress={() => {
        addConnector()
        toast({ title: 'Connector Added' }, { timeout: 2500 })
      }}
    >
      + Connector
    </ToolbarButton>
  )
}
