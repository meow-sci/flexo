---
title: "eslint/no-async-promise-executor"
rule: "eslint/no-async-promise-executor"
category: "Correctness"
version: "0.0.3"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-async-promise-executor"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow using an async function as a Promise executor.

### Why is this bad?

The `new Promise` constructor accepts an executor function as an argument,
which has `resolve` and `reject` parameters that can be used to control the state of the
created Promise. For example:

```javascript
const result = new Promise(function executor(resolve, reject) {
  readFile("foo.txt", function (err, result) {
    if (err) {
      reject(err);
    } else {
      resolve(result);
    }
  });
});
```

The executor function can also be an `async function`. However, this is usually a mistake, for a few reasons:

- If an async executor function throws an error, the error will be lost and won’t cause
  the newly-constructed `Promise` to reject.This could make it difficult to debug and handle some errors.
- If a `Promise` executor function is using `await`, this is usually a sign that it is not
  actually necessary to use the new `Promise` constructor, or the scope of the new
  `Promise` constructor can be reduced.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const foo = new Promise(async (resolve, reject) => {
  readFile("foo.txt", function (err, result) {
    if (err) {
      reject(err);
    } else {
      resolve(result);
    }
  });
});

const result = new Promise(async (resolve, reject) => {
  resolve(await foo);
});
```

Examples of **correct** code for this rule:

```javascript
const foo = new Promise((resolve, reject) => {
  readFile("foo.txt", function (err, result) {
    if (err) {
      reject(err);
    } else {
      resolve(result);
    }
  });
});

const result = Promise.resolve(foo);
```

## How to use

```json
{
  "rules": {
    "eslint/no-async-promise-executor": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-async-promise-executor": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-async-promise-executor)
