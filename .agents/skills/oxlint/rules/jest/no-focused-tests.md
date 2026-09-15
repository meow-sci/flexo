---
title: "jest/no-focused-tests"
rule: "jest/no-focused-tests"
category: "Correctness"
version: "0.0.8"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/no-focused-tests.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

This rule reminds you to remove `.only` from your tests by raising a warning
whenever you are using the exclusivity feature.

### Why is this bad?

Jest has a feature that allows you to focus tests by appending `.only` or
prepending `f` to a test-suite or a test-case. This feature is really helpful to
debug a failing test, so you don’t have to execute all of your tests. After you
have fixed your test and before committing the changes you have to remove
`.only` to ensure all tests are executed on your build system.

### Examples

Examples of **incorrect** code for this rule:

```javascript
describe.only("foo", () => {});
it.only("foo", () => {});
describe["only"]("bar", () => {});
it["only"]("bar", () => {});
test.only("foo", () => {});
test["only"]("bar", () => {});
fdescribe("foo", () => {});
fit("foo", () => {});
fit.each`
  table
`();
```

## How to use

```json
{
  "rules": {
    "jest/no-focused-tests": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jest/no-focused-tests": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.8.

## References

- [Upstream rule documentation](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/no-focused-tests.md)
