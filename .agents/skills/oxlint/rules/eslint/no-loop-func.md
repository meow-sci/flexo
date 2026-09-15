---
title: "eslint/no-loop-func"
rule: "eslint/no-loop-func"
category: "Pedantic"
version: "1.33.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-loop-func"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallows function declarations and expressions inside loop statements
when they reference variables declared in the outer scope that may change
across iterations.

### Why is this bad?

Writing functions within loops tends to result in errors due to the way
closures work in JavaScript. Functions capture variables by reference,
not by value. When using `var`, which is function-scoped, all iterations
share the same variable binding, leading to unexpected behavior.

### Examples

Examples of **incorrect** code for this rule:

```js
for (var i = 0; i < 10; i++) {
  funcs[i] = function () {
    return i;
  };
}
```

Examples of **correct** code for this rule:

```js
for (let i = 0; i < 10; i++) {
  funcs[i] = function () {
    return i;
  };
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-loop-func": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-loop-func": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.33.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-loop-func)
