---
title: "jsdoc/check-property-names"
rule: "jsdoc/check-property-names"
category: "Correctness"
version: "0.2.18"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/checkPropertyNames.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Ensures that property names in JSDoc are not duplicated on the same block and that nested properties have defined roots.

### Why is this bad?

`@property` tags with the same name can be confusing and may indicate a mistake.

### Examples

Examples of **incorrect** code for this rule:

```javascript
/**
 * @typedef {object} state
 * @property {number} foo
 * @property {string} foo
 */

/**
 * @typedef {object} state
 * @property {number} foo.bar
 */
```

Examples of **correct** code for this rule:

```javascript
/**
 * @typedef {object} state
 * @property {number} foo
 */

/**
 * @typedef {object} state
 * @property {object} foo
 * @property {number} foo.bar
 */
```

## How to use

```json
{
  "rules": {
    "jsdoc/check-property-names": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsdoc/check-property-names": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.18.

## References

- [Upstream rule documentation](https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/checkPropertyNames.md)
