---
title: "promise/avoid-new"
rule: "promise/avoid-new"
category: "Style"
version: "0.6.1"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/avoid-new.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow creating promises with `new Promise()`.

### Why is this bad?

Many cases that use `new Promise()` could be refactored to use an
`async` function. `async` is considered more idiomatic in modern JavaScript.

### Examples

Examples of **incorrect** code for this rule:

```javascript
function foo() {
  return new Promise((resolve, reject) => {
    /* ... */
  });
}
```

Examples of **correct** code for this rule:

```javascript
async function foo() {
  // ...
}
const bar = await Promise.all([baz(), bang()]);
```

## How to use

```json
{
  "rules": {
    "promise/avoid-new": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "promise/avoid-new": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.6.1.

## References

- [Upstream rule documentation](https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/avoid-new.md)
