---
title: "typescript/no-redundant-type-constituents"
rule: "typescript/no-redundant-type-constituents"
category: "Correctness"
version: "1.12.0"
default: true
type_aware: true
fix: "none"
upstream: "https://typescript-eslint.io/rules/no-redundant-type-constituents/"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | yes |


### What it does

This rule disallows type constituents of unions and intersections that are redundant.

### Why is this bad?

Some constituents of union and intersection types can be redundant due to TypeScript's type system rules. These redundant constituents don't add any value and can make types harder to read and understand.

### Examples

Examples of **incorrect** code for this rule:

```ts
// unknown is redundant in unions
type T1 = string | unknown;

// any is redundant in unions
type T2 = string | any;

// never is redundant in unions
type T3 = string | never;

// Literal types that are wider than other types
type T4 = string | "hello";

// Object types that are subsets
type T5 = { a: string } | { a: string; b: number };
```

Examples of **correct** code for this rule:

```ts
type T1 = string | number;

type T2 = "hello" | "world";

type T3 = { a: string } | { b: number };

// unknown in intersections is meaningful
type T4 = string & unknown;

// never in intersections is meaningful
type T5 = string & never;
```

## How to use

```json
{
  "rules": {
    "typescript/no-redundant-type-constituents": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-redundant-type-constituents": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.12.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-redundant-type-constituents/)
