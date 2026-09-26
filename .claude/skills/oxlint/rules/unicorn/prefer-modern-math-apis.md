---
title: "unicorn/prefer-modern-math-apis"
rule: "unicorn/prefer-modern-math-apis"
category: "Restriction"
version: "0.1.1"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-modern-math-apis.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Checks for usage of legacy patterns for mathematical operations.

### Why is this bad?

Modern JavaScript provides more concise and readable alternatives to legacy patterns.

Currently, the following cases are checked:

- Prefer `Math.log10(x)` over alternatives
- Prefer `Math.hypot(…)` over alternatives

### Examples

Examples of **incorrect** code for this rule:

```javascript
Math.log(x) * Math.LOG10E;
Math.sqrt(a * a + b * b);
```

Examples of **correct** code for this rule:

```javascript
Math.log10(x);
Math.hypot(a, b);
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-modern-math-apis": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-modern-math-apis": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.1.1.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-modern-math-apis.md)
