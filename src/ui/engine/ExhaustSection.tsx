import { useStore } from '@nanostores/react';
import { Crosshair } from 'lucide-react';
import { Kbd, SectionTitle, Switch, ToggleButton, ToggleButtonGroup } from '../kit';
import {
  $activeNozzleTarget,
  $isExhaustPlacing,
  $resolvedNozzleTargets,
  nozzleTargetLabel,
  setActiveNozzleRef,
  setExhaustPlacing,
} from '../../state/engineStore';

/**
 * **The Exhaust section** — the navigator's bottom block (design:
 * design-data-engine-modes.md §B3.4, §B7).
 *
 * One toggle that arms the `exhaust` tool, and one chip per resolved 3D handle. Chips rather
 * than a Select because **spatial identity is the point**: the list mirrors the viewport's
 * handles one-for-one, and clicking either re-targets the gizmo without disturbing the mesh
 * selection. Height-capped and scrollable — the stock MMU authors 56 nozzles, most with an FX
 * override.
 *
 * A SubPart-owned nozzle contributes one chip PER PLACEMENT of its template, because that is
 * how many real thrusters KSA builds from it; the explainer says so out loud whenever the
 * active target is one of those, the same warning the light inspector gives.
 *
 * Hidden entirely when the open engine has no nozzles — there is nothing to place.
 *
 * **Undo enrollment: NONE.** Arming and re-targeting are ephemeral designer state (§B11); the
 * gizmo DRAG pushes its own single step at drag start, in `EditorScene`.
 */
export function ExhaustSection() {
  const targets = useStore($resolvedNozzleTargets);
  const active = useStore($activeNozzleTarget);
  const placing = useStore($isExhaustPlacing);

  if (targets.length === 0) return null;
  const shared = active !== null && active.instanceCount > 1;

  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-t border-border pt-1.5">
      <div className="flex items-center gap-2 px-1">
        <SectionTitle className="flex-1">Exhaust</SectionTitle>
        <Kbd>X</Kbd>
      </div>

      <div className="px-1">
        <Switch isSelected={placing} onChange={setExhaustPlacing}>
          <span className="inline-flex items-center gap-1">
            <Crosshair size={13} /> Place exhaust in 3D
          </span>
        </Switch>
      </div>

      {targets.length > 1 && (
        <ToggleButtonGroup
          className="max-h-24 w-auto flex-wrap gap-1 overflow-y-auto px-1"
          aria-label="Nozzle to place"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={active ? [active.key] : []}
          onSelectionChange={(keys) => {
            const key = [...keys][0];
            const target = targets.find((t) => t.key === key);
            if (target) setActiveNozzleRef(target.ref);
          }}
        >
          {/* flex-none: ToggleButton is flex-1 for segmented controls, which would stretch a
              lone wrapped chip to full width. */}
          {targets.map((t) => (
            <ToggleButton
              key={t.key}
              id={t.key}
              size="xs"
              className="flex-none"
              aria-label={
                t.ref.scope === 'subpart' && t.ref.instanceId
                  ? `${nozzleTargetLabel(t)} on ${t.ref.instanceId}`
                  : nozzleTargetLabel(t)
              }
            >
              {nozzleTargetLabel(t)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}

      {shared && (
        <p className="px-1 text-[11px] leading-snug text-fg-subtle">
          <span className="font-mono">{active.nozzle.id}</span> is ONE nozzle instantiated on all{' '}
          {active.instanceCount} placements of this SubPart — each is a real thruster in-game.
          You&rsquo;re editing through{' '}
          <span className="font-mono">
            {active.ref.scope === 'subpart' ? active.ref.instanceId : ''}
          </span>
          ; the other handles move with it.
        </p>
      )}

      {placing && (
        <p className="px-1 text-[11px] leading-snug text-fg-subtle">
          Move drags the exhaust point; Rotate re-aims the direction (roll does nothing — the plume
          is axially symmetric in-game). <Kbd>,</Kbd> <Kbd>.</Kbd> cycle targets, <Kbd>Esc</Kbd> is
          done. Click any handle in the viewport to switch nozzle.
        </p>
      )}
    </div>
  );
}
