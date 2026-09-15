---
title: "vitest/prefer-to-be-object"
rule: "vitest/prefer-to-be-object"
category: "Style"
version: "0.9.2"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-to-be-object.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

This rule enforces using `toBeObject()` to check if a value is of type `Object`.

### Why is this bad?

Using other methods such as `toBeInstanceOf(Object)` or `instanceof Object` can
be less clear and potentially misleading. Enforcing the use of `toBeObject()`
provides more explicit and readable code, making your intentions clear and
improving the overall maintainability and readability of your tests.

### Examples

Examples of **incorrect** code for this rule:

```js
expectTypeOf({}).toBeInstanceOf(Object);
expectTypeOf({} instanceof Object).toBeTruthy();
```

Examples of **correct** code for this rule:

```js
expectTypeOf({}).toBeObject();
expectTypeOf({}).toBeObject();
```

## How to use

```json
{
  "rules": {
    "vitest/prefer-to-be-object": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/prefer-to-be-object": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.9.2.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-to-be-object.md)
