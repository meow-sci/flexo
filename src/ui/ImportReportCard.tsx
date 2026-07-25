import { useStore } from '@nanostores/react'
import { AlertTriangle, PackageCheck, RefreshCw, X } from 'lucide-react'
import { Button, DisclosureSection } from './kit'
import { $importReport, dismissImportReport, type ImportReport } from '../state/customAssetStore'
import { groupWarnings, type WarningSeverity } from '../ksa/importEstimates'

/**
 * The post-import summary: what the last import or replace actually created, matched and
 * removed, plus every warning that was not blocking.
 *
 * WHY A CARD AND NOT A TOAST: an import is a big, multi-part document mutation (a layer, N
 * SubParts, N placements, N textures, N materials) and a REPLACE additionally destroys SubParts
 * — "which ones" is exactly the thing a user needs to read, and a toast holds one truncated
 * line. So this is a small dismissible card in the toast corner that STAYS until dismissed.
 *
 * It must never get in the way: `pointer-events-none` on the wrapper (only the card itself is
 * interactive), no autofocus, no modal, and it sits above the viewport rather than inside it.
 * It clears itself when the user starts another import — the store overwrites `$importReport`.
 */
export function ImportReportCard() {
  const report = useStore($importReport)
  if (!report) return null
  return <ReportBody key={report.id} report={report} />
}

function ReportBody({ report }: { report: ImportReport }) {
  const replace = report.mode === 'replace'
  const warnings = groupWarnings(report.warnings)
  const warningCount = warnings.reduce((n, g) => n + g.items.length, 0)
  const worst: WarningSeverity | undefined = warnings[0]?.severity

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-40 flex justify-end sm:inset-x-auto sm:right-3">
      <div className="pointer-events-auto flex max-h-[60vh] w-full flex-col gap-2 overflow-y-auto rounded-xl border border-border bg-panel/95 p-3 text-fg shadow-popover backdrop-blur-md sm:w-80">
        <div className="flex items-start gap-2">
          {replace ? (
            <RefreshCw size={16} className="mt-0.5 shrink-0 text-accent" />
          ) : (
            <PackageCheck size={16} className="mt-0.5 shrink-0 text-accent" />
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium">
              {replace ? 'Model replaced' : 'Model imported'}
            </span>
            <span className="truncate text-xs text-fg-subtle" title={report.fileName}>
              {report.fileName}
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            aria-label="Dismiss"
            onPress={dismissImportReport}
          >
            <X size={14} />
          </Button>
        </div>

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
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  )
}
