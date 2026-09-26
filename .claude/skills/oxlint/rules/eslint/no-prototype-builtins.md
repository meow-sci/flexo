---
title: "eslint/no-prototype-builtins"
rule: "eslint/no-prototype-builtins"
category: "Pedantic"
version: "0.0.5"
default: false
type_aware: false
fix: "pending"
upstream: "https://eslint.org/docs/latest/rules/no-prototype-builtins"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallow calling some `Object.prototype` methods directly on objects.

### Why is this bad?

In ECMAScript 5.1, `Object.create` was added, which enables the creation of objects with a specified [[Prototype]].
`Object.create(null)` is a common pattern used to create objects that will be used as a Map.
This can lead to errors when it is assumed that objects will have properties from `Object.prototype`. This rule prevents calling some `Object.prototype` methods directly from an object.
Additionally, objects can have properties that shadow the builtins on `Object.prototype`, potentially causing unintended behavior or denial-of-service security vulnerabilities.
For example, it would be unsafe for a webserver to parse JSON input from a client and call `hasOwnProperty` directly on the resulting object, because a malicious client could send a JSON value like {"hasOwnProperty": 1} and cause the server to crash.

To avoid subtle bugs like this, it’s better to always call these methods from `Object.prototype`. For example, `foo.hasOwnProperty("bar")` should be replaced with `Object.prototype.hasOwnProperty.call(foo, "bar")`.

### Examples

Examples of **incorrect** code for this rule:

```javascript
var hasBarProperty = foo.hasOwnProperty("bar");
var isPrototypeOfBar = foo.isPrototypeOf(bar);
var barIsEnumerable = foo.propertyIsEnumerable("bar");
```

## How to use

```json
{
  "rules": {
    "eslint/no-prototype-builtins": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-prototype-builtins": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.5.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-prototype-builtins)
