---
title: "eslint/no-var"
rule: "eslint/no-var"
category: "Restriction"
version: "0.1.1"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://eslint.org/docs/latest/rules/no-var"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

ECMAScript 2015 allows programmers to create variables with block scope
instead of function scope using the `let` and `const` keywords. Block
scope is common in many other programming languages and helps
programmers avoid mistakes.

### Why is this bad?

Using `var` in an ES2015 environment triggers this error

### Examples

Examples of **incorrect** code for this rule:

```javascript
var x = "y";
var CONFIG = {};
```

Examples of **correct** code for this rule:

```javascript
let x = "y";
const CONFIG = {};
```

## How to use

```json
{
  "rules": {
    "eslint/no-var": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-var": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.1.1.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-var)
