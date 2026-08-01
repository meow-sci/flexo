import {
  Grid3x3,
  Move3d,
  MoveHorizontal,
  Orbit,
  Rotate3d,
  Scale3d,
  type LucideIcon,
} from 'lucide-react';
import type { ChainOpKind } from '../../state/chainStore';

/**
 * The palette's command catalog — the only place a chain step kind is described for
 * humans. Kept beside the palette (not in `chainStore`) because labels, keywords and
 * icons are presentation: the store owns the semantics, this owns how you find them.
 *
 * `keywords` exist so the search matches how users think about a step ("circle",
 * "ring", "polar" all reach Radial Array) rather than only its formal label.
 *
 * Order is the palette's display order with the empty query: transform steps first
 * (they read as verbs on the current selection), array steps after (they multiply it).
 */
export interface ChainCommandDef {
  kind: ChainOpKind;
  label: string;
  /** One-line explanation shown under the label in the command list. */
  description: string;
  /** Extra search terms, lowercase — matched with the label by the palette filter. */
  keywords: string[];
  icon: LucideIcon;
}

export const CHAIN_COMMANDS: ChainCommandDef[] = [
  {
    kind: 'translate',
    label: 'Translate',
    description: 'Move the working set',
    keywords: ['move', 'offset', 'shift'],
    icon: Move3d,
  },
  {
    kind: 'rotate',
    label: 'Rotate',
    description: 'Rotate the working set about a pivot',
    keywords: ['spin', 'turn', 'orient'],
    icon: Rotate3d,
  },
  {
    kind: 'scale',
    label: 'Scale',
    description: 'Scale the working set',
    keywords: ['resize', 'grow', 'shrink'],
    icon: Scale3d,
  },
  {
    kind: 'linear-array',
    label: 'Linear Array',
    description: 'Repeat in a line — offset, twist and scale per step',
    keywords: ['repeat', 'duplicate', 'row', 'line', 'stack', 'helix'],
    icon: MoveHorizontal,
  },
  {
    kind: 'radial-array',
    label: 'Radial Array',
    description: 'Place copies around an axis',
    keywords: ['circle', 'ring', 'polar', 'around', 'radially', 'clock'],
    icon: Orbit,
  },
  {
    kind: 'grid-array',
    label: 'Grid Array',
    description: 'Rows × columns on a plane',
    keywords: ['grid', 'matrix', 'solar', 'cells', 'rows', 'columns'],
    icon: Grid3x3,
  },
];
