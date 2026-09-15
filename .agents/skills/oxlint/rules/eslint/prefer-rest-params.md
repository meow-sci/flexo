---
title: "eslint/prefer-rest-params"
rule: "eslint/prefer-rest-params"
category: "Style"
version: "0.15.4"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/prefer-rest-params"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallows the use of the `arguments` object and instead enforces the use of rest parameters.

### Why is this bad?

The `arguments` object does not have methods from `Array.prototype`, making it inconvenient for array-like operations.
Using rest parameters provides a more intuitive and efficient way to handle variadic arguments.

### Examples

Examples of **incorrect** code for this rule:

```javascript
function foo() {
  console.log(arguments);
}

function foo(action) {
  var args = Array.prototype.slice.call(arguments, 1);
  action.apply(null, args);
}

function foo(action) {
  var args = [].slice.call(arguments, 1);
  action.apply(null, args);
}
```

Examples of **correct** code for this rule:

```javascript
function foo(...args) {
  console.log(args);
}

function foo(action, ...args) {
  action.apply(null, args); // Or use `action(...args)` (related to `prefer-spread` rule).
}

// Note: Implicit `arguments` can be shadowed.
function foo(arguments) {
  console.log(arguments); // This refers to the first argument.
}
function foo() {
  var arguments = 0;
  console.log(arguments); // This is a local variable.
}
```

## How to use

```json
{
  "rules": {
    "eslint/prefer-rest-params": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/prefer-rest-params": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.15.4.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/prefer-rest-params)
