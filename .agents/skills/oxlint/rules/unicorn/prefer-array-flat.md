---
title: "unicorn/prefer-array-flat"
rule: "unicorn/prefer-array-flat"
category: "Pedantic"
version: "0.0.20"
default: false
type_aware: false
fix: "conditional_dangerous_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-array-flat.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | conditional_dangerous_fix |
| Type-aware | no |


### What it does

Prefers `Array#flat()` over legacy techniques to flatten arrays.

### Why is this bad?

ES2019 introduced a new method [`Array#flat()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flat) that flatten arrays.

This rule aims to standardize the use of `Array#flat()` over legacy techniques to flatten arrays.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const foo = array.flatMap((x) => x);
const foo = array.reduce((a, b) => a.concat(b), []);
const foo = array.reduce((a, b) => [...a, ...b], []);
const foo = [].concat(maybeArray);
const foo = [].concat(...array);
const foo = [].concat.apply([], array);
const foo = Array.prototype.concat.apply([], array);
const foo = Array.prototype.concat.call([], maybeArray);
const foo = Array.prototype.concat.call([], ...array);
```

Examples of **correct** code for this rule:

```javascript
const foo = array.flat();
const foo = [maybeArray].flat();
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-array-flat": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-array-flat": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.20.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-array-flat.md)
