---
title: "unicorn/prefer-structured-clone"
rule: "unicorn/prefer-structured-clone"
category: "Style"
version: "0.9.0"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-structured-clone.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Prefer using `structuredClone` to create a deep clone.

### Why is this bad?

`structuredClone` is the modern way to create a deep clone of a value.

### Examples

Examples of **incorrect** code for this rule:

```js
const clone = JSON.parse(JSON.stringify(foo));

const clone = _.cloneDeep(foo);
```

Examples of **correct** code for this rule:

```js
const clone = structuredClone(foo);
```

## Configuration

This rule accepts a configuration object with the following properties:

### functions

type: `string[]`

default: `["cloneDeep", "utils.clone"]`

List of functions that are allowed to be used for deep cloning instead of structuredClone.

## How to use

```json
{
  "rules": {
    "unicorn/prefer-structured-clone": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-structured-clone": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.9.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-structured-clone.md)
