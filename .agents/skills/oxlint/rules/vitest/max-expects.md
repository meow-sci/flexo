---
title: "vitest/max-expects"
rule: "vitest/max-expects"
category: "Style"
version: "0.0.18"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/max-expects.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule enforces a maximum number of `expect()` calls in a single test.

### Why is this bad?

Tests with many different assertions are likely mixing multiple objectives.
It is generally better to have a single objective per test to ensure that when a test fails,
the problem is easy to identify.

### Examples

Examples of **incorrect** code for this rule:

```javascript
test("should not pass", () => {
  expect(true).toBeDefined();
  expect(true).toBeDefined();
  expect(true).toBeDefined();
  expect(true).toBeDefined();
  expect(true).toBeDefined();
  expect(true).toBeDefined();
});

it("should not pass", () => {
  expect(true).toBeDefined();
  expect(true).toBeDefined();
  expect(true).toBeDefined();
  expect(true).toBeDefined();
  expect(true).toBeDefined();
  expect(true).toBeDefined();
});
```

## Configuration

This rule accepts a configuration object with the following properties:

### max

type: `integer`

default: `5`

Maximum number of `expect()` assertion calls allowed within a single test.

## How to use

```json
{
  "rules": {
    "vitest/max-expects": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/max-expects": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/max-expects.md)
