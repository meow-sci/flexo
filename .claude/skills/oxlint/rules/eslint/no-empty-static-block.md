---
title: "eslint/no-empty-static-block"
rule: "eslint/no-empty-static-block"
category: "Correctness"
version: "0.0.19"
default: true
type_aware: false
fix: "fixable_suggestion"
upstream: "https://eslint.org/docs/latest/rules/no-empty-static-block"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Disallows the usages of empty static blocks.

### Why is this bad?

Empty block statements, while not technically errors, usually occur due
to refactoring that wasn’t completed. They can cause confusion when
reading code.

### Examples

Examples of **incorrect** code for this rule:

```js
class Foo {
  static {}
}
```

Examples of **correct** code for this rule:

```js
class Foo {
  static {
    // blocks with comments are allowed
  }
}
class Bar {
  static {
    doSomething();
  }
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-empty-static-block": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-empty-static-block": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.19.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-empty-static-block)
