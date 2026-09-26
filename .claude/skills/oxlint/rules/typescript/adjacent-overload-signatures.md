---
title: "typescript/adjacent-overload-signatures"
rule: "typescript/adjacent-overload-signatures"
category: "Style"
version: "0.0.7"
default: false
type_aware: false
fix: "none"
upstream: "https://typescript-eslint.io/rules/adjacent-overload-signatures/"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Require that function overload signatures be consecutive.

### Why is this bad?

Function overload signatures represent multiple ways
a function can be called, potentially with different return types.
It's typical for an interface or type alias describing a function to place all overload signatures next to each other.
If Signatures placed elsewhere in the type are easier to be missed by future developers reading the code.

### Examples

Examples of **incorrect** code for this rule:

```typescript
declare namespace Foo {
  export function foo(s: string): void;
  export function foo(n: number): void;
  export function bar(): void;
  export function foo(sn: string | number): void;
}

type Foo = {
  foo(s: string): void;
  foo(n: number): void;
  bar(): void;
  foo(sn: string | number): void;
};

interface Foo {
  foo(s: string): void;
  foo(n: number): void;
  bar(): void;
  foo(sn: string | number): void;
}

class Foo {
  foo(s: string): void;
  foo(n: number): void;
  bar(): void {}
  foo(sn: string | number): void {}
}

export function foo(s: string): void;
export function foo(n: number): void;
export function bar(): void;
export function foo(sn: string | number): void;
```

## How to use

```json
{
  "rules": {
    "typescript/adjacent-overload-signatures": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/adjacent-overload-signatures": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.7.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/adjacent-overload-signatures/)
