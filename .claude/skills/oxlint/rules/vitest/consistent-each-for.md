---
title: "vitest/consistent-each-for"
rule: "vitest/consistent-each-for"
category: "Correctness"
version: "1.39.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/consistent-each-for.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule enforces consistency in which method is used to create parameterized tests.
This configuration affects different test function types (`test`, `it`, `describe`, `suite`).

### Why is this bad?

Without a consistent way to create parameterized tests, we rely on the developer to remember that
`.for` spreads the values as different arguments while `.each` passes the array as a single argument.

### Examples

Examples of **incorrect** code for this rule:

```js
// { test: 'for' }
test.each([[1, 1, 2]])("test", (a, b, expected) => {
  expect(a + b).toBe(expected);
});

// { describe: 'for' }
describe.each([[1], [2]])("suite %s", (n) => {
  test("test", () => {});
});
```

Examples of **correct** code for this rule:

```js
// { test: 'for' }
test.for([[1, 1, 2]])("test", ([a, b, expected]) => {
  expect(a + b).toBe(expected);
});

// { describe: 'for' }
describe.for([[1], [2]])("suite %s", ([n]) => {
  test("test", () => {});
});
```

## Configuration

This rule accepts a configuration object with the following properties:

### describe

type: `"for" | "each"`

Preferred method to create parameterized tests for `describe` blocks.

### it

type: `"for" | "each"`

Preferred method to create parameterized tests for `it` blocks.

### suite

type: `"for" | "each"`

Preferred method to create parameterized tests for `suite` blocks.

### test

type: `"for" | "each"`

Preferred method to create parameterized tests for `test` blocks.

## How to use

```json
{
  "rules": {
    "vitest/consistent-each-for": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/consistent-each-for": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.39.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/consistent-each-for.md)
