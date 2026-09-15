---
title: "eslint/no-implied-eval"
rule: "eslint/no-implied-eval"
category: "Suspicious"
version: "1.66.0"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-implied-eval"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallows passing strings to `setTimeout()`, `setInterval()`, and
`execScript()`.

### Why is this bad?

Passing a string to these APIs evaluates the string as JavaScript source
text at runtime. This has many of the same security, readability, and
performance problems as `eval()`. Pass a function instead.

### Examples

Examples of **incorrect** code for this rule:

```js
setTimeout("alert('Hi!')", 100);
setInterval("doWork()", 1000);
window.setTimeout("doWork()", 100);
```

Examples of **correct** code for this rule:

```js
setTimeout(() => alert("Hi!"), 100);
setInterval(doWork, 1000);
window.setTimeout(doWork, 100);
```

## How to use

```json
{
  "rules": {
    "eslint/no-implied-eval": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-implied-eval": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.66.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-implied-eval)
