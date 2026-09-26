---
title: "unicorn/new-for-builtins"
rule: "unicorn/new-for-builtins"
category: "Pedantic"
version: "0.0.16"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/new-for-builtins.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Enforces the use of `new` for the following builtins: `Object`, `Array`, `ArrayBuffer`, `BigInt64Array`,
`BigUint64Array`, `DataView`, `Date`, `Error`, `Float32Array`, `Float64Array`, `Function`, `Int8Array`,
`Int16Array`, `Int32Array`, `Map`, `WeakMap`, `Set`, `WeakSet`, `Promise`, `RegExp`, `Uint8Array`,
`Uint16Array`, `Uint32Array`, `Uint8ClampedArray`, `SharedArrayBuffer`, `Proxy`, `WeakRef`, `FinalizationRegistry`.

Disallows the use of `new` for the following builtins: `String`, `Number`, `Boolean`, `Symbol`, `BigInt`.

### Why is this bad?

Using `new` inconsistently can cause confusion. Constructors like `Array` and `RegExp` should always use `new`
to ensure the expected instance type. Meanwhile, `String`, `Number`, `Boolean`, `Symbol`, and `BigInt` should not use `new`,
as they create object wrappers instead of primitive values.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const foo = new String("hello world");
const bar = Array(1, 2, 3);
```

Examples of **correct** code for this rule:

```javascript
const foo = String("hello world");
const bar = new Array(1, 2, 3);
```

## How to use

```json
{
  "rules": {
    "unicorn/new-for-builtins": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/new-for-builtins": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.16.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/new-for-builtins.md)
