import { Armchair, Box, Cat, CircleDot, Frame, Lightbulb } from 'lucide-react';
import { Chip } from '../kit';
import type { EntityKind } from '../../state/editorStore';
import type { OutlinerRow } from './outlinerTree';

/**
 * One entity row's CONTENT — icon, name (with search highlight), sub line, badges
 * (design: design-build-mode.md §2.4). The surrounding `GridListItem` (keys, selection,
 * disabled/hidden state, the ⇧-range hook) belongs to {@link OutlinerPanel}, so this
 * component is pure presentation and stays trivially reusable by the phone sheet.
 *
 * P5A.15 adds the per-kind ⋮ menu to the right of this content; nothing here changes for it.
 */

const KIND_ICONS: Record<EntityKind, typeof Box> = {
  subpart: Box,
  connector: CircleDot,
  collider: Frame,
  ivaSeat: Armchair,
  light: Lightbulb,
  kitten: Cat,
};

export function EntityRow({ row, tint }: { row: OutlinerRow; tint?: string }) {
  const Icon = KIND_ICONS[row.kind];
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      {/* The layer's color as a 2px left edge — editor chrome only, never a 3D material. */}
      {tint && (
        <span aria-hidden className="-ml-1 h-6 w-0.5 rounded-full" style={{ background: tint }} />
      )}
      <Icon className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate text-xs${row.kind === 'connector' ? ' font-mono' : ''}`}>
          <Highlighted text={row.name} ranges={row.matchRanges} />
        </span>
        <span className="truncate text-[11px] text-fg-subtle">{row.sub}</span>
      </div>
      {row.badges.interior && (
        <Chip
          className="shrink-0"
          title="This SubPart template is <Internal> — drawn only in the interior (IVA) view."
        >
          int
        </Chip>
      )}
      {row.badges.lightType && (
        <span className="shrink-0 text-[11px] text-fg-subtle">{row.badges.lightType}</span>
      )}
      {row.badges.colliderShape && (
        <span className="shrink-0 text-[11px] text-fg-subtle">{row.badges.colliderShape}</span>
      )}
    </div>
  );
}

/**
 * The name with its fuzzy-match spans marked. `ranges` are half-open `[start, end)` indices
 * into `text` (the shared matcher's contract), ascending and non-overlapping, so a single
 * left-to-right walk renders them.
 */
export function Highlighted({ text, ranges }: { text: string; ranges: [number, number][] }) {
  if (ranges.length === 0) return text;
  const parts: { text: string; hit: boolean }[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push({ text: text.slice(cursor, start), hit: false });
    parts.push({ text: text.slice(start, end), hit: true });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false });
  // Positional keys are correct here: the list IS the string, split in reading order.
  return parts.map((part, i) =>
    part.hit ? (
      <mark key={i} className="bg-transparent font-semibold text-accent">
        {part.text}
      </mark>
    ) : (
      <span key={i}>{part.text}</span>
    ),
  );
}
