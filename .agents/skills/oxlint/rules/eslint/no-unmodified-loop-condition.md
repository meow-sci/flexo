---
title: "eslint/no-unmodified-loop-condition"
rule: "eslint/no-unmodified-loop-condition"
category: "Suspicious"
version: "1.48.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-unmodified-loop-condition"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow references in loop conditions that are never modified within the loop.

### Why is this bad?

A loop condition that depends on values that never change within the loop body
can cause infinite loops or logic bugs.

### Examples

Examples of **incorrect** code for this rule:

```js
let done = false;
while (!done) {
  work();
}
```

Examples of **correct** code for this rule:

```js
let done = false;
while (!done) {
  done = checkDone();
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-unmodified-loop-condition": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-unmodified-loop-condition": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.48.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-unmodified-loop-condition)
