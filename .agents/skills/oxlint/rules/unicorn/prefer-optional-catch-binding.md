---
title: "unicorn/prefer-optional-catch-binding"
rule: "unicorn/prefer-optional-catch-binding"
category: "Style"
version: "0.0.17"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-optional-catch-binding.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Prefers omitting the catch binding parameter if it is unused.

### Why is this bad?

It is unnecessary to bind the error to a variable if it is not used.

### Examples

Examples of **incorrect** code for this rule:

```javascript
try {
  // ...
} catch (e) {}
```

Examples of **correct** code for this rule:

```javascript
try {
  // ...
} catch {}
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-optional-catch-binding": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-optional-catch-binding": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.17.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-optional-catch-binding.md)
