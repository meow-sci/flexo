---
title: "eslint/valid-typeof"
rule: "eslint/valid-typeof"
category: "Correctness"
version: "0.0.3"
default: true
type_aware: false
fix: "conditional_fix"
upstream: "https://eslint.org/docs/latest/rules/valid-typeof"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

Enforce comparing `typeof` expressions against valid strings.

### Why is this bad?

For a vast majority of use cases, the result of the `typeof` operator is one of the
following string literals: `"undefined"`, `"object"`, `"boolean"`, `"number"`, `"string"`,
`"function"`, `"symbol"`, and `"bigint"`. It is usually a typing mistake to compare the
result of a `typeof` operator to other string literals.

### Examples

Examples of **incorrect** code for this rule:

```js
typeof foo === "strnig";
typeof foo == "undefimed";
typeof bar != "nunber"; // spellchecker:disable-line
typeof bar !== "fucntion"; // spellchecker:disable-line
```

Examples of **correct** code for this rule:

```js
typeof foo === "string";
typeof bar == "undefined";
typeof foo === baz;
typeof bar === typeof qux;
```

## Configuration

This rule accepts a configuration object with the following properties:

### requireStringLiterals

type: `boolean`

default: `false`

The `requireStringLiterals` option when set to `true`, allows the comparison of `typeof`
expressions with only string literals or other `typeof` expressions, and disallows
comparisons to any other value. Default is `false`.

With `requireStringLiterals` set to `true`, the following are examples of **incorrect** code:

```js
typeof foo === undefined;
typeof bar == Object;
typeof baz === "strnig";
typeof qux === "some invalid type";
typeof baz === anotherVariable;
typeof foo == 5;
```

With `requireStringLiterals` set to `true`, the following are examples of **correct** code:

```js
typeof foo === "undefined";
typeof bar == "object";
typeof baz === "string";
typeof bar === typeof qux;
```

## How to use

```json
{
  "rules": {
    "eslint/valid-typeof": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/valid-typeof": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/valid-typeof)
