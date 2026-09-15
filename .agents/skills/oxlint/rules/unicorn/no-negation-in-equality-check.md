---
title: "unicorn/no-negation-in-equality-check"
rule: "unicorn/no-negation-in-equality-check"
category: "Pedantic"
version: "0.5.3"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-negation-in-equality-check.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Disallow negated expressions on the left of (in)equality checks.

### Why is this bad?

A negated expression on the left of an (in)equality check is likely a mistake from trying to negate the whole condition.

### Examples

Examples of **incorrect** code for this rule:

```javascript
if (!foo === bar) {
}

if (!foo !== bar) {
}
```

Examples of **correct** code for this rule:

```javascript
if (foo !== bar) {
}

if (!(foo === bar)) {
}
```

## How to use

```json
{
  "rules": {
    "unicorn/no-negation-in-equality-check": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-negation-in-equality-check": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.5.3.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-negation-in-equality-check.md)
