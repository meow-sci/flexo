---
title: "jsdoc/require-returns-description"
rule: "jsdoc/require-returns-description"
category: "Pedantic"
version: "0.4.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireReturnsDescription.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Requires that the `@returns` tag has a description value.
The error will not be reported if the return value is `void `or `undefined` or if it is `Promise<void>` or `Promise<undefined>`.

### Why is this bad?

A `@returns` tag should have a description value.

### Examples

Examples of **incorrect** code for this rule:

```javascript
/** @returns */
function quux(foo) {}
```

Examples of **correct** code for this rule:

```javascript
/** @returns Foo. */
function quux(foo) {}
```

## How to use

```json
{
  "rules": {
    "jsdoc/require-returns-description": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsdoc/require-returns-description": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.0.

## References

- [Upstream rule documentation](https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireReturnsDescription.md)
