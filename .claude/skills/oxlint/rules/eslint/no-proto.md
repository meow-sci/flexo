---
title: "eslint/no-proto"
rule: "eslint/no-proto"
category: "Restriction"
version: "0.2.14"
default: false
type_aware: false
fix: "pending"
upstream: "https://eslint.org/docs/latest/rules/no-proto"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallow the use of the `__proto__` property.

### Why is this bad?

The `__proto__` property has been deprecated as of ECMAScript 3.1 and
shouldn’t be used in new code. Use `Object.getPrototypeOf` and
`Object.setPrototypeOf` instead.

For more information, see
[the MDN documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/proto).

### Examples

Examples of **incorrect** code for this rule:

```javascript
var a = obj.__proto__;

var a = obj["__proto__"];

obj.__proto__ = b;

obj["__proto__"] = b;
```

## How to use

```json
{
  "rules": {
    "eslint/no-proto": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-proto": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.14.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-proto)
