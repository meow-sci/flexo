---
title: "typescript/no-inferrable-types"
rule: "typescript/no-inferrable-types"
category: "Style"
version: "0.14.0"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://typescript-eslint.io/rules/no-inferrable-types/"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Disallow explicit type declarations for variables or parameters initialized to a number, string, or boolean.

### Why is this bad?

Explicitly typing variables or parameters that are initialized to a literal value is unnecessary because TypeScript can infer the type from the value.

### Examples

Examples of **incorrect** code for this rule:

```ts
const a: number = 5;
const b: string = "foo";
const c: boolean = true;
const fn = (a: number = 5, b: boolean = true, c: string = "foo") => {};
```

Examples of **correct** code for this rule:

```ts
const a = 5;
const b = "foo";
const c = true;
const fn = (a = 5, b = true, c = "foo") => {};
```

## Configuration

This rule accepts a configuration object with the following properties:

### ignoreParameters

type: `boolean`

default: `false`

When set to `true`, ignores type annotations on function parameters.

### ignoreProperties

type: `boolean`

default: `false`

When set to `true`, ignores type annotations on class properties.

## How to use

```json
{
  "rules": {
    "typescript/no-inferrable-types": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-inferrable-types": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.14.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-inferrable-types/)
