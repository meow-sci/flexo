---
title: "promise/no-promise-in-callback"
rule: "promise/no-promise-in-callback"
category: "Suspicious"
version: "0.13.1"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/no-promise-in-callback.md"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallows the use of Promises within error-first callback functions.

### Why is this bad?

Mixing Promises and callbacks can lead to unclear and inconsistent code.
Promises and callbacks are different patterns for handling asynchronous code.
Mixing them makes the logic flow harder to follow and complicates error handling,
as callbacks rely on an error-first pattern, while Promises use `catch`.

### Examples

Examples of **incorrect** code for this rule:

```js
doSomething((err, val) => {
  if (err) console.error(err);
  else doSomethingElse(val).then(console.log);
});
```

Examples of **correct** code for this rule:

```js
promisify(doSomething)().then(doSomethingElse).then(console.log).catch(console.error);
```

## Configuration

### exemptDeclarations

type: `boolean`

default: `false`

Whether or not to exempt function declarations. Defaults to `false`.

## How to use

```json
{
  "rules": {
    "promise/no-promise-in-callback": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "promise/no-promise-in-callback": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.13.1.

## References

- [Upstream rule documentation](https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/no-promise-in-callback.md)
