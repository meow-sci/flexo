---
title: "jsdoc/require-param-name"
rule: "jsdoc/require-param-name"
category: "Pedantic"
version: "0.4.3"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireParamName.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Requires that all `@param` tags have names.

### Why is this bad?

The name of a param should be documented.

### Examples

Examples of **incorrect** code for this rule:

```javascript
/** @param {SomeType} */
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
    "jsdoc/require-param-name": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsdoc/require-param-name": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.3.

## References

- [Upstream rule documentation](https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireParamName.md)
