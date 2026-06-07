---
title: "eslint/no-return-assign"
rule: "eslint/no-return-assign"
category: "Style"
version: "0.9.10"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-return-assign"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallows assignment operators in return statements.

### Why is this bad?

Assignment is allowed by js in return expressions, but usually, an expression with only one equal sign is intended to be a comparison.
However, because of the missing equal sign, this turns to assignment, which is valid js code
Because of this ambiguity, it’s considered a best practice to not use assignment in return statements.

### Examples

Examples of **incorrect** code for this rule:

```js
() => (a = b);
function x() {
  return (a = b);
}
```

Examples of **correct** code for this rule:

```js
() => (a = b);
function x() {
  var result = (a = b);
  return result;
}
```

## Configuration

This rule accepts one of the following string values:

### `"always"`

Disallow all assignments in return statements.

### `"except-parens"`

Allow assignments in return statements only if they are enclosed in parentheses.
This is the default mode.

## How to use

```json
{
  "rules": {
    "eslint/no-return-assign": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-return-assign": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.9.10.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-return-assign)
