import { ToolbarButton } from './kit';
import { openDialog } from '../state/dialogStore';

/**
 * INTERIM v1 toolbar trigger for the Export dialog, which is now root-hosted under the
 * `dialogStore` id `'export-ksa'` (the dialog itself lives in `./ExportDialog`). The File
 * menu replaces this button and this whole file is deleted with the old toolbar.
 */
export function ExportButton() {
  return <ToolbarButton onPress={() => openDialog({ id: 'export-ksa' })}>Export</ToolbarButton>;
}
