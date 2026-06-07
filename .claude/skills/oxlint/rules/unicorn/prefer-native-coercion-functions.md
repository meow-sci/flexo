---
title: "unicorn/prefer-native-coercion-functions"
rule: "unicorn/prefer-native-coercion-functions"
category: "Pedantic"
version: "0.0.19"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-native-coercion-functions.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Prefers built in functions, over custom ones with the same functionality.

### Why is this bad?

If a function is equivalent to [`String`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [`Number`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [`BigInt`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt), [`Boolean`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean), or [`Symbol`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol), you should use the built-in one directly.
Wrapping the built-in in a function is moot.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const foo = (v) => String(v);
foo(1);
const foo = (v) => Number(v);
array.some((v) => /* comment */ v);
```

Examples of **correct** code for this rule:

```javascript
String(1);
Number(1);
array.some(Boolean);
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-native-coercion-functions": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-native-coercion-functions": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.19.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-native-coercion-functions.md)
