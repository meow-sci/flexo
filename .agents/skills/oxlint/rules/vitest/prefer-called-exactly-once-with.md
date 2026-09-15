---
title: "vitest/prefer-called-exactly-once-with"
rule: "vitest/prefer-called-exactly-once-with"
category: "Style"
version: "1.58.0"
default: false
type_aware: false
fix: "fixable_dangerous_fix"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-called-exactly-once-with.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_dangerous_fix |
| Type-aware | no |


### What it does

It checks when a target is asserted with both `toHaveBeenCalledOnce` and `toHaveBeenCalledWith` instead of
`toHaveBeenCalledExactlyOnceWith`.

### Why is this bad?

The reader must deduce from both expectations that the spy function is called once and with specific arguments.

### Examples

Examples of **incorrect** code for this rule:

```js
test("foo", () => {
  const mock = vi.fn();
  mock("foo");
  expect(mock).toHaveBeenCalledOnce();
  expect(mock).toHaveBeenCalledWith("foo");
});
```

Examples of **correct** code for this rule:

```js
test("foo", () => {
  const mock = vi.fn();
  mock("foo");
  expect(mock).toHaveBeenCalledExactlyOnceWith("foo");
});
```

## How to use

```json
{
  "rules": {
    "vitest/prefer-called-exactly-once-with": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/prefer-called-exactly-once-with": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.58.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-called-exactly-once-with.md)
