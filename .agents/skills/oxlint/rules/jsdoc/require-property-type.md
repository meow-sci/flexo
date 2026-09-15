---
title: "jsdoc/require-property-type"
rule: "jsdoc/require-property-type"
category: "Correctness"
version: "0.2.18"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requirePropertyType.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Requires that each `@property` tag has a type value (within curly brackets).

### Why is this bad?

The type of a property should be documented.

### Examples

Examples of **incorrect** code for this rule:

```javascript
/**
 * @typedef {SomeType} SomeTypedef
 * @property foo
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
    "jsdoc/require-property-type": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsdoc/require-property-type": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.18.

## References

- [Upstream rule documentation](https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requirePropertyType.md)
