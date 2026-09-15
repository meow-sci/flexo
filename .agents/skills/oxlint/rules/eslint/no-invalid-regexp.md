---
title: "eslint/no-invalid-regexp"
rule: "eslint/no-invalid-regexp"
category: "Correctness"
version: "0.9.4"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-invalid-regexp"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow invalid regular expression strings in RegExp constructors.

### Why is this bad?

An invalid pattern in a regular expression literal is a SyntaxError when the code is parsed,
but an invalid string in RegExp constructors throws a SyntaxError only when the code is executed.

### Examples

Examples of **incorrect** code for this rule:

```js
RegExp("[");
RegExp(".", "z");
new RegExp("\\");
```

Examples of **correct** code for this rule:

```js
RegExp(".");
new RegExp();
this.RegExp("[");
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowConstructorFlags

type: `string[]`

default: `[]`

Case-sensitive array of flags that will be allowed.

## How to use

```json
{
  "rules": {
    "eslint/no-invalid-regexp": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-invalid-regexp": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.9.4.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-invalid-regexp)
