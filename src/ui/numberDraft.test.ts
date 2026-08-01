import { describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  clampNumber,
  isPartialNumber,
  parseNumericDraft,
  trimFloatNoise,
  useNumberDraft,
} from './numberDraft';

describe('isPartialNumber', () => {
  it('keeps entries the user is still typing', () => {
    // The whole point of the draft model: none of these are numbers *yet*, but every one
    // of them is on the way to being one, so the field must not reject the keystroke.
    for (const text of ['', '-', '+', '.', '-.', '0.', '.5', '-0.', '12.', '1e', '1e-', '1E+']) {
      expect(isPartialNumber(text), text).toBe(true);
    }
  });

  it('keeps complete numbers', () => {
    for (const text of ['0', '-1.5', '.25', '1e-7', '-2.5E+3', '00.50']) {
      expect(isPartialNumber(text), text).toBe(true);
    }
  });

  it('rejects text that cannot become a number', () => {
    for (const text of ['abc', '1.2.3', '--1', '1-', '1,5', '5 ', 'e5', '-e5', '1px', '0x10']) {
      expect(isPartialNumber(text), text).toBe(false);
    }
  });
});

describe('parseNumericDraft', () => {
  it('parses complete and trailing-point entries', () => {
    expect(parseNumericDraft('0.')).toBe(0);
    expect(parseNumericDraft('-.5')).toBe(-0.5);
    expect(parseNumericDraft('1e-7')).toBe(1e-7);
    expect(parseNumericDraft('-12.25')).toBe(-12.25);
  });

  it('returns null for entries that are not a number', () => {
    for (const text of ['', '   ', '-', '.', '+', '1e', 'abc']) {
      expect(parseNumericDraft(text), text).toBeNull();
    }
  });
});

describe('clampNumber', () => {
  it('applies only the bounds that are given', () => {
    expect(clampNumber(-1, 0)).toBe(0);
    expect(clampNumber(150, 0, 100)).toBe(100);
    expect(clampNumber(-1)).toBe(-1);
    expect(clampNumber(0.5, 0.0001)).toBe(0.5);
  });
});

describe('trimFloatNoise', () => {
  it('removes binary-float dust from stepping', () => {
    expect(trimFloatNoise(0.1 + 0.2)).toBe(0.3);
    expect(trimFloatNoise(1.005 - 1)).toBe(0.005);
  });

  it('preserves tiny and large magnitudes', () => {
    expect(trimFloatNoise(1e-7)).toBe(1e-7);
    expect(trimFloatNoise(123456.789)).toBe(123456.789);
  });
});

describe('useNumberDraft finalize', () => {
  // Minimal mounted-hook harness (no component-test infra in this repo): a probe
  // component captures the hook's handlers so the test can drive focus/keys/blur.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  type Field = ReturnType<typeof useNumberDraft>;
  const enterKey = { key: 'Enter' } as unknown as React.KeyboardEvent<HTMLInputElement>;

  // Store-like probe: a commit updates the rendered value (like the real editor
  // store loop), and `rebind` swaps the bound value as a selection change would.
  async function mountProbe(commits: number[]) {
    let field: Field | null = null;
    let setValue: ((n: number) => void) | null = null;
    function Probe() {
      const [value, set] = useState(1);
      setValue = set;
      field = useNumberDraft({
        value,
        onCommit: (n) => {
          commits.push(n);
          set(n);
        },
      });
      return null;
    }
    const root = createRoot(document.createElement('div'));
    await act(async () => root.render(createElement(Probe)));
    return {
      field: () => field as unknown as Field,
      rebind: (n: number) => act(async () => setValue?.(n)),
      unmount: () => act(async () => root.unmount()),
    };
  }

  it('commits a typed draft on blur (the normal path still works)', async () => {
    const commits: number[] = [];
    const probe = await mountProbe(commits);
    await act(async () => probe.field().onFocus());
    await act(async () => probe.field().onChange('2'));
    await act(async () => probe.field().onBlur());
    expect(commits).toEqual([2]);
    await probe.unmount();
  });

  it('blur after Enter already finalized commits NOTHING — even when the field was re-bound', async () => {
    // Regression: Enter finalizes (draft → null) but keeps focus; a selection change
    // then re-binds the same mounted field to another entity (value 1 → 5). The stale
    // preEdit (1) must NOT be committed into the new entity on the eventual blur —
    // pre-fix, this silently overwrote whatever the field now pointed at.
    const commits: number[] = [];
    const probe = await mountProbe(commits);
    await act(async () => probe.field().onFocus());
    await act(async () => probe.field().onKeyDown(enterKey));
    await probe.rebind(5); // selection switched: same field, different entity
    await act(async () => probe.field().onBlur());
    expect(commits).toEqual([]);
    await probe.unmount();
  });

  it('an unparseable leftover draft still restores the pre-edit value on blur', async () => {
    const commits: number[] = [];
    const probe = await mountProbe(commits);
    await act(async () => probe.field().onFocus());
    await act(async () => probe.field().onChange('-')); // partial: kept as draft, no live commit
    await act(async () => probe.field().onBlur()); // parses null → restores preEdit (1), no-op commit
    expect(commits).toEqual([]);
    expect(probe.field().value).toBe('1');
    await probe.unmount();
  });
});
