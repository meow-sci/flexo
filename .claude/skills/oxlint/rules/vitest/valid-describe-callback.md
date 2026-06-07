---
title: "vitest/valid-describe-callback"
rule: "vitest/valid-describe-callback"
category: "Correctness"
version: "0.0.8"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/valid-describe-callback.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule validates that the second parameter of a `describe()` function is a
callback function. This callback function:

- should not contain any parameters
- should not contain any `return` statements

Vitest supports async `describe()` callbacks, so this rule allows them.

### Why is this bad?

Using an improper `describe()` callback function can lead to unexpected test
errors.

### Examples

Examples of **incorrect** code for this rule:

```javascript
// Callback function parameters are not allowed
describe("myFunction()", (done) => {
  // ...
});

// Returning a value from a describe block is not allowed
describe("myFunction", () =>
  it("returns a truthy value", () => {
    expect(myFunction()).toBeTruthy();
  }));
```

## How to use

```json
{
  "rules": {
    "vitest/valid-describe-callback": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/valid-describe-callback": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.8.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/valid-describe-callback.md)
