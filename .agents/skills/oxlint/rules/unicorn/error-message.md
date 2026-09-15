---
title: "unicorn/error-message"
rule: "unicorn/error-message"
category: "Style"
version: "0.0.14"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/error-message.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforces providing a `message` when creating built-in `Error` objects to
improve readability and debugging.

### Why is this bad?

Throwing an `Error` without a message, like `throw new Error()`, provides no context
on what went wrong, making debugging harder. A clear error message improves
code clarity and helps developers quickly identify issues.

### Examples

Examples of **incorrect** code for this rule:

```javascript
throw Error();
throw new TypeError();
```

Examples of **correct** code for this rule:

```javascript
throw new Error("Unexpected token");
throw new TypeError("Number expected");
```

## How to use

```json
{
  "rules": {
    "unicorn/error-message": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/error-message": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.14.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/error-message.md)
