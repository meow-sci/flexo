import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { AlertTriangle, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { cn, isPhoneViewport } from '../kit';
import { openInspectorSheet } from '../shell/phone/phoneSheets';
import { FindingsList } from '../data/FindingsList';
import { $engineFindings, focusEngineIssue } from '../../state/engineStore';

/**
 * **The ISSUES section** — always mounted in the Engine navigator (design:
 * design-data-engine-modes.md §B3.3, decision D4).
 *
 * "Always" is the whole point. v1 rendered its findings list only inside the Part Data modal
 * and the Export dialog, so the one place you would most want to be told *"KSA would refuse
 * to load this"* — the designer itself — never said anything, and blockers were discovered at
 * export time (census pain 3). Here it shows **`✓ no issues`** when clean, which is what turns
 * silence into confidence rather than into doubt.
 *
 * The list body is `FindingsList`, shared verbatim with Data mode's validation strip, so the
 * block/warn wording can never fork. Clicking a finding runs `focusEngineIssue`: open its
 * scope, focus its module, and flash the field when the code is field-addressable.
 *
 * **Undo enrollment: NONE.** Reading and navigating only.
 */
export function IssuesSection() {
  const findings = useStore($engineFindings);
  const [open, setOpen] = useState(true);

  const blocks = findings.filter((f) => f.severity === 'block').length;
  const warns = findings.length - blocks;
  const clean = findings.length === 0;

  return (
    <div className="flex shrink-0 flex-col border-t border-border pt-1">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-1 px-1 py-0.5 text-left text-xs hover:bg-wash-hover"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {clean ? (
          <Check size={12} className="shrink-0 text-fg-subtle" />
        ) : (
          <AlertTriangle
            size={12}
            className={cn('shrink-0', blocks > 0 ? 'text-danger' : 'text-warning')}
          />
        )}
        <span className="min-w-0 flex-1 truncate text-fg-muted">
          {clean ? 'Issues — no issues' : `Issues — ${blocks} block · ${warns} warn`}
        </span>
        {!clean && (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
      </button>
      {!clean && open && (
        <div className="max-h-40 overflow-auto px-1 pb-1">
          {/* The jump's DESTINATION — the module editor — is the Inspector sheet on a phone,
              so focusing without opening it changed `aria-selected` and nothing else: the tap
              read as dead. Same pairing the module rows do. */}
          <FindingsList
            findings={findings}
            onSelect={(finding) => {
              focusEngineIssue(finding);
              if (isPhoneViewport()) openInspectorSheet();
            }}
          />
        </div>
      )}
    </div>
  );
}
