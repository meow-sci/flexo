---
title: "typescript/no-unsafe-unary-minus"
rule: "typescript/no-unsafe-unary-minus"
category: "Correctness"
version: "1.12.0"
default: true
type_aware: true
fix: "none"
upstream: "https://typescript-eslint.io/rules/no-unsafe-unary-minus/"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | yes |


### What it does

This rule disallows using the unary minus operator on a value which is not of type 'number' | 'bigint'.

### Why is this bad?

The unary minus operator should only be used on numeric values. Using it on other types can lead to unexpected behavior due to JavaScript's type coercion rules.

### Examples

Examples of **incorrect** code for this rule:

```ts
declare const value: any;
const result1 = -value; // unsafe on any

declare const str: string;
const result2 = -str; // unsafe on string

declare const bool: boolean;
const result3 = -bool; // unsafe on boolean

declare const obj: object;
const result4 = -obj; // unsafe on object

declare const arr: any[];
const result5 = -arr; // unsafe on array
```

Examples of **correct** code for this rule:

```ts
declare const num: number;
const result1 = -num; // safe

declare const bigint: bigint;
const result2 = -bigint; // safe

const literal = -42; // safe

const bigintLiteral = -42n; // safe

declare const union: number | bigint;
const result3 = -union; // safe

// Convert to number first if needed
declare const str: string;
const result4 = -Number(str); // safe conversion
```

## How to use

```json
{
  "rules": {
    "typescript/no-unsafe-unary-minus": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-unsafe-unary-minus": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.12.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-unsafe-unary-minus/)
