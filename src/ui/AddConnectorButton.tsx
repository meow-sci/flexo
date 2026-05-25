import { ToolbarButton, useToast } from '@cladd-ui/react'
import { addConnector } from '../state/editorStore'

/** Top-surface "+ Connector" action: drops a connector at the origin and selects it. */
export function AddConnectorButton() {
  const toast = useToast()
  return (
    <ToolbarButton onClick={() => { addConnector(); toast({ title: 'Connector Added', timeout: 2500 }) }}>
      + Connector
    </ToolbarButton>
  )
}
