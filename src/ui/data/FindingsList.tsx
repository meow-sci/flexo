import { SectionTitle, cn } from '../kit';

/**
 * The shared **findings list** — the block/warn split every validation surface renders
 * (design: design-data-engine-modes.md §A7, decision D4).
 *
 * The wording is v1's, verbatim: the two group headings are the only thing that tells a user
 * whether KSA will refuse the mod outright or merely load a part that misbehaves, and the
 * census marks that distinction as an invariant. Everything else about the surface — where
 * it is pinned, what chrome it wears — belongs to the host.
 *
 * Renders `null` when there is nothing to report, so a host can mount it unconditionally.
 *
 * **Undo enrollment: NONE.** `onSelect` navigates; it never mutates.
 */

export interface FindingsListItem {
  severity: 'block' | 'warn';
  message: string;
}

export function FindingsList<T extends FindingsListItem>({
  findings,
  onSelect,
}: {
  findings: readonly T[];
  /** Click-through: scope + jump + flash the offending card (design D4). */
  onSelect?: (finding: T) => void;
}) {
  if (findings.length === 0) return null;
  const blocking = findings.filter((f) => f.severity === 'block');
  const warnings = findings.filter((f) => f.severity === 'warn');
  return (
    <div className="flex flex-col gap-2">
      <FindingsGroup
        title={`KSA would refuse to load (${blocking.length})`}
        findings={blocking}
        tone="text-danger"
        onSelect={onSelect}
      />
      <FindingsGroup
        title={`Loads, but misbehaves (${warnings.length})`}
        findings={warnings}
        tone="text-warning"
        onSelect={onSelect}
      />
    </div>
  );
}

function FindingsGroup<T extends FindingsListItem>({
  title,
  findings,
  tone,
  onSelect,
}: {
  title: string;
  findings: readonly T[];
  tone: string;
  onSelect?: (finding: T) => void;
}) {
  if (findings.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <SectionTitle>{title}</SectionTitle>
      <ul className="flex list-disc flex-col gap-1 pl-4">
        {findings.map((finding, i) => (
          <li key={i} className={cn('text-[11px] leading-snug', tone)}>
            {onSelect ? (
              // A plain button, not a kit Button: the row IS the text, and the affordance is
              // the underline on hover — a filled control here would out-shout the message.
              <button
                type="button"
                className="cursor-pointer text-left hover:underline"
                onClick={() => onSelect(finding)}
              >
                {finding.message}
              </button>
            ) : (
              finding.message
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
