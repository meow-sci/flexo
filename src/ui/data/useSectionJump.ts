import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $dataSectionJump, type DataSectionId } from '../../state/dataModeStore';

/** How long a jumped-to section (or card) stays lit. Matches the Outliner's row flash. */
const FLASH_MS = 1000;

export interface SectionJump {
  /**
   * Attach to the section's own element (`ref={jump.attach}`). A CALLBACK ref backed by
   * state, not a `useRef` object: the element is a real dependency of the scroll effect, and
   * a ref would be both an unusable dependency and a render-time ref read for the linter.
   */
  attach: (el: HTMLElement | null) => void;
  /** True while this section is the jump target — the caller force-expands on it. */
  targeted: boolean;
  /** True for ~1s after a jump lands: paint the flash. */
  flashing: boolean;
  /** The card the jump named, while the flash is live (`undefined` = the whole section). */
  cardKey: string | undefined;
}

/**
 * Subscribes one section to the shared section-jump intent (design:
 * design-data-engine-modes.md §A4 header, §A7 click-through).
 *
 * A matching nonce means "you are the target": the hook scrolls the section into view and
 * reports `targeted` (so the caller expands it) plus a ~1s `flashing` window, optionally
 * naming one `cardKey` inside it. The intent atom is nonce'd, so jumping to the SAME section
 * twice in a row re-fires — which is what makes a second click on a chip do something
 * visible.
 *
 * Expand/collapse state stays component-local and ephemeral by design (§A10: "section
 * collapse → none / not persisted; resets on reload — deliberate").
 */
export function useSectionJump(sectionId: DataSectionId): SectionJump {
  const jump = useStore($dataSectionJump);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [flash, setFlash] = useState<{ nonce: number; cardKey?: string } | null>(null);

  const isTarget = jump?.sectionId === sectionId;
  const nonce = isTarget ? jump.nonce : null;
  const cardKey = isTarget ? jump.cardKey : undefined;

  // Scrolling is a DOM side effect and the flash is a timed one, so both belong in an effect
  // (never the render body — Rules of React). One frame later, because `targeted` may have
  // just expanded the section and there would otherwise be nothing to scroll to; that also
  // keeps the state write out of the effect BODY, which is the pattern the Outliner's reveal
  // scroll established. The nonce in the dep list is what re-runs it for a repeat jump.
  useEffect(() => {
    if (nonce === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const raf = requestAnimationFrame(() => {
      el?.scrollIntoView({ block: 'nearest' });
      setFlash({ nonce, cardKey });
      timer = setTimeout(() => setFlash(null), FLASH_MS);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [nonce, cardKey, el]);

  return {
    attach: setEl,
    targeted: isTarget,
    flashing: flash !== null && flash.nonce === nonce,
    cardKey: flash?.cardKey,
  };
}
