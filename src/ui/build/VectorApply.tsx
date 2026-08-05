import { useState } from 'react';
import { Button, SectionTitle, TextField } from '../kit';
import { useNumberDraft } from '../numberDraft';
import { fmt } from '../format';

/**
 * Three numeric inputs (X/Y/Z) plus an Apply button — the multi-select panel's relative
 * delta editor (design: design-build-mode.md §3.8.5).
 *
 * **Rebuilt on {@link useNumberDraft}.** v1 hand-rolled its own draft state with
 * `useState` + `isPartialNumber`, which made it the THIRD numeric-editing code path in the
 * app (census pain 11). It now goes through the one shared hook like every other numeric
 * field, so partial entries (`-`, `.06`, `1e-`), live commit, skip-don't-clamp, Escape and
 * the arrow-key stepping laws are all identical here.
 *
 * The drafts are local component state, not document state, so nothing here touches undo —
 * the Apply callback owns its single `pushUndo`.
 */
export function VectorApply({
  title,
  defaultValue,
  isDisabled,
  onApply,
}: {
  title: string;
  defaultValue: [number, number, number];
  isDisabled?: boolean;
  onApply: (value: [number, number, number]) => void;
}) {
  const [value, setValue] = useState<[number, number, number]>(defaultValue);
  /**
   * Bumped on Apply to REMOUNT the three fields. `useNumberDraft` keeps a focused field's
   * raw string draft internally, so resetting `value` alone would leave the typed text on
   * screen; remounting is the one way to drop that draft without reaching into the hook.
   */
  const [resetNonce, setResetNonce] = useState(0);

  const setAxis = (axis: number, next: number) =>
    setValue((prev) => {
      const out = [...prev] as [number, number, number];
      out[axis] = next;
      return out;
    });

  const apply = () => {
    onApply(value);
    setValue(defaultValue);
    setResetNonce((n) => n + 1);
  };

  return (
    <div className="flex flex-col gap-1">
      <SectionTitle>{title}</SectionTitle>
      <div className="flex items-center gap-1">
        {(['X', 'Y', 'Z'] as const).map((label, i) => (
          <ApplyAxis
            key={`${label}:${resetNonce}`}
            label={`${title} ${label}`}
            short={label}
            value={value[i]}
            onChange={(n) => setAxis(i, n)}
          />
        ))}
        <Button size="sm" isDisabled={isDisabled} onPress={apply}>
          Apply
        </Button>
      </div>
    </div>
  );
}

function ApplyAxis({
  label,
  short,
  value,
  onChange,
}: {
  label: string;
  short: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const field = useNumberDraft({ value, onCommit: onChange, format: fmt });
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1">
      <span className="w-3 text-xs text-fg-subtle">{short}</span>
      <TextField
        size="sm"
        // must inputMode="url" so negative numbers can be managed on mobile devices, numeric/decimal/integer dont show "-" key
        inputMode="url"
        aria-label={label}
        inputClassName="font-mono"
        {...field}
      />
    </label>
  );
}
