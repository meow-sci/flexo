---
title: "jsdoc/implements-on-classes"
rule: "jsdoc/implements-on-classes"
category: "Correctness"
version: "0.3.2"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/implementsOnClasses.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Reports an issue with any non-constructor function using `@implements`.

### Why is this bad?

Constructor functions should be
whether marked with `@class`, `@constructs`, or being a class constructor.

### Examples

Examples of **incorrect** code for this rule:

```javascript
/**
 * @implements {SomeClass}
 */
function quux() {}
```

Examples of **correct** code for this rule:

```javascript
class Foo {
  /**
   * @implements {SomeClass}
   */
  constructor() {}
}
/**
 * @implements {SomeClass}
 * @class
 */
function quux() {}
```

## How to use

```json
{
  "rules": {
    "jsdoc/implements-on-classes": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jsdoc/implements-on-classes": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.3.2.

## References

- [Upstream rule documentation](https://github.com/gajus/eslint-plugin-jsdoc/blob/main/docs/rules/implementsOnClasses.md)
