---
title: "typescript/no-unsafe-return"
rule: "typescript/no-unsafe-return"
category: "Pedantic"
version: "1.12.0"
default: false
type_aware: true
fix: "none"
upstream: "https://typescript-eslint.io/rules/no-unsafe-return/"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | yes |


### What it does

This rule disallows returning a value with type `any` from a function.

### Why is this bad?

The `any` type in TypeScript disables type checking. When you return a value typed as `any` from a function, you're essentially passing the type-safety problem to the caller without providing any guarantees about what the function actually returns.

### Examples

Examples of **incorrect** code for this rule:

```ts
declare const anyValue: any;

function getString(): string {
  return anyValue; // unsafe return
}

const getNumber = (): number => anyValue; // unsafe return

function processData(): { name: string; age: number } {
  return anyValue; // unsafe return
}
```

Examples of **correct** code for this rule:

```ts
declare const stringValue: string;
declare const numberValue: number;
declare const unknownValue: unknown;

function getString(): string {
  return stringValue; // safe
}

const getNumber = (): number => numberValue; // safe

function processUnknown(): unknown {
  return unknownValue; // safe - explicitly returning unknown
}

// Type guard to safely return
function safeGetString(): string | null {
  if (typeof unknownValue === "string") {
    return unknownValue; // safe after type guard
  }
  return null;
}
```

## How to use

```json
{
  "rules": {
    "typescript/no-unsafe-return": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-unsafe-return": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.12.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-unsafe-return/)
