---
title: "jsdoc/require-property-name"
rule: "jsdoc/require-property-name"
category: "Correctness"
version: "0.2.18"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requirePropertyName.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Requires that all `@property` tags have names.

### Why is this bad?

The name of a property type should be documented.

### Examples

Examples of **incorrect** code for this rule:

```javascript
/**
 * @typedef {SomeType} SomeTypedef
 * @property {number}
 */
```

Examples of **correct** code for this rule:

```javascript
/**
 * @typedef {SomeType} SomeTypedef
 * @property {number} foo
 */
```

## How to use

```json
{
  "rules": {
    "jsdoc/require-property-name": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsdoc/require-property-name": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.18.

## References

- [Upstream rule documentation](https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requirePropertyName.md)
