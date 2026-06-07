---
title: "promise/catch-or-return"
rule: "promise/catch-or-return"
category: "Restriction"
version: "0.9.2"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/catch-or-return.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Ensure that each time a `then()` is applied to a promise, a `catch()`
must be applied as well. Exceptions are made for promises returned from
a function.

### Why is this bad?

Not catching errors in a promise can cause hard to debug problems or
missing handling of error conditions. In the worst case, unhandled
promise rejections can cause your application to crash.

### Examples

Examples of **incorrect** code for this rule:

```javascript
myPromise.then(doSomething);
myPromise.then(doSomething, catchErrors); // catch() may be a little better
```

Examples of **correct** code for this rule:

```javascript
myPromise.then(doSomething).catch(errors);
function doSomethingElse() {
  return myPromise.then(doSomething);
}
const arrowFunc = () => myPromise.then(doSomething);
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowFinally

type: `boolean`

default: `false`

Whether to allow `finally()` as a termination method.

### allowThen

type: `boolean`

default: `false`

Whether to allow `then()` with two arguments as a termination method.

### terminationMethod

type: `string[]`

default: `["catch"]`

List of allowed termination methods (e.g., `catch`, `done`).

## How to use

```json
{
  "rules": {
    "promise/catch-or-return": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "promise/catch-or-return": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.9.2.

## References

- [Upstream rule documentation](https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/catch-or-return.md)
