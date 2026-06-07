---
title: "vitest/require-to-throw-message"
rule: "vitest/require-to-throw-message"
category: "Correctness"
version: "0.2.9"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/require-to-throw-message.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule triggers a warning if `toThrow()` or `toThrowError()` is used without an error message.

### Why is this bad?

Using `toThrow()` or `toThrowError()` without specifying an expected error message
makes tests less specific and harder to debug. When a test only checks that an
error was thrown but not what kind of error, it can pass even when the wrong
error is thrown, potentially hiding bugs. Providing an expected error message
or error type makes tests more precise and helps catch regressions more effectively.

### Examples

Examples of **incorrect** code for this rule:

```javascript
test("all the things", async () => {
  expect(() => a()).toThrow();
  expect(() => a()).toThrowError();
  await expect(a()).rejects.toThrow();
  await expect(a()).rejects.toThrowError();
});
```

Examples of **correct** code for this rule:

```javascript
test("all the things", async () => {
  expect(() => a()).toThrow("a");
  expect(() => a()).toThrowError("a");
  await expect(a()).rejects.toThrow("a");
  await expect(a()).rejects.toThrowError("a");
});
```

## How to use

```json
{
  "rules": {
    "vitest/require-to-throw-message": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/require-to-throw-message": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.9.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/require-to-throw-message.md)
