---
title: "unicorn/prefer-includes"
rule: "unicorn/prefer-includes"
category: "Style"
version: "0.0.18"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-includes.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Prefer `includes()` over `indexOf()` when checking for existence or non-existence.
All built-ins have `.includes()` in addition to `.indexOf()`.

### Why is this bad?

The `.includes()` method is more readable and less error-prone than `.indexOf()`.

### Examples

Examples of **incorrect** code for this rule:

```javascript
if (str.indexOf("foo") !== -1) {
}
```

Examples of **correct** code for this rule:

```javascript
if (str.includes("foo")) {
}
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-includes": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-includes": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-includes.md)
