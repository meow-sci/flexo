---
title: "typescript/no-duplicate-type-constituents"
rule: "typescript/no-duplicate-type-constituents"
category: "Correctness"
version: "1.12.0"
default: true
type_aware: true
fix: "fixable_fix"
upstream: "https://typescript-eslint.io/rules/no-duplicate-type-constituents/"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_fix |
| Type-aware | yes |


### What it does

This rule disallows duplicate constituents of union or intersection types.

### Why is this bad?

Duplicate constituents in union and intersection types serve no purpose and can make code harder to read. They are likely a mistake.

### Examples

Examples of **incorrect** code for this rule:

```ts
type T1 = "A" | "A";

type T2 = A | A | B;

type T3 = { a: string } & { a: string };

type T4 = [A, A];

type T5 = "foo" | "bar" | "foo";
```

Examples of **correct** code for this rule:

```ts
type T1 = "A" | "B";

type T2 = A | B | C;

type T3 = { a: string } & { b: string };

type T4 = [A, B];

type T5 = "foo" | "bar" | "baz";
```

## Configuration

This rule accepts a configuration object with the following properties:

### ignoreIntersections

type: `boolean`

default: `false`

Whether to ignore duplicate types in intersection types.
When true, allows `type T = A & A`.

### ignoreUnions

type: `boolean`

default: `false`

Whether to ignore duplicate types in union types.
When true, allows `type T = A | A`.

## How to use

```json
{
  "rules": {
    "typescript/no-duplicate-type-constituents": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-duplicate-type-constituents": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.12.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-duplicate-type-constituents/)
