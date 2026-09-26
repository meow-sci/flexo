---
title: "unicorn/no-single-promise-in-promise-methods"
rule: "unicorn/no-single-promise-in-promise-methods"
category: "Correctness"
version: "0.2.18"
default: true
type_aware: false
fix: "conditional_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-single-promise-in-promise-methods.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

Disallow passing single-element arrays to `Promise` methods.

### Why is this bad?

Passing a single-element array to `Promise.all()`, `Promise.any()`, or
`Promise.race()` is likely a mistake.

### Examples

Examples of **incorrect** code for this rule:

```javascript
async function bad() {
  const foo = await Promise.all([promise]);
  const foo = await Promise.any([promise]);
  const foo = await Promise.race([promise]);
  const promise = Promise.all([nonPromise]);
}
```

Examples of **correct** code for this rule:

```javascript
async function good() {
  const foo = await promise;
  const promise = Promise.resolve(nonPromise);
  const foo = await Promise.all(promises);
  const foo = await Promise.any([promise, anotherPromise]);
  const [{ value: foo, reason: error }] = await Promise.allSettled([promise]);
}
```

## How to use

```json
{
  "rules": {
    "unicorn/no-single-promise-in-promise-methods": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-single-promise-in-promise-methods": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-single-promise-in-promise-methods.md)
