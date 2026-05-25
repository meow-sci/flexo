import { ToolbarButton } from '@cladd-ui/react'
import { addConnector } from '../state/editorStore'

/** Top-surface "+ Connector" action: drops a connector at the origin and selects it. */
export function AddConnectorButton() {
  return <ToolbarButton onClick={() => addConnector()}>+ Connector</ToolbarButton>
}
