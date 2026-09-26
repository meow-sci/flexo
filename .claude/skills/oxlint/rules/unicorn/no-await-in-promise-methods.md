---
title: "unicorn/no-await-in-promise-methods"
rule: "unicorn/no-await-in-promise-methods"
category: "Correctness"
version: "0.2.18"
default: true
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-await-in-promise-methods.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Disallow using `await` in `Promise` method parameters.

### Why is this bad?

Using `await` on promises passed as arguments to `Promise.all()`,
`Promise.allSettled()`, `Promise.any()`, or `Promise.race()` is likely a
mistake.

### Examples

Examples of **incorrect** code for this rule:

```javascript
async function foo() {
  Promise.all([await promise, anotherPromise]);
  Promise.allSettled([await promise, anotherPromise]);
  Promise.any([await promise, anotherPromise]);
  Promise.race([await promise, anotherPromise]);
}
```

Examples of **correct** code for this rule:

```javascript
async function foo() {
  Promise.all([promise, anotherPromise]);
  Promise.allSettled([promise, anotherPromise]);
  Promise.any([promise, anotherPromise]);
  Promise.race([promise, anotherPromise]);
}
```

## How to use

```json
{
  "rules": {
    "unicorn/no-await-in-promise-methods": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-await-in-promise-methods": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-await-in-promise-methods.md)
