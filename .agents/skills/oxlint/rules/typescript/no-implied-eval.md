---
title: "typescript/no-implied-eval"
rule: "typescript/no-implied-eval"
category: "Correctness"
version: "1.12.0"
default: true
type_aware: true
fix: "none"
upstream: "https://typescript-eslint.io/rules/no-implied-eval/"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | yes |


### What it does

This rule disallows the use of eval-like methods.

### Why is this bad?

It's considered a good practice to avoid using `eval()` in JavaScript. There are security and performance implications involved with doing so, which is why many linters recommend disallowing `eval()`. However, there are some other ways to pass a string and have it interpreted as JavaScript code that have similar concerns.

### Examples

Examples of **incorrect** code for this rule:

```ts
setTimeout('alert("Hi!");', 100);

setInterval('alert("Hi!");', 100);

setImmediate('alert("Hi!")');

window.setTimeout("count = 5", 10);

window.setInterval("foo = bar", 10);

const fn = new Function("a", "b", "return a + b");
```

Examples of **correct** code for this rule:

```ts
setTimeout(() => {
  alert("Hi!");
}, 100);

setInterval(() => {
  alert("Hi!");
}, 100);

setImmediate(() => {
  alert("Hi!");
});

const fn = (a: number, b: number) => a + b;
```

## How to use

```json
{
  "rules": {
    "typescript/no-implied-eval": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-implied-eval": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.12.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-implied-eval/)
