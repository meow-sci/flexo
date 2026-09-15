---
title: "vitest/prefer-expect-type-of"
rule: "vitest/prefer-expect-type-of"
category: "Style"
version: "1.44.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-expect-type-of.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforce using [`toBeTypeOf`](https://vitest.dev/api/expect#tobetypeof) instead of `expect(typeof ...).toBe(...)`.

### Why is this bad?

`expect(typeof value).toBe(type)` works but is awkward and produces poor failure messages.
Vitest's built-in `toBeTypeOf` matcher performs the same `typeof` comparison with a clearer API and better error output.

### Examples

Examples of **incorrect** code for this rule:

```js
test("type checking", () => {
  expect(typeof "hello").toBe("string");
  expect(typeof 42).toBe("number");
  expect(typeof true).toBe("boolean");
  expect(typeof {}).toBe("object");
  expect(typeof (() => {})).toBe("function");
  expect(typeof Symbol()).toBe("symbol");
  expect(typeof 123n).toBe("bigint");
  expect(typeof undefined).toBe("undefined");
});
```

Examples of **correct** code for this rule:

```js
test("type checking", () => {
  expect("hello").toBeTypeOf("string");
  expect(42).toBeTypeOf("number");
  expect(true).toBeTypeOf("boolean");
  expect({}).toBeTypeOf("object");
  expect(() => {}).toBeTypeOf("function");
  expect(Symbol()).toBeTypeOf("symbol");
  expect(123n).toBeTypeOf("bigint");
  expect(undefined).toBeTypeOf("undefined");
});
```

## How to use

```json
{
  "rules": {
    "vitest/prefer-expect-type-of": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/prefer-expect-type-of": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.44.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-expect-type-of.md)
