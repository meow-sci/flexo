---
title: "promise/no-callback-in-promise"
rule: "promise/no-callback-in-promise"
category: "Correctness"
version: "0.10.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/no-callback-in-promise.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallows calling a callback function (`cb()`) inside a `Promise.prototype.then()`
or `Promise.prototype.catch()`.

### Why is this bad?

Directly invoking a callback inside a `then()` or `catch()` method can lead to
unexpected behavior, such as the callback being called multiple times. Additionally,
mixing the callback and promise paradigms in this way can make the code confusing
and harder to maintain.

### Examples

Examples of **incorrect** code for this rule:

```js
function callback(err, data) {
  console.log("Callback got called with:", err, data);
  throw new Error("My error");
}

Promise.resolve()
  .then(() => callback(null, "data"))
  .catch((err) => callback(err.message, null));
```

Examples of **correct** code for this rule:

```js
Promise.resolve()
  .then((data) => {
    console.log(data);
  })
  .catch((err) => {
    console.error(err);
  });
```

## Configuration

This rule accepts a configuration object with the following properties:

### callbacks

type: `string[]`

default: `["callback", "cb", "done", "next"]`

List of callback function names to check for within Promise `then` and `catch` methods.

### exceptions

type: `string[]`

default: `[]`

List of callback function names to allow within Promise `then` and `catch` methods.

### timeoutsErr

type: `boolean`

default: `false`

Boolean as to whether callbacks in timeout functions like `setTimeout` will err.

## How to use

```json
{
  "rules": {
    "promise/no-callback-in-promise": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "promise/no-callback-in-promise": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.10.0.

## References

- [Upstream rule documentation](https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/no-callback-in-promise.md)
