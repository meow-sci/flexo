import { ToolbarButton } from './kit';
import { openDialog } from '../state/dialogStore';

/**
 * INTERIM v1 toolbar trigger for the Part Data dialog, which is now root-hosted under the
 * `dialogStore` id `'part-data'` (the dialog itself lives in `./PartDataDialog`). The
 * menubar replaces this button and this whole file is deleted with the old toolbar.
 */
export function PartDataButton() {
  return <ToolbarButton onPress={() => openDialog({ id: 'part-data' })}>Part Data</ToolbarButton>;
}
