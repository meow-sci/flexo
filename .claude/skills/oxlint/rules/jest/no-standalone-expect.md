---
title: "jest/no-standalone-expect"
rule: "jest/no-standalone-expect"
category: "Correctness"
version: "0.0.13"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/no-standalone-expect.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prevents `expect` statements outside of a `test` or `it` block. An `expect`
within a helper function (but outside of a `test` or `it` block) will not
trigger this rule.

Statements like `expect.hasAssertions()` will NOT trigger this rule since these
calls will execute if they are not in a test block.

### Why is this bad?

`expect` statements outside of test blocks will not be executed by the Jest
test runner, which means they won't actually test anything. This can lead to
false confidence in test coverage and may hide bugs that would otherwise be
caught by proper testing.

### Examples

Examples of **incorrect** code for this rule:

```javascript
describe("a test", () => {
  expect(1).toBe(1);
});
```

## Configuration

This rule accepts a configuration object with the following properties:

### additionalTestBlockFunctions

type: `string[]`

default: `[]`

An array of function names that should also be treated as test blocks.

## How to use

```json
{
  "rules": {
    "jest/no-standalone-expect": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jest/no-standalone-expect": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.13.

## References

- [Upstream rule documentation](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/no-standalone-expect.md)
