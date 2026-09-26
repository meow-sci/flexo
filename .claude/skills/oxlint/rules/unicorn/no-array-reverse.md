---
title: "unicorn/no-array-reverse"
rule: "unicorn/no-array-reverse"
category: "Suspicious"
version: "1.15.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-array-reverse.md"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Prefer using `Array#toReversed()` over `Array#reverse()`.

### Why is this bad?

`Array#reverse()` modifies the original array in place, which can lead to unintended side effects—especially
when the original array is used elsewhere in the code.

### Examples

Examples of **incorrect** code for this rule:

```js
const reversed = [...array].reverse();
```

Examples of **correct** code for this rule:

```js
const reversed = [...array].toReversed();
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowExpressionStatement

type: `boolean`

default: `true`

This rule allows `array.reverse()` as an expression statement by default.
Set to `false` to forbid `Array#reverse()` even if it's an expression statement.

Examples of **incorrect** code for this rule with this option set to `false`:

```js
array.reverse();
```

## How to use

```json
{
  "rules": {
    "unicorn/no-array-reverse": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-array-reverse": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.15.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-array-reverse.md)
