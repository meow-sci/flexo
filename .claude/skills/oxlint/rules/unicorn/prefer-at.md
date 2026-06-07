---
title: "unicorn/prefer-at"
rule: "unicorn/prefer-at"
category: "Pedantic"
version: "1.20.0"
default: false
type_aware: false
fix: "fixable_dangerous_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-at.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_dangerous_fix |
| Type-aware | no |


### What it does

Prefer the [`Array#at()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/at) and
[`String#at()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/at)
methods for index access.

This rule also discourages using [`String#charAt()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/charAt).

### Why is this bad?

The `.at()` method is more readable and consistent for accessing elements by index,
especially for negative indices which access elements from the end of the array or string.

### Examples

Examples of **incorrect** code for this rule:

```js
const foo = array[array.length - 1];
const foo = array.slice(-1)[0];
const foo = string.charAt(string.length - 1);
```

Examples of **correct** code for this rule:

```js
const foo = array.at(-1);
const foo = array.at(-5);
const foo = string.at(-1);
```

## Configuration

This rule accepts a configuration object with the following properties:

### checkAllIndexAccess

type: `boolean`

default: `false`

Check all index access, not just special patterns like `array.length - 1`.
When enabled, `array[0]`, `array[1]`, etc. will also be flagged.

### getLastElementFunctions

type: `string[]`

default: `[]`

List of function names to treat as "get last element" functions.
These functions will be checked for `.at(-1)` usage.

## How to use

```json
{
  "rules": {
    "unicorn/prefer-at": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-at": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.20.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-at.md)
