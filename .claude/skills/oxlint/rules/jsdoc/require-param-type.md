---
title: "jsdoc/require-param-type"
rule: "jsdoc/require-param-type"
category: "Pedantic"
version: "0.4.4"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireParamType.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Requires that each `@param` tag has a type value (within curly brackets).

### Why is this bad?

The type of a parameter should be documented.

### Examples

Examples of **incorrect** code for this rule:

```javascript
/** @param foo */
function quux(foo) {}
```

Examples of **correct** code for this rule:

```javascript
/** @param {SomeType} foo */
function quux(foo) {}
```

## How to use

```json
{
  "rules": {
    "jsdoc/require-param-type": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsdoc/require-param-type": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.4.

## References

- [Upstream rule documentation](https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireParamType.md)
