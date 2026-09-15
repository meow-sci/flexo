---
title: "unicorn/no-useless-fallback-in-spread"
rule: "unicorn/no-useless-fallback-in-spread"
category: "Correctness"
version: "0.0.16"
default: true
type_aware: false
fix: "conditional_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-useless-fallback-in-spread.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

Disallow useless fallback when spreading in object literals.

### Why is this bad?

Spreading [falsy values](https://developer.mozilla.org/en-US/docs/Glossary/Falsy) in object literals won't add any unexpected properties, so it's unnecessary to add an empty object as fallback.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const object = { ...(foo || {}) };
```

Examples of **correct** code for this rule:

```javascript
const object = { ...foo };
const object = { ...(foo || { not: "empty" }) };
```

## How to use

```json
{
  "rules": {
    "unicorn/no-useless-fallback-in-spread": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-useless-fallback-in-spread": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.16.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-useless-fallback-in-spread.md)
