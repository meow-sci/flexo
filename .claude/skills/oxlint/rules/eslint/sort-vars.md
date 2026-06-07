---
title: "eslint/sort-vars"
rule: "eslint/sort-vars"
category: "Pedantic"
version: "0.9.3"
default: false
type_aware: false
fix: "pending"
upstream: "https://eslint.org/docs/latest/rules/sort-vars"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

When declaring multiple variables within the same block, sorting variable names make it
easier to find necessary variable easier at a later time.

### Why is this bad?

Unsorted variable declarations can make the code harder to read and maintain.

### Examples

Examples of **incorrect** code for this rule:

```js
var b, a;
var a, B, c;
```

Examples of **correct** code for this rule:

```js
var a, b, c, d;
var B, a, c;
```

## Configuration

This rule accepts a configuration object with the following properties:

### ignoreCase

type: `boolean`

default: `false`

When `true`, the rule ignores case-sensitivity when sorting variables.

## How to use

```json
{
  "rules": {
    "eslint/sort-vars": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/sort-vars": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.9.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/sort-vars)
