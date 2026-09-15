---
title: "jsdoc/require-yields-description"
rule: "jsdoc/require-yields-description"
category: "Style"
version: "next"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireYieldsDescription.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Requires a description for `@yields` tags.

### Why is this bad?

A `@yields` tag should explain what the generator yields.

### Examples

Examples of **incorrect** code for this rule:

```js
/**
 * @yields {string}
 */
function* quux() {
  yield "value";
}
```

Examples of **correct** code for this rule:

```js
/**
 * @yields {string} The next value.
 */
function* quux() {
  yield "value";
}
```

## How to use

```json
{
  "rules": {
    "jsdoc/require-yields-description": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsdoc/require-yields-description": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in vnext.

## References

- [Upstream rule documentation](https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireYieldsDescription.md)
