---
title: "eslint/prefer-object-has-own"
rule: "eslint/prefer-object-has-own"
category: "Style"
version: "0.11.0"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://eslint.org/docs/latest/rules/prefer-object-has-own"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

Disallow use of `Object.prototype.hasOwnProperty.call()` and prefer use of `Object.hasOwn()`

### Why is this bad?

It is very common to write code like:

```javascript
if (Object.prototype.hasOwnProperty.call(object, "foo")) {
  console.log("has property foo");
}
```

This is a common practice because methods on `Object.prototype` can sometimes be unavailable or redefined (see the no-prototype-builtins rule).
Introduced in ES2022, `Object.hasOwn()` is a shorter alternative to `Object.prototype.hasOwnProperty.call()`:

```javascript
if (Object.hasOwn(object, "foo")) {
  console.log("has property foo");
}
```

### Examples

Examples of **incorrect** code for this rule:

```js
Object.prototype.hasOwnProperty.call(obj, "a");
Object.hasOwnProperty.call(obj, "a");
({}).hasOwnProperty.call(obj, "a");
const hasProperty = Object.prototype.hasOwnProperty.call(object, property);
```

Examples of **correct** code for this rule:

```js
Object.hasOwn(obj, "a");
const hasProperty = Object.hasOwn(object, property);
```

## How to use

```json
{
  "rules": {
    "eslint/prefer-object-has-own": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/prefer-object-has-own": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.11.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/prefer-object-has-own)
