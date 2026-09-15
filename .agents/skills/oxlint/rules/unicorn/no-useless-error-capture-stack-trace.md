---
title: "unicorn/no-useless-error-capture-stack-trace"
rule: "unicorn/no-useless-error-capture-stack-trace"
category: "Restriction"
version: "1.20.0"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-useless-error-capture-stack-trace.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Disallows unnecessary `Error.captureStackTrace(…)` in error constructors.

### Why is this bad?

Calling `Error.captureStackTrace(…)` inside the constructor of a built-in `Error` subclass
is unnecessary, since the `Error` constructor calls it automatically.

### Examples

Examples of **incorrect** code for this rule:

```js
class MyError extends Error {
  constructor() {
    Error.captureStackTrace(this, MyError);
  }
}
```

Examples of **correct** code for this rule:

```js
class MyError extends Error {
  constructor() {
    // No need to call Error.captureStackTrace
  }
}
```

## How to use

```json
{
  "rules": {
    "unicorn/no-useless-error-capture-stack-trace": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-useless-error-capture-stack-trace": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.20.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-useless-error-capture-stack-trace.md)
