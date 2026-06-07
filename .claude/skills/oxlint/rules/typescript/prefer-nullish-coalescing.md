---
title: "typescript/prefer-nullish-coalescing"
rule: "typescript/prefer-nullish-coalescing"
category: "Pedantic"
version: "1.33.0"
default: false
type_aware: true
fix: "fixable_fix"
upstream: "https://typescript-eslint.io/rules/prefer-nullish-coalescing/"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_fix |
| Type-aware | yes |


### What it does

Enforce using the nullish coalescing operator (`??`) instead of logical OR (`||`)
or conditional expressions when the left operand might be `null` or `undefined`.

### Why is this bad?

The `||` operator returns the right-hand side when the left-hand side is any
falsy value (`false`, `0`, `''`, `null`, `undefined`, `NaN`). This can lead
to unexpected behavior when you only want to provide a default for `null`
or `undefined`.

The nullish coalescing operator (`??`) only returns the right-hand side when
the left-hand side is `null` or `undefined`, making the intent clearer and
avoiding bugs with other falsy values.

### Examples

Examples of **incorrect** code for this rule:

```ts
declare const x: string | null;

// Using || when ?? would be more appropriate
const foo = x || "default";

// Ternary that could use ??
const bar = x !== null && x !== undefined ? x : "default";
const baz = x != null ? x : "default";

// If statement that could use ??
let value = "default";
if (x !== null && x !== undefined) {
  value = x;
}
```

Examples of **correct** code for this rule:

```ts
declare const x: string | null;

// Using nullish coalescing
const foo = x ?? "default";

// || is fine when you want falsy behavior
declare const y: string;
const bar = y || "default";

// Boolean coercion (can be ignored with ignoreBooleanCoercion)
const bool = Boolean(x || y);
```

## Configuration

This rule accepts a configuration object with the following properties:

### ignoreBooleanCoercion

type: `boolean`

default: `false`

Whether to ignore arguments to the `Boolean` constructor.

### ignoreConditionalTests

type: `boolean`

default: `true`

Whether to ignore cases that are located within a conditional test.

### ignoreIfStatements

type: `boolean`

default: `false`

Whether to ignore any if statements that could be simplified by using
the nullish coalescing operator.

### ignoreMixedLogicalExpressions

type: `boolean`

default: `false`

Whether to ignore any logical or expressions that are part of a mixed
logical expression (with `&&`).

### ignorePrimitives

type: `object | boolean`

Represents the different ways `ignorePrimitives` can be specified in JSON.
Can be:

- `true` - ignore all primitive types
- An object specifying which primitives to ignore

#### ignorePrimitives.bigint

type: `boolean`

default: `false`

Ignore bigint primitive types.

#### ignorePrimitives.boolean

type: `boolean`

default: `false`

Ignore boolean primitive types.

#### ignorePrimitives.number

type: `boolean`

default: `false`

Ignore number primitive types.

#### ignorePrimitives.string

type: `boolean`

default: `false`

Ignore string primitive types.

### ignoreTernaryTests

type: `boolean`

default: `false`

Whether to ignore any ternary expressions that could be simplified by
using the nullish coalescing operator.

## How to use

```json
{
  "rules": {
    "typescript/prefer-nullish-coalescing": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/prefer-nullish-coalescing": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.33.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/prefer-nullish-coalescing/)
