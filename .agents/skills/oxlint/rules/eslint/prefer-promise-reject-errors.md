---
title: "eslint/prefer-promise-reject-errors"
rule: "eslint/prefer-promise-reject-errors"
category: "Style"
version: "0.15.7"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/prefer-promise-reject-errors"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Require using Error objects as Promise rejection reasons.

### Why is this bad?

It is considered good practice to only pass instances of the built-in `Error` object to the
`reject()` function for user-defined errors in Promises. `Error` objects automatically
store a stack trace, which can be used to debug an error by determining where it came
from. If a Promise is rejected with a non-`Error` value, it can be difficult to
determine where the rejection occurred.

### Examples

Examples of **incorrect** code for this rule:

```js
Promise.reject("something bad happened");

Promise.reject(5);

Promise.reject();

new Promise(function (resolve, reject) {
  reject("something bad happened");
});

new Promise(function (resolve, reject) {
  reject();
});
```

Examples of **correct** code for this rule:

```js
Promise.reject(new Error("something bad happened"));

Promise.reject(new TypeError("something bad happened"));

new Promise(function (resolve, reject) {
  reject(new Error("something bad happened"));
});

var foo = getUnknownValue();
Promise.reject(foo);
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowEmptyReject

type: `boolean`

default: `false`

Whether to allow calls to `Promise.reject()` with no arguments.

## How to use

```json
{
  "rules": {
    "eslint/prefer-promise-reject-errors": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/prefer-promise-reject-errors": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.15.7.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/prefer-promise-reject-errors)
