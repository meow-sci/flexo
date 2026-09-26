---
title: "jsdoc/require-throws-description"
rule: "jsdoc/require-throws-description"
category: "Style"
version: "1.65.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireThrowsDescription.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Requires a description for `@throws` tags.

### Why is this bad?

A `@throws` tag should explain the condition or reason an error may be thrown.

### Examples

Examples of **incorrect** code for this rule:

```js
/**
 * @throws {Error}
 */
function quux() {
  throw new Error("error");
}
```

Examples of **correct** code for this rule:

```js
/**
 * @throws {Error} Has a description
 */
function quux() {
  throw new Error("error");
}
```

## How to use

```json
{
  "rules": {
    "jsdoc/require-throws-description": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsdoc/require-throws-description": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.65.0.

## References

- [Upstream rule documentation](https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireThrowsDescription.md)
