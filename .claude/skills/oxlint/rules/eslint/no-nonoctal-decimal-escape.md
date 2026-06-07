---
title: "eslint/no-nonoctal-decimal-escape"
rule: "eslint/no-nonoctal-decimal-escape"
category: "Correctness"
version: "0.2.10"
default: true
type_aware: false
fix: "fixable_suggestion"
upstream: "https://eslint.org/docs/latest/rules/no-nonoctal-decimal-escape"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

This rule disallows \8 and \9 escape sequences in string literals.

### Why is this bad?

ECMAScript specification treats \8 and \9 in string literals as a legacy feature

### Examples

Examples of **incorrect** code for this rule:

```javascript
let x = "\8";
let y = "\9";
```

Examples of **correct** code for this rule:

```javascript
let x = "8";
let y = "\\9";
```

## How to use

```json
{
  "rules": {
    "eslint/no-nonoctal-decimal-escape": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-nonoctal-decimal-escape": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.10.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-nonoctal-decimal-escape)
