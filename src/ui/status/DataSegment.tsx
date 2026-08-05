import { useStore } from '@nanostores/react';
import { AlertTriangle } from 'lucide-react';
import { Tooltip, cn } from '../kit';
import { StatusChip, StatusChipButton, StatusDivider } from './StatusChip';
import { $dataScope, $gameDataFindings, focusFinding } from '../../state/dataModeStore';
import { $mode } from '../../state/modeStore';

/**
 * The status bar's **Data segment** — `scope: Part · ⚠ 1 block →` (design:
 * design-data-engine-modes.md §A7 / decision D4; foundation §5 "mode-specific segments").
 *
 * Mounted only while `$mode === 'data'`, like the layer chip is mounted only in Build and
 * Animation. The issue chip is ABSENT when the part is clean, and clicking it clicks through
 * to the first blocker (or, with no blocker, the first warning) through the SAME
 * `focusFinding` the navigator's validation strip uses — one behaviour, two entrances.
 *
 * **Undo enrollment: NONE.** Reading and navigating only.
 */
export function DataSegment() {
  const mode = useStore($mode);
  const scope = useStore($dataScope);
  const findings = useStore($gameDataFindings);

  if (mode !== 'data') return null;

  const blocks = findings.filter((f) => f.severity === 'block');
  const first = blocks[0] ?? findings[0];
  const label = blocks.length > 0 ? `${blocks.length} block` : `${findings.length} warn`;

  return (
    <>
      <StatusDivider />
      <StatusChip>
        <span className="text-fg-subtle">scope:</span>
        <span className="max-w-[18ch] truncate text-fg">
          {scope.kind === 'part' ? 'Part' : scope.templateId}
        </span>
      </StatusChip>
      {first && (
        <Tooltip content={first.message}>
          <StatusChipButton
            aria-label={`Data issues: ${label}. Go to the first one.`}
            onPress={() => focusFinding(first)}
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
