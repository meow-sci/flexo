---
title: "jsdoc/require-throws-type"
rule: "jsdoc/require-throws-type"
category: "Pedantic"
version: "1.65.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireThrowsType.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Requires a type on the `@throws` tag.

### Why is this bad?

A `@throws` tag should document the type of error that may be thrown.

### Examples

Examples of **incorrect** code for this rule:

```js
/** @throws */
function quux() {
  throw new Error("error");
}
```

Examples of **correct** code for this rule:

```js
/** @throws {Error} */
function quux() {
  throw new Error("error");
}
```

## How to use

```json
{
  "rules": {
    "jsdoc/require-throws-type": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsdoc/require-throws-type": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.65.0.

## References

- [Upstream rule documentation](https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireThrowsType.md)
