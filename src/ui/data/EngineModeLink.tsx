import { ArrowRight } from 'lucide-react';
import { setMode } from '../../state/modeStore';

/**
 * The D11 cross-links: engine hardware is reachable from BOTH Data mode and Engine mode, and
 * that is the *one* deliberate overlap the dual-routes ledger keeps (design: §A4.1 Wiring /
 * Advanced, §A4.2 Engine, decision D11). Both routes render the same editors, so the link is
 * a navigation aid, not a second surface: it says "this hardware has a fuller home".
 *
 * Payload shape matches Engine mode's entry hook (`{engineScope}`), consumed in P7.
 *
 * **Undo enrollment: NONE** — a mode switch is never an undo step (foundation §2.3).
 */
export type EngineScopePayload = { kind: 'part' } | { kind: 'sub'; templateId: string };

/** Compact header link ("Open in Engine mode →") for a section header's trailing slot. */
export function EngineModeLink({ scope }: { scope: EngineScopePayload }) {
  return (
    <button
      type="button"
      className="inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded px-1 text-[11px] text-fg-muted hover:text-fg"
      onClick={() => setMode('engine', { engineScope: scope })}
    >
      <span>Engine mode</span>
      <ArrowRight size={11} />
    </button>
  );
}

/** The in-body banner variant ("This hardware is also editable in Engine mode →"). */
export function EngineModeBanner({ scope, text }: { scope: EngineScopePayload; text: string }) {
  return (
    <button
      type="button"
      className="flex cursor-pointer items-center gap-1 rounded-md border border-border bg-panel-sunken px-2 py-1 text-left text-[11px] text-fg-muted hover:border-border-strong hover:text-fg"
      onClick={() => setMode('engine', { engineScope: scope })}
    >
      <span className="min-w-0 flex-1">{text}</span>
      <ArrowRight size={11} className="shrink-0" />
    </button>
  );
}
