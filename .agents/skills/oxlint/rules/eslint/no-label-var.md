---
title: "eslint/no-label-var"
rule: "eslint/no-label-var"
category: "Style"
version: "0.6.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-label-var"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow labels that share a name with a variable.

### Why is this bad?

This rule aims to create clearer code by disallowing the bad practice of creating a label
that shares a name with a variable that is in scope.

### Examples

Examples of **incorrect** code for this rule:

```js
var x = foo;
function bar() {
  x: for (;;) {
    break x;
  }
}
```

Examples of **correct** code for this rule:

```js
// The variable that has the same name as the label is not in scope.

function foo() {
  var q = t;
}

function bar() {
  q: for (;;) {
    break q;
  }
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-label-var": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-label-var": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.6.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-label-var)
