import { useStore } from '@nanostores/react';
import { Button, Field, useIsPhone } from '../kit';
import { PreciseNumberInput } from '../PreciseNumberInput';
import { $layout, setSidebarWidth } from '../../state/layoutStore';
import { pushUndo, updateCustomReaction } from '../../state/editorStore';
import type { CustomReaction, ReactionLutRowSpec } from '../../ksa/types';

/**
 * **The gas-table (LUT) editor** (design: design-data-engine-modes.md §B4.10) — the four
 * pressure-indexed columns a `<FixedReaction>` carries: ln P, temperature K, γ, and molar mass.
 *
 * This is **CEA-style pre-solved thermodynamics**: KSA ships the solved table, and flexo does
 * not solve chemistry, so the honest workflow is clone-and-remix rather than "enter a formula".
 * The copy says so, because a user who expects the table to follow the reactant list would
 * otherwise author a propellant that is quietly wrong.
 *
 * Layout follows the width it actually gets: a 4-column row on desktop, stacked 2×2 field
 * cards on phone (§B8), and the one-time "widen the sidebar" hint when the left panel is
 * narrower than the grid needs (design D1).
 *
 * **Undo enrollment**: cell edits stream (one push per typing session); row add/remove are
 * discrete pushes.
 */
export function PropellantLutGrid({ process }: { process: CustomReaction }) {
  const isPhone = useIsPhone();
  const layout = useStore($layout);

  const setLut = (lut: ReactionLutRowSpec[]) => updateCustomReaction(process.id, { lut });
  const patchRow = (i: number, patch: Partial<ReactionLutRowSpec>) =>
    setLut(process.lut.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const begin = () => pushUndo('edit propellant', process.id);
  const removeRow = (i: number) => {
    pushUndo('remove gas table row', process.id);
    setLut(process.lut.filter((_, j) => j !== i));
  };
  const addRow = () => {
    pushUndo('add gas table row', process.id);
    const last = process.lut[process.lut.length - 1];
    setLut([
      ...process.lut,
      last
        ? { ...last, lnPressure: last.lnPressure + 0.5 }
        : { lnPressure: Math.log(5_000_000), temperatureK: 3000, gamma: 1.2, molarMassGPerMol: 14 },
    ]);
  };

  const narrow = !isPhone && layout.left.width < 380;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-fg-subtle">
        Gas table — {process.lut.length} row(s) (ln P, T·K, γ, g/mol)
      </span>
      <p className="text-[11px] leading-snug text-fg-subtle">
        CEA-style pre-solved thermodynamics — flexo does not solve chemistry, so changing the
        mixture without recomputing the table is an approximation.
      </p>
      {narrow && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-panel-sunken px-2 py-1 text-[11px] text-fg-muted">
          <span className="min-w-0 flex-1">
            The gas table wants about 460px — widen the panel to see all four columns at once.
          </span>
          <Button size="xs" variant="ghost" onPress={() => setSidebarWidth('left', 460)}>
            Widen
          </Button>
        </div>
      )}

      {process.lut.map((row, i) =>
        isPhone ? (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-md border border-border bg-panel-sunken p-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-fg-muted">Row {i + 1}</span>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-11"
                aria-label={`Remove row ${i + 1}`}
                onPress={() => removeRow(i)}
              >
                Remove
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="ln P">
                <PreciseNumberInput
                  aria-label={`Row ${i + 1} ln pressure`}
                  value={row.lnPressure}
                  step={0.1}
                  onInteractionStart={begin}
                  onCommit={(n) => patchRow(i, { lnPressure: n })}
                />
              </Field>
              <Field label="T (K)">
                <PreciseNumberInput
                  aria-label={`Row ${i + 1} temperature K`}
                  value={row.temperatureK}
                  min={0}
                  onInteractionStart={begin}
                  onCommit={(n) => patchRow(i, { temperatureK: n })}
                />
              </Field>
              <Field label="γ">
                <PreciseNumberInput
                  aria-label={`Row ${i + 1} gamma`}
                  value={row.gamma}
                  min={1}
                  step={0.01}
                  onInteractionStart={begin}
                  onCommit={(n) => patchRow(i, { gamma: n })}
                />
              </Field>
              <Field label="g/mol">
                <PreciseNumberInput
                  aria-label={`Row ${i + 1} molar mass g/mol`}
                  value={row.molarMassGPerMol}
                  min={0}
                  onInteractionStart={begin}
                  onCommit={(n) => patchRow(i, { molarMassGPerMol: n })}
                />
              </Field>
            </div>
          </div>
        ) : (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-end gap-1">
            <PreciseNumberInput
              aria-label={`Row ${i + 1} ln pressure`}
              value={row.lnPressure}
              step={0.1}
              onInteractionStart={begin}
              onCommit={(n) => patchRow(i, { lnPressure: n })}
            />
            <PreciseNumberInput
              aria-label={`Row ${i + 1} temperature K`}
              value={row.temperatureK}
              min={0}
              onInteractionStart={begin}
              onCommit={(n) => patchRow(i, { temperatureK: n })}
            />
            <PreciseNumberInput
              aria-label={`Row ${i + 1} gamma`}
              value={row.gamma}
              min={1}
              step={0.01}
              onInteractionStart={begin}
              onCommit={(n) => patchRow(i, { gamma: n })}
            />
            <PreciseNumberInput
              aria-label={`Row ${i + 1} molar mass g/mol`}
              value={row.molarMassGPerMol}
              min={0}
              onInteractionStart={begin}
              onCommit={(n) => patchRow(i, { molarMassGPerMol: n })}
            />
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove row ${i + 1}`}
              onPress={() => removeRow(i)}
            >
              ✕
            </Button>
          </div>
        ),
      )}

      <Button size="sm" variant="ghost" className="self-start" onPress={addRow}>
        + Row
      </Button>
    </div>
  );
}
