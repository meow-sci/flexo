---
title: "jsdoc/require-property-description"
rule: "jsdoc/require-property-description"
category: "Correctness"
version: "0.2.18"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requirePropertyDescription.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Requires that all `@property` tags have descriptions.

### Why is this bad?

The description of a property should be documented.

### Examples

Examples of **incorrect** code for this rule:

```javascript
/**
 * @typedef {SomeType} SomeTypedef
 * @property {number} foo
 */
```

Examples of **correct** code for this rule:

```javascript
/**
 * @typedef {SomeType} SomeTypedef
 * @property {number} foo Foo.
 */
```

## How to use

```json
{
  "rules": {
    "jsdoc/require-property-description": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsdoc/require-property-description": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.18.

## References

- [Upstream rule documentation](https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requirePropertyDescription.md)
