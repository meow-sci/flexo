import { AlertTriangle } from 'lucide-react';
import { DisclosureSection } from '../kit';
import { groupWarnings, type WarningSeverity } from '../../ksa/importEstimates';
import type { ImportReport } from '../../state/customAssetStore';

/**
 * What one completed model import or replace actually did — **the v1 `ImportReportCard`'s
 * body, verbatim**, now living in the notification center (design §2.5; census:
 * shell-layout.md §1.12).
 *
 * WHY IT IS NOT A ONE-LINE MESSAGE — the card's original rationale, unchanged: an import is
 * a big multi-part document mutation (a layer, N SubParts, N placements, N textures, N
 * materials) and a REPLACE additionally DESTROYS SubParts. *Which ones* is precisely what
 * the user has to be able to read, so the removed list is named in full and **never
 * truncated or collapsed to a count**.
 *
 * The move is strictly better than the card it replaces: v1's card was overwritten by the
 * next import (and covered by any toast that happened to land in the same corner), whereas
 * every report is now its own sticky entry — a history of the last imports, dismissed one at
 * a time and surviving "Clear all".
 */
export function ImportReportBody({ report }: { report: ImportReport }) {
  const replace = report.mode === 'replace';
  const warnings = groupWarnings(report.warnings);
  const warningCount = warnings.reduce((n, g) => n + g.items.length, 0);
  const worst: WarningSeverity | undefined = warnings[0]?.severity;

  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
        {replace && <Row label="Kept" value={String(report.matched ?? 0)} />}
        <Row label={replace ? 'Added' : 'SubParts'} value={String(report.subParts)} />
        <Row label="Placements" value={String(report.placements)} />
        <Row label="Textures" value={String(report.textures)} />
        <Row label="Materials" value={String(report.materials)} />
        {replace && <Row label="Removed" value={String(report.removed?.length ?? 0)} />}
      </dl>

      {/* The removed SubParts are named, never just counted: their geometry is gone from the
          new file, so the user has to know which pieces (and their placements) went with it. */}
      {report.removed && report.removed.length > 0 && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs leading-snug text-warning">
          <span className="font-medium">Removed (not in the new file):</span>{' '}
          {report.removed.join(', ')}
        </p>
      )}

      {warningCount > 0 && (
        <DisclosureSection
          title="What KSA can't represent"
          badge={String(warningCount)}
          defaultExpanded={false}
        >
          {warnings.map((group) => (
            <div key={group.subject} className="flex flex-col gap-0.5 text-xs">
              <span className="flex items-center gap-1 font-medium">
                {worst !== 'info' && <AlertTriangle size={12} className="shrink-0" />}
                {group.subject}
              </span>
              {group.items.map((warning) => (
                <span
                  key={`${warning.code}|${warning.subject}`}
                  className="leading-snug text-fg-muted"
                >
                  {warning.message}
                </span>
              ))}
            </div>
          ))}
        </DisclosureSection>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}
