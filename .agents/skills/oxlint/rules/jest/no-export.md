---
title: "jest/no-export"
rule: "jest/no-export"
category: "Correctness"
version: "0.0.13"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/no-export.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prevents using exports if a file has one or more tests in it.

### Why is this bad?

This rule aims to eliminate duplicate runs of tests by exporting things from test files.
If you import from a test file, then all the tests in that file will be run in each imported instance.
so bottom line, don't export from a test, but instead move helper functions into a separate file when they need to be shared across tests.

### Examples

Examples of **incorrect** code for this rule:

```javascript
export function myHelper() {}
describe("a test", () => {
  expect(1).toBe(1);
});
```

## How to use

```json
{
  "rules": {
    "jest/no-export": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jest/no-export": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.13.

## References

- [Upstream rule documentation](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/no-export.md)
