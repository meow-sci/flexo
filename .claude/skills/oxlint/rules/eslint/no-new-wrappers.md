---
title: "eslint/no-new-wrappers"
rule: "eslint/no-new-wrappers"
category: "Pedantic"
version: "0.2.10"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://eslint.org/docs/latest/rules/no-new-wrappers"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallow `new` operators with the `String`, `Number`, and `Boolean` objects.

### Why is this bad?

The first problem is that primitive wrapper objects are, in fact,
objects. That means `typeof` will return `"object"` instead of `"string"`,
`"number"`, or `"boolean"`. The second problem comes with boolean
objects. Every object is truthy, that means an instance of `Boolean`
always resolves to `true` even when its actual value is `false`.

https://eslint.org/docs/latest/rules/no-new-wrappers

### Examples

Examples of **incorrect** code for this rule:

```js
var stringObject = new String("Hello world");
var numberObject = new Number(33);
var booleanObject = new Boolean(false);
var symbolObject = new Symbol("foo"); // symbol is not a constructor
```

Examples of **correct** code for this rule:

```js
var stringObject = "Hello world";
var stringObject2 = String(value);
var numberObject = Number(value);
var booleanObject = Boolean(value);
var symbolObject = Symbol("foo");
```

## How to use

```json
{
  "rules": {
    "eslint/no-new-wrappers": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-new-wrappers": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.10.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-new-wrappers)
