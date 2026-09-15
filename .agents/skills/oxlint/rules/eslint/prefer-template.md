---
title: "eslint/prefer-template"
rule: "eslint/prefer-template"
category: "Style"
version: "1.12.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://eslint.org/docs/latest/rules/prefer-template"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Require template literals instead of string concatenation.

### Why is this bad?

In ES2015 (ES6), we can use template literals instead of string concatenation.

### Examples

Examples of **incorrect** code for this rule:

```js
const str = "Hello, " + name + "!";
const str1 = "Time: " + 12 * 60 * 60 * 1000;
```

Examples of **correct** code for this rule:

```js
const str = "Hello World!";
const str2 = `Time: ${12 * 60 * 60 * 1000}`;
const str4 = "Hello, " + "World!";
```

## How to use

```json
{
  "rules": {
    "eslint/prefer-template": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/prefer-template": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.12.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/prefer-template)
