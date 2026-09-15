---
title: "jsdoc/require-property"
rule: "jsdoc/require-property"
category: "Correctness"
version: "0.2.18"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireProperty.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Requires that all `@typedef` and `@namespace` tags have `@property` tags
when their type is a plain `object`, `Object`, or `PlainObject`.

Note: this rule can be configured via [jsdoc settings](https://oxc.rs/docs/guide/usage/linter/config-file-reference.html#settings) option.

### Why is this bad?

Object type should have properties defined.

### Examples

Examples of **incorrect** code for this rule:

```javascript
/**
 * @typedef {Object} SomeTypedef
 */

/**
 * @namespace {Object} SomeNamespace
 */
```

Examples of **correct** code for this rule:

```javascript
/**
 * @typedef {Object} SomeTypedef
 * @property {SomeType} propName Prop description
 */

/**
 * @typedef {object} Foo
 * @property someProp
 */
```

## How to use

```json
{
  "rules": {
    "jsdoc/require-property": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsdoc/require-property": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.18.

## References

- [Upstream rule documentation](https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireProperty.md)
