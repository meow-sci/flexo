import { useId, useRef } from 'react';
import { SectionTitle, TextField } from '../../kit';
import { useNumberDraft } from '../../numberDraft';

/**
 * The presentational primitives every Engine Wizard step is built from.
 *
 * Nothing here reads a store or knows the wizard model — steps pass values down and get
 * committed numbers back, so a step file stays a layout of these four pieces.
 *
 * **Numeric entry**: both fields are a verbatim adaptation of `CreateMeshDialog`'s
 * `ParamNumberField` — kit {@link TextField} + {@link useNumberDraft} + `inputMode="url"`.
 * That combination is mandatory project-wide: an ad-hoc `Number(v)` controlled field stomps
 * an emptied input to `0` and makes `.06` / `-` untypeable, and `type="number"` is banned
 * outright (a number input sanitizes its own DOM value, erasing in-progress keystrokes).
 * `inputMode="url"` rather than `numeric`/`decimal` because the phone keypads for those
 * omit the `-` key.
 */

/** How a unit chip is drawn beside an input: muted, and bottom-padded to sit on the `sm` input's centre line. */
const SUFFIX_CLASS = 'shrink-0 pb-1.5 text-xs text-fg-subtle';

/**
 * The shared chrome around a wizard numeric input: the unit chip that follows the input and
 * the helper line under it.
 *
 * The description is rendered by this shell, not handed to {@link TextField}, because the
 * suffix is bottom-aligned against the input — a description living inside the field would
 * push that baseline down and the unit would float below the box. `aria-describedby` keeps
 * the wiring the `description` prop would have given us.
 */
function NumberFieldShell(props: {
  label: string;
  suffix?: string;
  description?: React.ReactNode;
  /** The spread-ready handler bag from {@link useNumberDraft}. */
  field: ReturnType<typeof useNumberDraft>;
  placeholder?: string;
  isDisabled?: boolean;
}) {
  const descriptionId = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-end gap-1.5">
        <TextField
          label={props.label}
          size="sm"
          // must inputMode="url" so negative numbers can be managed on mobile devices, numeric/decimal/integer dont show "-" key
          inputMode="url"
          inputClassName="font-mono"
          className="min-w-0 flex-1"
          placeholder={props.placeholder}
          isDisabled={props.isDisabled}
          aria-describedby={props.description ? descriptionId : undefined}
          {...props.field}
        />
        {props.suffix && <span className={SUFFIX_CLASS}>{props.suffix}</span>}
      </div>
      {props.description && (
        <p id={descriptionId} className="text-xs leading-snug text-fg-subtle">
          {props.description}
        </p>
      )}
    </div>
  );
}

/**
 * A wizard numeric field with a full-width label, an optional unit chip and helper text.
 *
 * Draft-backed: in-progress entries like `.06`, `-` or an emptied field survive while
 * focused, and blur/Enter restores the pre-edit value if what's left isn't a number.
 * `min`/`max` never fight the typist — out-of-range keystrokes are skipped rather than
 * rewritten, and the clamp lands once, on commit.
 */
export function WizardNumberField(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  /** Unit chip rendered after the input, e.g. "bar", "m", "%", "°", "ms", "kg". */
  suffix?: string;
  min?: number;
  max?: number;
  /** Arrow-key increment (default 1); Shift ⇒ ×10, Alt ⇒ ×0.1. */
  step?: number;
  /** Helper text under the field (bounds, KSA caveats). */
  description?: React.ReactNode;
  placeholder?: string;
  isDisabled?: boolean;
}) {
  const field = useNumberDraft({
    value: props.value,
    onCommit: props.onChange,
    min: props.min,
    max: props.max,
    step: props.step,
  });
  return (
    <NumberFieldShell
      label={props.label}
      suffix={props.suffix}
      description={props.description}
      placeholder={props.placeholder}
      isDisabled={props.isDisabled}
      field={field}
    />
  );
}

/** Render an absent optional value as an empty box rather than the string `NaN`. */
const formatOptional = (n: number) => (Number.isFinite(n) ? String(n) : '');

/**
 * {@link WizardNumberField} for a value that may be absent — the optional dry mass, the
 * optional FX exit-diameter override. An emptied input commits `null` instead of collapsing
 * to `0`, and an absent value shows a blank box (not a placeholder number the user would
 * have to notice is fake).
 *
 * `null` is carried through {@link useNumberDraft} as `NaN`: the hook stays the single owner
 * of the draft/commit rules, `format` turns the sentinel back into an empty box, and because
 * `NaN !== NaN` the hook's "unchanged" short-circuit can't swallow the first real commit
 * (typing `0` into an empty field does fire `onChange(0)`).
 */
export function WizardOptionalNumberField(props: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  /** Unit chip rendered after the input, e.g. "bar", "m", "%", "°", "ms", "kg". */
  suffix?: string;
  min?: number;
  max?: number;
  /** Arrow-key increment (default 1); Shift ⇒ ×10, Alt ⇒ ×0.1. */
  step?: number;
  /** Helper text under the field (bounds, KSA caveats). */
  description?: React.ReactNode;
  /** Hint for what an empty box means, e.g. "auto". */
  placeholder?: string;
  isDisabled?: boolean;
}) {
  /**
   * Whether the box is currently empty. Read only inside the hook's commit, so blur/Enter on
   * an emptied field resolves to `null` instead of the hook's pre-edit restore — without a
   * second, contradicting `onChange` call after the fact.
   */
  const isBlank = useRef(props.value === null);
  const field = useNumberDraft({
    value: props.value ?? Number.NaN,
    onCommit: (n) => props.onChange(isBlank.current || !Number.isFinite(n) ? null : n),
    min: props.min,
    max: props.max,
    step: props.step,
    format: formatOptional,
  });
  return (
    <NumberFieldShell
      label={props.label}
      suffix={props.suffix}
      description={props.description}
      placeholder={props.placeholder}
      isDisabled={props.isDisabled}
      field={{
        ...field,
        onChange: (text: string) => {
          isBlank.current = text.trim() === '';
          field.onChange(text);
        },
        onFocus: () => {
          isBlank.current = props.value === null;
          field.onFocus();
        },
        // The hook skips a commit whose value is unchanged, so clearing a field back to its
        // pre-edit number resolves to that same number and fires nothing — the `null` has to
        // be stated outright once the draft has been resolved.
        onBlur: () => {
          field.onBlur();
          if (isBlank.current) props.onChange(null);
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Escape') {
            // An empty box over an absent value has no edit to cancel — Escape belongs to the
            // dialog. (The hook can't tell: its own "dirty" test compares NaN to NaN.)
            if (isBlank.current && props.value === null) return;
            // Otherwise Escape cancels the emptying too: it restores the pre-edit number.
            isBlank.current = false;
          }
          field.onKeyDown(event);
          if (event.key === 'Enter' && isBlank.current) props.onChange(null);
        },
      }}
    />
  );
}

/** A titled block of wizard controls: heading, optional lead-in, then a stack of fields. */
export function StepSection(props: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>{props.title}</SectionTitle>
      {props.description && (
        <p className="text-xs leading-snug text-fg-subtle">{props.description}</p>
      )}
      <div className="flex flex-col gap-2">{props.children}</div>
    </div>
  );
}

/**
 * Two-up on a desktop dialog, single column on a phone. Pure CSS — a viewport hook would
 * couple every row in the wizard to a resize re-render for a layout the browser can do.
 */
export function WizardRow(props: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{props.children}</div>;
}
