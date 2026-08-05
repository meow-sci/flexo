import { TransformGroups } from './TransformGroups';
import type { KittenInstance } from '../../ksa/types';

/**
 * The kitten focus card (design: design-build-mode.md §3.7) — transform groups and one
 * caption, because that is genuinely all a kitten has.
 *
 * A kitten is an **editor-only visual aide** (a scale/placement reference), never part
 * geometry: the serializer walks `placements`/`connectors`/`gameData` only, so kittens are
 * excluded from export for free. v1 had no kitten panel at all — a lone selected kitten
 * showed nothing — so this closes a census gap rather than porting one.
 *
 * **Undo enrollment**: streaming only (the numeric fields push once on focus).
 */
export function KittenInspector({ kitten, locked }: { kitten: KittenInstance; locked: boolean }) {
  return (
    <>
      <TransformGroups
        transform={kitten}
        entityName={kitten.id}
        locked={locked}
        third={{ kind: 'scale' }}
      />
      <p className="text-xs leading-snug text-fg-subtle">
        Editor-only aide — never exported. Convert with <b>Add ▸ Make Kitten Mesh</b>.
      </p>
    </>
  );
}
