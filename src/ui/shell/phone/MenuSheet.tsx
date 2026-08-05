import { Dialog, Sheet } from '../../kit';
import { MenuDrillDown } from '../../menu/MenuDrillDown';

/**
 * The phone's `☰` — the entire menubar as a 92-detent bottom sheet (design:
 * `plans/flexo_v2/design/foundation.md` §12). It adds no menu data of its own: the
 * drill-down inside renders `MENU_SPEC`, so every desktop menu item has a phone path by
 * construction and can never be forgotten when a menu changes.
 *
 * The sheet's `ModalOverlay` renders `null` while closed, so {@link MenuDrillDown} mounts
 * fresh on every open — which is what re-reads the `enabled` / `checked` / `dynamicTitle`
 * predicates and the dynamic providers, and what resets the drill-down to level 0.
 */
export interface MenuSheetProps {
  isOpen: boolean;
  onOpenChange(open: boolean): void;
}

export function MenuSheet({ isOpen, onOpenChange }: MenuSheetProps) {
  return (
    <Sheet isOpen={isOpen} onOpenChange={onOpenChange} detent="92" ariaLabel="Menu">
      <Dialog className="min-h-0 flex-1">
        <MenuDrillDown size="sm" className="flex-1" onDismiss={() => onOpenChange(false)} />
      </Dialog>
    </Sheet>
  );
}
