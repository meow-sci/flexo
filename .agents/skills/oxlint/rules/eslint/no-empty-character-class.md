---
title: "eslint/no-empty-character-class"
rule: "eslint/no-empty-character-class"
category: "Correctness"
version: "0.0.7"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-empty-character-class"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow empty character classes in regular expressions.

### Why is this bad?

Because empty character classes in regular expressions do not match anything, they might be typing mistakes.

### Examples

Examples of **incorrect** code for this rule:

```javascript
var foo = /^abc[]/;
```

Examples of **correct** code for this rule:

```javascript
var foo = /^abc/;
var foo2 = /^abc[123]/;
```

## How to use

```json
{
  "rules": {
    "eslint/no-empty-character-class": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-empty-character-class": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.7.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-empty-character-class)
