---
title: "eslint/no-throw-literal"
rule: "eslint/no-throw-literal"
category: "Pedantic"
version: "0.9.10"
default: false
type_aware: false
fix: "conditional_suggestion"
upstream: "https://eslint.org/docs/latest/rules/no-throw-literal"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | 💡 conditional suggestion |
| Type-aware | no |


### What it does

Disallows throwing literals or non-Error objects as exceptions.

> **Warning:** This rule has been deprecated, please instead use [typescript/only-throw-error](https://oxc.rs/docs/guide/usage/linter/rules/typescript/only-throw-error.html).
> The typescript rule is more reliable than the Javascript version, as it has less false positive, and can catch more cases.


### Why is this bad?

It is considered good practice to only throw the Error object itself or an object using
the Error object as base objects for user-defined exceptions. The fundamental benefit of
Error objects is that they automatically keep track of where they were built and originated.

### Examples

Examples of **incorrect** code for this rule:

```js
throw "error";

throw 0;

throw undefined;

throw null;

var err = new Error();
throw "an " + err;
// err is recast to a string literal

var err = new Error();
throw `${err}`;
```

Examples of **correct** code for this rule:

```js
throw new Error();

throw new Error("error");

var e = new Error("error");
throw e;

try {
  throw new Error("error");
} catch (e) {
  throw e;
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-throw-literal": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-throw-literal": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.9.10.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-throw-literal)
