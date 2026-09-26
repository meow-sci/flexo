---
title: "promise/prefer-await-to-callbacks"
rule: "promise/prefer-await-to-callbacks"
category: "Style"
version: "0.9.10"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/prefer-await-to-callbacks.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

The rule encourages the use of `async/await` for handling asynchronous code
instead of traditional callback functions. `async/await`, introduced in ES2017,
provides a clearer and more concise syntax for writing asynchronous code,
making it easier to read and maintain.

### Why is this bad?

Using callbacks can lead to complex, nested structures known as "callback hell,"
which make code difficult to read and maintain. Additionally, error handling can
become cumbersome with callbacks, whereas `async/await` allows for more straightforward
try/catch blocks for managing errors.

### Examples

Examples of **incorrect** code for this rule:

```js
cb();
callback();
doSomething(arg, (err) => {});
function doSomethingElse(cb) {}
```

Examples of **correct** code for this rule:

```js
await doSomething(arg);
async function doSomethingElse() {}
function* generator() {
  yield yieldValue((err) => {});
}
eventEmitter.on("error", (err) => {});
```

## How to use

```json
{
  "rules": {
    "promise/prefer-await-to-callbacks": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "promise/prefer-await-to-callbacks": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.9.10.

## References

- [Upstream rule documentation](https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/prefer-await-to-callbacks.md)
