import { useStore } from '@nanostores/react';
import { AlertTriangle } from 'lucide-react';
import { Tooltip, cn } from '../kit';
import { StatusChip, StatusChipButton, StatusDivider } from './StatusChip';
import {
  $activeEngineEntry,
  $engineFindings,
  engineEntryShortLabel,
  focusEngineIssue,
} from '../../state/engineStore';
import { $mode } from '../../state/modeStore';

/**
 * The status bar's **Engine segment** — `engine: ThrusterA · ⚠ 0 block · 1 warn →` (design:
 * design-data-engine-modes.md §B3.3 last line, decision D4; foundation §5 "mode-specific
 * segments").
 *
 * Mounted only while `$mode === 'engine'`, exactly like {@link import('./DataSegment')}. The
 * issue chip is ABSENT when the engine is clean, and clicking it clicks through to the first
 * blocker (or, with no blocker, the first warning) via the SAME `focusEngineIssue` the ISSUES
 * section uses — one behaviour, two entrances.
 *
 * **Undo enrollment: NONE.**
 */
export function EngineSegment() {
  const mode = useStore($mode);
  const entry = useStore($activeEngineEntry);
  const findings = useStore($engineFindings);

  if (mode !== 'engine') return null;

  const blocks = findings.filter((f) => f.severity === 'block');
  const first = blocks[0] ?? findings[0];
  const label = `${blocks.length} block · ${findings.length - blocks.length} warn`;

  return (
    <>
      <StatusDivider />
      <StatusChip>
        <span className="text-fg-subtle">engine:</span>
        <span className="max-w-[18ch] truncate text-fg">
          {entry ? engineEntryShortLabel(entry) : 'none'}
        </span>
      </StatusChip>
      {first && (
        <Tooltip content={first.message}>
          <StatusChipButton
            aria-label={`Engine issues: ${label}. Go to the first one.`}
            onPress={() => focusEngineIssue(first)}
          >
            <AlertTriangle
              size={12}
              className={cn(blocks.length > 0 ? 'text-danger' : 'text-warning')}
            />
            <span className="font-mono tabular-nums">{label}</span>
            <span className="text-fg-subtle">→</span>
          </StatusChipButton>
        </Tooltip>
      )}
    </>
  );
}
