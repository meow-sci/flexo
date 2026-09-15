---
title: "unicorn/prefer-default-parameters"
rule: "unicorn/prefer-default-parameters"
category: "Style"
version: "1.33.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-default-parameters.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Instead of reassigning a function parameter, default parameters should be used. The `foo = foo || 123` statement evaluates to `123` when `foo` is falsy, possibly leading to confusing behavior, whereas default parameters only apply when passed an `undefined` value.
This rule only reports reassignments to literal values.

You should disable this rule if you want your functions to deal with `null` and other falsy values the same way as `undefined`.
Default parameters are exclusively applied [when `undefined` is received.](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Default_parameters#passing_undefined_vs._other_falsy_values).
However, we recommend [moving away from `null`](https://github.com/sindresorhus/meta/discussions/7).

### Why is this bad?

Using default parameters makes it clear that a parameter has a default value, improving code readability and maintainability.

### Examples

Examples of **incorrect** code for this rule:

```js
function abc(foo) {
  foo = foo || "bar";
}

function abc(foo) {
  const bar = foo || "bar";
}
```

Examples of **correct** code for this rule:

```js
function abc(foo = "bar") {}

function abc(bar = "bar") {}

function abc(foo) {
  foo = foo || bar();
}
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-default-parameters": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-default-parameters": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.33.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-default-parameters.md)
