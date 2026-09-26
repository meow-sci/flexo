---
title: "vitest/prefer-spy-on"
rule: "vitest/prefer-spy-on"
category: "Style"
version: "0.2.14"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-spy-on.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

When mocking a function by overwriting a property you have to manually restore
the original implementation when cleaning up. When using `jest.spyOn()` Jest
keeps track of changes, and they can be restored with `jest.restoreAllMocks()`,
`mockFn.mockRestore()` or by setting `restoreMocks` to `true` in the Jest
config.

Note: The mock created by `jest.spyOn()` still behaves the same as the original
function. The original function can be overwritten with
`mockFn.mockImplementation()` or by some of the
[other mock functions](https://jestjs.io/docs/en/mock-function-api).

### Why is this bad?

Directly overwriting properties with mock functions can lead to cleanup issues
and test isolation problems. When you manually assign a mock to a property,
you're responsible for restoring the original implementation, which is easy to
forget and can cause tests to interfere with each other. Using `jest.spyOn()`
provides automatic cleanup capabilities and makes your tests more reliable.

### Examples

Examples of **incorrect** code for this rule:

```javascript
Date.now = jest.fn();
Date.now = jest.fn(() => 10);
```

Examples of **correct** code for this rule:

```javascript
jest.spyOn(Date, "now");
jest.spyOn(Date, "now").mockImplementation(() => 10);
```

## How to use

```json
{
  "rules": {
    "vitest/prefer-spy-on": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/prefer-spy-on": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.14.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-spy-on.md)
