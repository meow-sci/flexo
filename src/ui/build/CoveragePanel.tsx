import { useStore } from '@nanostores/react';
import { Button, SectionTitle, Switch } from '../kit';
import {
  $colliderSettings,
  $coverageReport,
  clearCoverageReport,
  requestCoverageCheck,
  setColliderSettings,
} from '../../state/colliderStore';

/**
 * On-demand "how good is my approximation?" readout for the WHOLE collision volume (not
 * just the selected shape) — v1's `CoveragePanel` verbatim. Manual rather than live: a
 * vertex-precision sample of a real part is tens of thousands of points tested against every
 * collider.
 *
 * Gaps and bloat pull in opposite directions — geometry outside every collider clips through
 * the world, while collider volume far beyond the mesh is an invisible wall AND inflates the
 * vehicle bounding box KSA derives from the collider compound.
 *
 * Two homes, one component (design: design-build-mode.md §3.4, §3.10): a section inside the
 * collider focus card, and the **tool parameter card** at the top of the left sidebar when
 * `Tools ▸ Collider Coverage Check` is run with no collider selected.
 *
 * **Undo enrollment: NONE.** The report is ephemeral and the precision knob is persisted
 * view state (`flexo:colliders`).
 */
export function CoveragePanel({ standalone = false }: { standalone?: boolean }) {
  const report = useStore($coverageReport);
  const settings = useStore($colliderSettings);
  const pct = report ? Math.round(report.fraction * 1000) / 10 : 0;
  const missing = report ? report.sampled - report.covered : 0;

  return (
    <div
      className={
        standalone ? 'flex flex-col gap-0.5' : 'flex flex-col gap-0.5 border-t border-border pt-1'
      }
    >
      <div className="flex items-center justify-between gap-2">
        {standalone ? (
          <SectionTitle>Collider coverage</SectionTitle>
        ) : (
          <span className="text-xs text-fg-subtle">Coverage</span>
        )}
        <div className="flex items-center gap-1">
          {report && (
            <Button size="sm" variant="ghost" onPress={() => clearCoverageReport()}>
              Clear
            </Button>
          )}
          <Button size="sm" variant="ghost" onPress={() => requestCoverageCheck()}>
            Check
          </Button>
        </div>
      </div>
      {report && (
        <>
          <span className={missing === 0 ? 'text-xs text-fg-subtle' : 'text-xs text-warn'}>
            {pct}% of {report.sampled} sample points covered
            {missing > 0 && ` — ${missing} outside every collider`}
          </span>
          {report.bloat != null && (
            <span className="text-xs text-fg-subtle">
              Collider volume {report.bloat.toFixed(2)}× the mesh bounds
            </span>
          )}
          {report.uncovered.length > 0 && (
            <span className="text-xs text-fg-subtle">Gaps marked in red in the viewport.</span>
          )}
        </>
      )}
      {/* Bounding-box corners are 8 points per mesh — fast, but far too coarse to trust a
          coverage number from. Per-vertex walks the whole buffer and is the honest answer.
          Also drives fitting, where it matters for rotated/irregular geometry. */}
      <Switch
        isSelected={settings.precision === 'vertex'}
        onChange={(on) => setColliderSettings({ precision: on ? 'vertex' : 'bbox' })}
      >
        <span className="text-xs text-fg-subtle">Sample every vertex (slower, accurate)</span>
      </Switch>
    </div>
  );
}
