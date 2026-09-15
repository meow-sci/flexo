---
title: "eslint/no-redeclare"
rule: "eslint/no-redeclare"
category: "Pedantic"
version: "0.0.13"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-redeclare"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule disallows redeclaring variables within the same scope, ensuring that each variable
is declared only once. It helps avoid confusion and unintended behavior in code.

### Why is this bad?

Redeclaring variables in the same scope can lead to unexpected behavior, overwriting existing values,
and making the code harder to understand and maintain.

### Examples

Examples of **incorrect** code for this rule:

```javascript
var a = 3;
var a = 10;
```

Examples of **correct** code for this rule:

```javascript
var a = 3;
a = 10;
```

## Configuration

This rule accepts a configuration object with the following properties:

### builtinGlobals

type: `boolean`

default: `true`

When set `true`, it flags redeclaring built-in globals (e.g., `let Object = 1;`).

## How to use

```json
{
  "rules": {
    "eslint/no-redeclare": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-redeclare": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.13.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-redeclare)
