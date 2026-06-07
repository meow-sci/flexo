---
title: "unicorn/no-static-only-class"
rule: "unicorn/no-static-only-class"
category: "Pedantic"
version: "0.0.16"
default: false
type_aware: false
fix: "fixable_dangerous_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-static-only-class.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_dangerous_fix |
| Type-aware | no |


### What it does

Disallow `class` declarations that exclusively contain `static` members.

### Why is this bad?

A `class` with only `static` members should just be defined as an object instead.

### Examples

Examples of **incorrect** code for this rule:

```javascript
class A {
  static a() {}
}
```

Examples of **correct** code for this rule:

```javascript
class A {
  static a() {}

  constructor() {}
}
```

```javascript
const X = {
  foo: false,
  bar() {},
};
```

```javascript
class X {
  static #foo = false; // private field
  static bar() {}
}
```

## How to use

```json
{
  "rules": {
    "unicorn/no-static-only-class": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-static-only-class": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.16.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-static-only-class.md)
