---
title: "vitest/prefer-called-once"
rule: "vitest/prefer-called-once"
category: "Style"
version: "1.39.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-called-once.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Substitute `toBeCalledTimes(1)` and `toHaveBeenCalledTimes(1)` with
`toBeCalledOnce()` and `toHaveBeenCalledOnce()` respectively.

### Why is this bad?

The `*Times` matchers require reading the argument to know how many
times a spy is expected to be called. Most of the time, you expect a
method to be called once.

### Examples

Examples of **incorrect** code for this rule:

```js
test("foo", () => {
  const mock = vi.fn();
  mock("foo");
  expect(mock).toBeCalledTimes(1);
  expect(mock).toHaveBeenCalledTimes(1);
});
```

Examples of **correct** code for this rule:

```js
test("foo", () => {
  const mock = vi.fn();
  mock("foo");
  expect(mock).toBeCalledOnce();
  expect(mock).toHaveBeenCalledOnce();
});
```

## How to use

```json
{
  "rules": {
    "vitest/prefer-called-once": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/prefer-called-once": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.39.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-called-once.md)
