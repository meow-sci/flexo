---
title: "eslint/symbol-description"
rule: "eslint/symbol-description"
category: "Pedantic"
version: "0.4.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/symbol-description"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Require symbol descriptions.

### Why is this bad?

The Symbol function may have an optional description.

```js
var foo = Symbol("some description");

var someString = "some description";
var bar = Symbol(someString);
```

Using `description` promotes easier debugging: when a symbol is logged the description is used:

```js
var foo = Symbol("some description");

console.log(foo);
// prints - Symbol(some description)
```

### Examples

Examples of **incorrect** code for this rule:

```javascript
var foo = Symbol();
```

Examples of **correct** code for this rule:

```javascript
var foo = Symbol("some description");
```

## How to use

```json
{
  "rules": {
    "eslint/symbol-description": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/symbol-description": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/symbol-description)
