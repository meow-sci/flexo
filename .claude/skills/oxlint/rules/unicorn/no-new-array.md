---
title: "unicorn/no-new-array"
rule: "unicorn/no-new-array"
category: "Correctness"
version: "0.0.16"
default: true
type_aware: false
fix: "fixable_dangerous_suggestion"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-new-array.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_dangerous_suggestion |
| Type-aware | no |


### What it does

Disallow `new Array()`.

### Why is this bad?

When using the `Array` constructor with one argument, it's not clear whether the argument is meant to be the length of the array or the only element.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const array = new Array(1);
const array = new Array(42);
const array = new Array(foo);
```

Examples of **correct** code for this rule:

```javascript
const array = Array.from({ length: 42 });
const array = [42];
```

## How to use

```json
{
  "rules": {
    "unicorn/no-new-array": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-new-array": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.16.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-new-array.md)
