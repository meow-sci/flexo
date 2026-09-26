---
title: "jsdoc/require-returns-type"
rule: "jsdoc/require-returns-type"
category: "Pedantic"
version: "0.4.3"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireReturnsType.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Requires that `@returns` tag has a type value (in curly brackets).

### Why is this bad?

A `@returns` tag should have a type value.

### Examples

Examples of **incorrect** code for this rule:

```javascript
/** @returns */
function quux(foo) {}
```

Examples of **correct** code for this rule:

```javascript
/** @returns {string} */
function quux(foo) {}
```

## How to use

```json
{
  "rules": {
    "jsdoc/require-returns-type": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsdoc/require-returns-type": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.3.

## References

- [Upstream rule documentation](https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireReturnsType.md)
