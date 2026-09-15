---
title: "unicorn/no-array-sort"
rule: "unicorn/no-array-sort"
category: "Suspicious"
version: "1.15.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-array-sort.md"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Prefer using `Array#toSorted()` over `Array#sort()`.

### Why is this bad?

`Array#sort()` modifies the original array in place, which can lead to unintended side effects—especially
when the original array is used elsewhere in the code.

### Examples

Examples of **incorrect** code for this rule:

```js
const sorted = [...array].sort();
```

Examples of **correct** code for this rule:

```js
const sorted = [...array].toSorted();
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowExpressionStatement

type: `boolean`

default: `true`

When set to `true` (default), allows `array.sort()` as an expression statement.
Set to `false` to forbid `Array#sort()` even if it's an expression statement.

Example of **incorrect** code for this rule with `allowExpressionStatement` set to `false`:

```js
array.sort();
```

## How to use

```json
{
  "rules": {
    "unicorn/no-array-sort": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-array-sort": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.15.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-array-sort.md)
