---
title: "typescript/no-wrapper-object-types"
rule: "typescript/no-wrapper-object-types"
category: "Correctness"
version: "0.8.0"
default: true
type_aware: false
fix: "fixable_fix"
upstream: "https://typescript-eslint.io/rules/no-wrapper-object-types/"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallow the use of wrapper object types.

### Why is this bad?

Wrapper object types are types that are defined in the global scope and are not primitive types. These types are not recommended to be used in TypeScript code.

### Examples

Examples of **incorrect** code for this rule:

```ts
let myBigInt: BigInt;
let myBoolean: Boolean;
let myNumber: Number;
let myString: String;
let mySymbol: Symbol;

let myObject: Object = "allowed by TypeScript";
```

Examples of **correct** code for this rule:

```ts
let myBigint: bigint;
let myBoolean: boolean;
let myNumber: number;
let myString: string;
let mySymbol: symbol;

let myObject: object = "Type 'string' is not assignable to type 'object'.";
```

## How to use

```json
{
  "rules": {
    "typescript/no-wrapper-object-types": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-wrapper-object-types": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.8.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-wrapper-object-types/)
