---
title: "eslint/no-irregular-whitespace"
rule: "eslint/no-irregular-whitespace"
category: "Correctness"
version: "0.1.1"
default: true
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-irregular-whitespace"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallows the use of irregular whitespace characters in the code.

### Why is this bad?

Irregular whitespace characters are invisible to most editors and can
cause unexpected behavior, making code harder to debug and maintain.
They can also cause issues with code formatting and parsing.

### Examples

Examples of **incorrect** code for this rule:

```javascript
// Contains irregular whitespace characters (invisible)
function example() {
  var foo = "bar"; // irregular whitespace before 'bar'
}
```

Examples of **correct** code for this rule:

```javascript
function example() {
  var foo = "bar"; // regular spaces only
}
```

## Configuration

This rule accepts a configuration object with the following properties:

### skipComments

type: `boolean`

default: `true`

Whether to skip irregular whitespace in comments.

### skipJSXText

type: `boolean`

default: `true`

Whether to skip irregular whitespace in JSX text.

### skipRegExps

type: `boolean`

default: `true`

Whether to skip irregular whitespace in regular expression literals.

### skipStrings

type: `boolean`

default: `true`

Whether to skip irregular whitespace in string literals.

### skipTemplates

type: `boolean`

default: `true`

Whether to skip irregular whitespace in template literals.

## How to use

```json
{
  "rules": {
    "eslint/no-irregular-whitespace": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-irregular-whitespace": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.1.1.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-irregular-whitespace)
