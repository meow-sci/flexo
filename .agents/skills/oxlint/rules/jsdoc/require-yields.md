---
title: "jsdoc/require-yields"
rule: "jsdoc/require-yields"
category: "Correctness"
version: "0.3.2"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireYields.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Requires that yields are documented.
Will also report if multiple `@yields` tags are present.

### Why is this bad?

The rule is intended to prevent the omission of `@yields` tags when they are necessary.

### Examples

Examples of **incorrect** code for this rule:

```javascript
function* quux(foo) {
  yield foo;
}

/**
 * @yields {undefined}
 * @yields {void}
 */
function* quux(foo) {}
```

Examples of **correct** code for this rule:

```javascript
/** * @yields Foo */
function* quux(foo) {
  yield foo;
}
```

## Configuration

This rule accepts a configuration object with the following properties:

### exemptedBy

type: `string[]`

default: `["inheritdoc"]`

Functions with these tags will be exempted from the lint rule.

### forceRequireYields

type: `boolean`

default: `false`

When `true`, all generator functions must have a `@yields` tag, even if they don't yield a value or have an empty body.

### withGeneratorTag

type: `boolean`

default: `false`

When `true`, require `@yields` when a `@generator` tag is present.

## How to use

```json
{
  "rules": {
    "jsdoc/require-yields": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsdoc/require-yields": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.3.2.

## References

- [Upstream rule documentation](https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireYields.md)
