---
title: "typescript/prefer-literal-enum-member"
rule: "typescript/prefer-literal-enum-member"
category: "Restriction"
version: "0.3.2"
default: false
type_aware: false
fix: "none"
upstream: "https://typescript-eslint.io/rules/prefer-literal-enum-member/"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Explicit enum value must only be a literal value (string, number, boolean, etc).

### Why is this bad?

TypeScript allows the value of an enum member to be many different kinds of valid JavaScript expressions.
However, because enums create their own scope whereby each enum member becomes a variable in that scope, developers are often surprised at the resultant values.

### Examples

Examples of **incorrect** code for this rule:

```ts
const imOutside = 2;
const b = 2;
enum Foo {
  outer = imOutside,
  a = 1,
  b = a,
  c = b,
}
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowBitwiseExpressions

type: `boolean`

default: `false`

When set to `true`, allows bitwise expressions in enum member initializers.
This includes bitwise NOT (`~`), AND (`&`), OR (`|`), XOR (`^`), and shift operators (`<<`, `>>`, `>>>`).

## How to use

```json
{
  "rules": {
    "typescript/prefer-literal-enum-member": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/prefer-literal-enum-member": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.3.2.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/prefer-literal-enum-member/)
