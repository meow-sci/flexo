---
title: "jest/no-unneeded-async-expect-function"
rule: "jest/no-unneeded-async-expect-function"
category: "Style"
version: "1.39.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/no-unneeded-async-expect-function.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallows unnecessary async function wrapper for expected promises.

### Why is this bad?

When the only statement inside an async wrapper is `await someCall()`,
the call should be passed directly to `expect` instead. This makes the
test code more concise and easier to read.

### Examples

Examples of **incorrect** code for this rule:

```js
await expect(async () => {
  await doSomethingAsync();
}).rejects.toThrow();

await expect(async () => await doSomethingAsync()).rejects.toThrow();
```

Examples of **correct** code for this rule:

```js
await expect(doSomethingAsync()).rejects.toThrow();
```

## How to use

```json
{
  "rules": {
    "jest/no-unneeded-async-expect-function": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jest/no-unneeded-async-expect-function": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.39.0.

## References

- [Upstream rule documentation](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/no-unneeded-async-expect-function.md)
