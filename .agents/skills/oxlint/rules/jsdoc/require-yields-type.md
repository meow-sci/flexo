---
title: "jsdoc/require-yields-type"
rule: "jsdoc/require-yields-type"
category: "Pedantic"
version: "1.65.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireYieldsType.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Requires a type on the `@yields` tag.

### Why is this bad?

A `@yields` tag should document the type yielded by the generator.

### Examples

Examples of **incorrect** code for this rule:

```js
/** @yields */
function* quux() {}
```

Examples of **correct** code for this rule:

```js
/** @yields {string} */
function* quux() {}
```

## How to use

```json
{
  "rules": {
    "jsdoc/require-yields-type": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsdoc/require-yields-type": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.65.0.

## References

- [Upstream rule documentation](https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireYieldsType.md)
