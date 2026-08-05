import type { Command } from '../../state/commandStore';
import {
  $activeLayerId,
  clearSelection,
  invertSelection,
  selectAllEntities,
  selectLayerEntities,
  setActiveLayer,
} from '../../state/editorStore';
import { $layerSummaries } from '../../state/selectors';

/**
 * Select menu commands (design: foundation §3 "Select").
 *
 * Selection is view state: nothing here enrolls in undo (`src/state/editorStore.ts`
 * invariant block).
 *
 * The chords for All / Deselect / Invert are viewport-scoped in the final design, so they
 * are NOT bound in the flat v1 registry — the commands exist (menu + palette) and the
 * scoped registry adds their chords.
 */
export const SELECT_COMMANDS: Command[] = [
  {
    id: 'select.all',
    title: 'All',
    menuPath: 'Select',
    keywords: 'select all everything',
    run: () => selectAllEntities(),
  },
  {
    id: 'select.none',
    title: 'Deselect',
    menuPath: 'Select',
    keywords: 'deselect none clear selection',
    run: () => clearSelection(),
  },
  {
    id: 'select.invert',
    title: 'Invert',
    menuPath: 'Select',
    keywords: 'invert flip selection',
    run: () => invertSelection(),
  },
  {
    id: 'select.activeLayer',
    title: 'All in Active Layer',
    menuPath: 'Select',
    keywords: 'layer select current active',
    run: () => selectLayerEntities($activeLayerId.get()),
  },
  {
    id: 'tool.marquee',
    title: 'Box Select',
    menuPath: 'Select',
    keywords: 'marquee box rubber band drag select',
    enabled: () => false,
    disabledReason: 'Box select arrives with the Build-mode rework',
    run: () => {},
  },
];

/** `Select ▸ By Layer` — one row per layer, in display order. */
export function layerSelectCommands(): Command[] {
  return $layerSummaries.get().map((summary) => ({
    id: `layer:select:${summary.id}`,
    title: summary.layer.name,
    menuPath: 'Select ▸ By Layer',
    keywords: 'layer select entities',
    run: () => selectLayerEntities(summary.id),
  }));
}

/**
 * Palette-only rows: "Activate layer: X". There is no menubar item for making a layer
 * active (the Outliner owns that gesture) but it is exactly the kind of thing ⌘K is for —
 * and `keepOpen` supports flipping through layers without reopening the palette.
 */
export function layerActivateCommands(): Command[] {
  return $layerSummaries.get().map((summary) => ({
    id: `layer:activate:${summary.id}`,
    title: `Activate layer: ${summary.layer.name}`,
    keywords: 'layer active current switch',
    keepOpen: true,
    run: () => setActiveLayer(summary.id),
  }));
}
