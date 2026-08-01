import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { Settings } from 'lucide-react';
import {
  Button,
  Menu,
  MenuHeader,
  MenuItem,
  MenuSection,
  MenuSeparator,
  MenuTrigger,
  Popover,
} from '../../../src/ui/kit';
import { LightingDialog } from './LightingDialog';
// $measurements here is the MINI APP's session atom (./settings), never the
// editor's same-named store in src/state/measurementStore.
import { $connectors, $measurements, resetPreviewSettings } from './settings';

/**
 * The preview's settings cog, third button in the floating control bar.
 *
 * Writes ONLY to the session atoms in `./settings` — the viewport subscribes to
 * them itself, so nothing here ever touches a `PartPreviewViewport` method (and
 * never the persistent `$lighting` / `$connectorSettings` of the main editor,
 * which share this origin).
 *
 * Deliberately flat: no submenus (a submenu has nowhere to go in a 200×200
 * iframe — react-aria flips it back on top of its parent) and no inline sliders
 * (a react-aria `Menu` owns pointer/keyboard for its items, so interactive
 * non-item content inside the collection is unsupported). Everything about the
 * environment — which one, and whether its sky is visible — lives in
 * {@link LightingDialog} alongside the numeric knobs, so this menu stays two
 * toggles tall.
 */
export function SettingsMenu() {
  const connectors = useStore($connectors);
  const measurements = useStore($measurements);
  const [lightingOpen, setLightingOpen] = useState(false);

  // Pure render-body derivation — cheap, and what React Compiler memoizes.
  const shown = new Set<string>();
  if (connectors) shown.add('connectors');
  if (measurements) shown.add('measure');

  return (
    <>
      <MenuTrigger>
        <Button size="sm" iconOnly variant="secondary" aria-label="Preview settings">
          <Settings size={14} />
        </Button>
        {/* Opens UPWARD: the trigger sits at the bottom of the viewport. The
            react-aria default containerPadding of 12 would waste 24px of a
            200px-wide iframe. */}
        <Popover placement="top end" containerPadding={4} className="w-40">
          <Menu
            className="p-0.5"
            // Toggling a setting shouldn't dismiss the menu…
            shouldCloseOnSelect={false}
            // …but Escape must still close it. The default 'clearSelection'
            // makes Escape stopPropagation() + clear the selection instead
            // whenever the collection has one (react-aria useSelectableCollection).
            escapeKeyBehavior="none"
          >
            <MenuSection
              selectionMode="multiple"
              selectedKeys={shown}
              onSelectionChange={(keys) => {
                // `Selection` is 'all' | Set<Key> — narrow before asking .has().
                const s = keys === 'all' ? new Set(['connectors', 'measure']) : keys;
                $connectors.set(s.has('connectors'));
                $measurements.set(s.has('measure'));
              }}
            >
              <MenuHeader>Show</MenuHeader>
              <MenuItem id="connectors" className="gap-1.5 px-1.5 py-1 text-xs">
                Connectors
              </MenuItem>
              <MenuItem id="measure" className="gap-1.5 px-1.5 py-1 text-xs">
                Measurements
              </MenuItem>
            </MenuSection>

            <MenuSeparator />

            <MenuItem
              id="lighting"
              shouldCloseOnSelect
              className="gap-1.5 px-1.5 py-1 text-xs"
              onAction={() => setLightingOpen(true)}
            >
              Lighting…
            </MenuItem>
            {/* Restores what this embed was ASKED for (?skybox_id/?connectors/?measure),
                not DEFAULT_LIGHTING — see resetPreviewSettings. */}
            <MenuItem
              id="reset"
              shouldCloseOnSelect
              className="gap-1.5 px-1.5 py-1 text-xs"
              onAction={resetPreviewSettings}
            >
              Reset settings
            </MenuItem>
          </Menu>
        </Popover>
      </MenuTrigger>
      {/* Rendered unconditionally so the hook order can never change; react-aria
          handles the mount/unmount off `isOpen`. */}
      <LightingDialog isOpen={lightingOpen} onOpenChange={setLightingOpen} />
    </>
  );
}
