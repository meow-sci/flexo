---
title: "eslint/no-useless-concat"
rule: "eslint/no-useless-concat"
category: "Suspicious"
version: "0.4.2"
default: false
type_aware: false
fix: "pending"
upstream: "https://eslint.org/docs/latest/rules/no-useless-concat"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallow unnecessary concatenation of literals or template literals.

### Why is this bad?

It’s unnecessary to concatenate two strings together when they could
be combined into a single literal.

### Examples

Examples of **incorrect** code for this rule:

```javascript
var foo = "a" + "b";
```

```javascript
var foo = "a" + "b" + "c";
```

Examples of **correct** code for this rule:

```javascript
var foo = "a" + bar;

// When the string concatenation is multiline
var foo = "a" + "b" + "c";
```

## How to use

```json
{
  "rules": {
    "eslint/no-useless-concat": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-useless-concat": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.2.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-useless-concat)
