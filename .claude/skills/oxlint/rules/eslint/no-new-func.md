---
title: "eslint/no-new-func"
rule: "eslint/no-new-func"
category: "Style"
version: "0.9.2"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-new-func"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

The rule disallow `new` operators with the `Function` object.

### Why is this bad?

Using `new Function` or `Function` can lead to code that is difficult to understand and maintain. It can introduce security risks similar to those associated with `eval` because it generates a new function from a string of code, which can be a vector for injection attacks. Additionally, it impacts performance negatively as these functions are not optimized by the JavaScript engine.

### Examples

Examples of **incorrect** code for this rule:

```js
var x = new Function("a", "b", "return a + b");
var x = Function("a", "b", "return a + b");
var x = Function.call(null, "a", "b", "return a + b");
var x = Function.apply(null, ["a", "b", "return a + b"]);
var x = Function.bind(null, "a", "b", "return a + b")();
var f = Function.bind(null, "a", "b", "return a + b");
```

Examples of **correct** code for this rule:

```js
let x = function (a, b) {
  return a + b;
};
```

## How to use

```json
{
  "rules": {
    "eslint/no-new-func": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-new-func": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.9.2.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-new-func)
