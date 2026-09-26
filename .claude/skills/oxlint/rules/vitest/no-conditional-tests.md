---
title: "vitest/no-conditional-tests"
rule: "vitest/no-conditional-tests"
category: "Correctness"
version: "0.8.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-conditional-tests.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

The rule disallows the use of conditional statements within test cases to
ensure that tests are deterministic and clearly readable.

### Why is this bad?

Conditional statements in test cases can make tests unpredictable and
harder to understand. Tests should be consistent and straightforward to
ensure reliable results and maintainability.

### Examples

Examples of **incorrect** code for this rule:

```js
describe("my tests", () => {
  if (true) {
    it("is awesome", () => {
      doTheThing();
    });
  }
});
```

Examples of **correct** code for this rule:

```js
describe("my tests", () => {
  it("is awesome", () => {
    doTheThing();
  });
});
```

## How to use

```json
{
  "rules": {
    "vitest/no-conditional-tests": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/no-conditional-tests": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.8.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-conditional-tests.md)
