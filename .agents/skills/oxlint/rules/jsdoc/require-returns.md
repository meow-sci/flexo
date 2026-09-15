---
title: "jsdoc/require-returns"
rule: "jsdoc/require-returns"
category: "Pedantic"
version: "0.4.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireReturns.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Requires that return statements are documented.
Will also report if multiple `@returns` tags are present.

### Why is this bad?

The rule is intended to prevent the omission of `@returns` tag when necessary.

### Examples

Examples of **incorrect** code for this rule:

```javascript
/** Foo. */
function quux() {
  return foo;
}

/**
 * @returns Foo!
 * @returns Foo?
 */
function quux() {
  return foo;
}
```

Examples of **correct** code for this rule:

```javascript
/** @returns Foo. */
function quux() {
  return foo;
}
```

## Configuration

This rule accepts a configuration object with the following properties:

### checkConstructors

type: `boolean`

default: `false`

Whether to check constructor methods.

### checkGetters

type: `boolean`

default: `true`

Whether to check getter methods.

### exemptedBy

type: `string[]`

default: `["inheritdoc"]`

Tags that exempt functions from requiring `@returns`.

### forceRequireReturn

type: `boolean`

default: `false`

Whether to require a `@returns` tag even if the function doesn't return a value.

### forceReturnsWithAsync

type: `boolean`

default: `false`

Whether to require a `@returns` tag for async functions.

## How to use

```json
{
  "rules": {
    "jsdoc/require-returns": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsdoc/require-returns": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.0.

## References

- [Upstream rule documentation](https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/requireReturns.md)
