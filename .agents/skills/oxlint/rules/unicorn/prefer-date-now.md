---
title: "unicorn/prefer-date-now"
rule: "unicorn/prefer-date-now"
category: "Pedantic"
version: "0.0.16"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-date-now.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Prefers use of `Date.now()` over `new Date().getTime()` or `new Date().valueOf()`.

### Why is this bad?

Using `Date.now()` is shorter and nicer than `new Date().getTime()`, and avoids unnecessary instantiation of `Date` objects.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const ts = new Date().getTime();
const ts = new Date().valueOf();
```

Examples of **correct** code for this rule:

```javascript
const ts = Date.now();
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-date-now": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-date-now": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.16.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-date-now.md)
