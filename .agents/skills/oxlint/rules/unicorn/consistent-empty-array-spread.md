---
title: "unicorn/consistent-empty-array-spread"
rule: "unicorn/consistent-empty-array-spread"
category: "Pedantic"
version: "0.10.1"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/consistent-empty-array-spread.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

When spreading a ternary in an array, we can use both `[]` and `''` as fallbacks,
but it's better to have consistent types in both branches.

### Why is this bad?

Having consistent types in both branches makes the code easier to read and understand.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const array = [a, ...(foo ? [b, c] : "")];

const array = [a, ...(foo ? "bc" : [])];
```

Examples of **correct** code for this rule:

```javascript
const array = [a, ...(foo ? [b, c] : [])];

const array = [a, ...(foo ? "bc" : "")];
```

## How to use

```json
{
  "rules": {
    "unicorn/consistent-empty-array-spread": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/consistent-empty-array-spread": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.10.1.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/consistent-empty-array-spread.md)
