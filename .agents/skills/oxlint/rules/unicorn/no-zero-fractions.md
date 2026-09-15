---
title: "unicorn/no-zero-fractions"
rule: "unicorn/no-zero-fractions"
category: "Style"
version: "0.0.18"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-zero-fractions.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Prevents the use of zero fractions.

### Why is this bad?

There is no difference in JavaScript between, for example, `1`, `1.0` and `1.`, so prefer the former for consistency and brevity.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const foo = 1.0;
const foo = -1.0;
const foo = 123_456.000_000;
```

Examples of **correct** code for this rule:

```javascript
const foo = 1;
const foo = -1;
const foo = 123456;
const foo = 1.1;
```

## How to use

```json
{
  "rules": {
    "unicorn/no-zero-fractions": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-zero-fractions": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-zero-fractions.md)
