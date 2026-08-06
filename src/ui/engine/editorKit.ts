import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $moduleFlash } from '../../state/engineStore';
import type { EditingPart, SubPartGameData } from '../../ksa/types';

/**
 * The handful of things every module editor in `src/ui/engine/*` needs: the unit conversion,
 * the two clamps, the owner-list resolver, and the field-flash hook.
 *
 * It exists so the editors can be **scope-agnostic**. Each one takes `templateId` — a SubPart
 * template id, or `null` for `<PartGameData>` — and dispatches to the matching action family.
 * That is what lets Engine mode and Data mode render the SAME component (decision D11: "the
 * two views can never diverge in capability") instead of two parallel field sets.
 *
 * **Undo enrollment: NONE.** Nothing here mutates the document.
 */

/** Bar ⇄ Pa for every pressure field (stored SI Pa, authored in bar — census invariant). */
export const PA_PER_BAR = 1e5;

/** The `(none)` Select sentinel (census invariant: sentinels preserved). */
export const NONE = '\0none';

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** KSA reads `MinimumThrottle` as a fraction; 1.0 means on/off only, 0 would mean "never on". */
export const clampThrottle = (n: number) => Math.min(1, Math.max(0.01, n));

/** The `<SubPartGameData>` a template id names, or undefined. */
export function spdOf(part: EditingPart, templateId: string): SubPartGameData | undefined {
  return part.subPartGameData.find((s) => s.subPartTemplateId === templateId);
}

/**
 * The engine-module owner a `templateId` addresses: that template's `<SubPartGameData>`, or
 * `<PartGameData>` when it is null. Undefined when the template carries no data yet — the
 * editors render nothing rather than inventing an entry (creation is the store's job).
 */
export function ownerOf(
  part: EditingPart,
  templateId: string | null,
): SubPartGameData | EditingPart['gameData'] | undefined {
  return templateId === null ? part.gameData : spdOf(part, templateId);
}

/** How many placements a template has — how many real thrusters one SubPart-owned nozzle drives. */
export function instanceCountOf(part: EditingPart, templateId: string | null): number {
  if (templateId === null) return 1;
  return part.placements.filter((p) => p.subPartTemplateId === templateId).length;
}

/** How long a flashed field stays lit. Matches the Data-mode card flash and the Outliner row. */
const FLASH_MS = 1000;

/**
 * Subscribes one field to the ISSUES click-through's flash intent (design §B3.3): clicking a
 * field-addressable finding focuses its module and lights the offending field.
 *
 * The intent is nonce'd, so clicking the SAME finding twice re-flashes — which is exactly the
 * case a plain boolean would swallow. The state write happens inside the animation frame, never
 * in the effect body (the pattern `useSectionJump` established).
 */
export function useFieldFlash(fieldKey: string): boolean {
  const flash = useStore($moduleFlash);
  const [lit, setLit] = useState<number | null>(null);
  const nonce = flash?.key === fieldKey ? flash.nonce : null;

  useEffect(() => {
    if (nonce === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const raf = requestAnimationFrame(() => {
      setLit(nonce);
      timer = setTimeout(() => setLit(null), FLASH_MS);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [nonce]);

  return lit !== null && lit === nonce;
}
