/**
 * The one contract every Engine Wizard step component is written against.
 *
 * A step is presentational: it reads the wizard state, renders fields, and hands back a
 * shallow patch. It never touches `$part`, never commits, and never decides which step comes
 * next — {@link import('../EngineWizardDialog').EngineWizardDialog} owns all of that.
 *
 * `patch` is a SHALLOW merge, so a step editing a nested group passes the whole group:
 * `patch({ gimbal: { ...state.gimbal, maxYDeg: v } })`. That keeps the state a plain value
 * (structurally cloneable, trivially comparable) with no reducer vocabulary to learn.
 */

import type { EditingPart } from '../../../../ksa/types';
import type { ReactionData } from '../../../../ksa/reactionCatalog';
import type { WizardState } from '../wizardModel';

/** Merges a shallow patch into the wizard state and marks the wizard dirty. */
export type WizardPatch<S extends WizardState> = (patch: Partial<S>) => void;

export interface WizardStepProps<S extends WizardState = WizardState> {
  state: S;
  patch: WizardPatch<S>;
  /** The live document, read-only — steps derive options (templates, containers) from it. */
  part: EditingPart;
  /** The live reaction catalog; `undefined` while it loads. Never block the user on it. */
  reactions: ReadonlyMap<string, ReactionData> | undefined;
}
