---
title: "typescript/no-non-null-asserted-nullish-coalescing"
rule: "typescript/no-non-null-asserted-nullish-coalescing"
category: "Restriction"
version: "0.5.0"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://typescript-eslint.io/rules/no-non-null-asserted-nullish-coalescing/"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Disallow non-null assertions in the left operand of a nullish coalescing operator.

### Why is this bad?

The ?? nullish coalescing runtime operator allows providing a default value when dealing
with `null` or `undefined`. Using a ! non-null assertion type operator in the left operand of
a nullish coalescing operator is redundant, and likely a sign of programmer error or
confusion over the two operators.

### Examples

Examples of **incorrect** code for this rule:

```ts
foo! ?? bar;
foo.bazz! ?? bar;
foo!.bazz! ?? bar;
foo()! ?? bar;

let x!: string;
x! ?? "";

let x: string;
x = foo();
x! ?? "";
```

Examples of **correct** code for this rule:

```ts
foo ?? bar;
foo ?? bar!;
foo!.bazz ?? bar;
foo!.bazz ?? bar!;
foo() ?? bar;
```

```ts
// This is considered correct code because there's no way for the user to satisfy it.
let x: string;
x! ?? "";
```

## How to use

```json
{
  "rules": {
    "typescript/no-non-null-asserted-nullish-coalescing": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-non-null-asserted-nullish-coalescing": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.5.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-non-null-asserted-nullish-coalescing/)
