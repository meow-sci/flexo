---
title: "eslint/no-new-native-nonconstructor"
rule: "eslint/no-new-native-nonconstructor"
category: "Correctness"
version: "0.3.3"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-new-native-nonconstructor"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow `new` operators with global non-constructor functions (`Symbol`, `BigInt`).

This rule can be disabled for TypeScript code, as the TypeScript compiler
enforces this check.

### Why is this bad?

Both `new Symbol` and `new BigInt` throw a type error because they are
functions and not classes. It is easy to make this mistake by assuming
the uppercase letters indicate classes.

### Examples

Examples of **incorrect** code for this rule:

```js
// throws a TypeError
let foo = new Symbol("foo");

// throws a TypeError
let result = new BigInt(9007199254740991);
```

Examples of **correct** code for this rule:

```js
let foo = Symbol("foo");

let result = BigInt(9007199254740991);
```

## How to use

```json
{
  "rules": {
    "eslint/no-new-native-nonconstructor": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-new-native-nonconstructor": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.3.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-new-native-nonconstructor)
