---
title: "typescript/await-thenable"
rule: "typescript/await-thenable"
category: "Correctness"
version: "1.12.0"
default: true
type_aware: true
fix: "fixable_suggestion"
upstream: "https://typescript-eslint.io/rules/await-thenable/"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_suggestion |
| Type-aware | yes |


### What it does

This rule disallows awaiting a value that is not a Thenable.

### Why is this bad?

While it is valid JavaScript to await a non-Promise-like value (it will resolve immediately), this practice can be confusing for readers who are not aware of this behavior. It can also be a sign of a programmer error, such as forgetting to add parentheses to call a function that returns a Promise.

### Examples

Examples of **incorrect** code for this rule:

```
await 12;
await (() => {});

// non-Promise values
await Math.random;
await { then() {} };

// this is not a Promise - it's a function that returns a Promise
declare const getPromise: () => Promise<string>;
await getPromise;
```

Examples of **correct** code for this rule:

```
await Promise.resolve('value');
await Promise.reject(new Error());

// Promise-like values
await {
  then(onfulfilled, onrejected) {
    onfulfilled('value');
  },
};

// this is a Promise - produced by calling a function
declare const getPromise: () => Promise<string>;
await getPromise();
```

## How to use

```json
{
  "rules": {
    "typescript/await-thenable": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/await-thenable": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.12.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/await-thenable/)
