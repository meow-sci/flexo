---
title: "unicorn/no-useless-promise-resolve-reject"
rule: "unicorn/no-useless-promise-resolve-reject"
category: "Pedantic"
version: "0.0.18"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-useless-promise-resolve-reject.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallows returning values wrapped in `Promise.resolve` or `Promise.reject`
in an async function or a `Promise#then`/`catch`/`finally` callback.

### Why is this bad?

Wrapping a return value in `Promise.resolve` in an async function
or a `Promise#then`/`catch`/`finally` callback is unnecessary as all
return values in async functions and promise callback functions are
already wrapped in a `Promise`.

Similarly, returning an error wrapped in `Promise.reject` is equivalent
to simply `throw`ing the error. This is the same for `yield`ing in
async generators as well.

### Examples

Examples of **incorrect** code for this rule:

```javascript
async () => Promise.resolve(bar);
```

Examples of **correct** code for this rule:

```javascript
async () => bar;
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowReject

type: `boolean`

default: `false`

If set to `true`, allows the use of `Promise.reject` in async functions and promise callbacks.

## How to use

```json
{
  "rules": {
    "unicorn/no-useless-promise-resolve-reject": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-useless-promise-resolve-reject": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-useless-promise-resolve-reject.md)
