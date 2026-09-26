---
title: "eslint/no-implicit-coercion"
rule: "eslint/no-implicit-coercion"
category: "Style"
version: "1.33.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://eslint.org/docs/latest/rules/no-implicit-coercion"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallows shorthand type conversions using operators like `!!`, `+`, `""+ `, etc.

### Why is this bad?

Implicit type coercions using operators can be less clear than using explicit
type conversion functions like `Boolean()`, `Number()`, and `String()`.
Using explicit conversions makes the intent clearer and the code more readable.

### Examples

Examples of **incorrect** code for this rule:

```javascript
var b = !!foo;
var n = +foo;
var s = "" + foo;
```

Examples of **correct** code for this rule:

```javascript
var b = Boolean(foo);
var n = Number(foo);
var s = String(foo);
```

## Configuration

This rule accepts a configuration object with the following properties:

### allow

type: `string[]`

List of operators to allow. Valid values: `"!!"`, `"~"`, `"+"`, `"-"`, `"- -"`, `"*"`

### boolean

type: `boolean`

default: `true`

When `true`, warns on implicit boolean coercion (e.g., `!!foo`).

### disallowTemplateShorthand

type: `boolean`

default: `false`

When `true`, disallows using template literals for string coercion (e.g., `` `${foo}` ``).

### number

type: `boolean`

default: `true`

When `true`, warns on implicit number coercion (e.g., `+foo`).

### string

type: `boolean`

default: `true`

When `true`, warns on implicit string coercion (e.g., `"" + foo`).

## How to use

```json
{
  "rules": {
    "eslint/no-implicit-coercion": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-implicit-coercion": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.33.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-implicit-coercion)
