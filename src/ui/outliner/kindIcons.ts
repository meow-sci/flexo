import { Armchair, Box, Cat, CircleDot, Frame, Lightbulb, type LucideIcon } from 'lucide-react';
import type { EntityKind } from '../../state/editorStore';

/**
 * ONE glyph per selectable kind (foundation Law 4: one dataset). Shared by the Outliner's
 * entity rows and the left sidebar's focus-card headers, so a SubPart never reads as a
 * different thing in the two panels.
 *
 * Its own module because both consumers are components and oxlint's
 * `react(only-export-components)` forbids a component file from also exporting constants.
 */
export const KIND_ICONS: Record<EntityKind, LucideIcon> = {
  subpart: Box,
  connector: CircleDot,
  collider: Frame,
  ivaSeat: Armchair,
  light: Lightbulb,
  kitten: Cat,
};
