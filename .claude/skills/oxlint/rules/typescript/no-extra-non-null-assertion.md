---
title: "typescript/no-extra-non-null-assertion"
rule: "typescript/no-extra-non-null-assertion"
category: "Correctness"
version: "0.0.6"
default: true
type_aware: false
fix: "fixable_fix"
upstream: "https://typescript-eslint.io/rules/no-extra-non-null-assertion/"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallow extra non-null assertions.

### Why is this bad?

The `!` non-null assertion operator in TypeScript is used to assert that a value's type
does not include `null` or `undefined`. Using the operator any more than once on a single value
does nothing.

### Examples

Examples of **incorrect** code for this rule:

```ts
const foo: { bar: number } | null = null;
const bar = foo!!!.bar;
```

```ts
function foo(bar: number | undefined) {
  const bar: number = bar!!!;
}
```

```ts
function foo(bar?: { n: number }) {
  return bar!?.n;
}
```

Examples of **correct** code for this rule:

```ts
const foo: { bar: number } | null = null;
const bar = foo!.bar;
```

```ts
function foo(bar: number | undefined) {
  const bar: number = bar!;
}
```

```ts
function foo(bar?: { n: number }) {
  return bar?.n;
}
```

## How to use

```json
{
  "rules": {
    "typescript/no-extra-non-null-assertion": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-extra-non-null-assertion": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.6.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-extra-non-null-assertion/)
