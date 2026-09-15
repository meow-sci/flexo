---
title: "typescript/no-non-null-asserted-optional-chain"
rule: "typescript/no-non-null-asserted-optional-chain"
category: "Correctness"
version: "0.0.6"
default: true
type_aware: false
fix: "fixable_suggestion"
upstream: "https://typescript-eslint.io/rules/no-non-null-asserted-optional-chain/"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Disallow non-null assertions after an optional chain expression.

### Why is this bad?

By design, optional chain expressions (`?.`) provide `undefined` as the expression's value, if the object being
accessed is `null` or `undefined`, instead of throwing an error. Using a non-null assertion (`!`) to assert the
result of an optional chain expression is contradictory and likely wrong, as it indicates the code is both expecting
the value to be potentially `null` or `undefined` and non-null at the same time.

In most cases, either:

1. The object is not nullable and did not need the `?.` for its property lookup
2. The non-null assertion is incorrect and introduces a type safety hole.

### Examples

Examples of **incorrect** code for this rule:

```ts
foo?.bar!;
foo?.bar()!;
```

Examples of **correct** code for this rule:

```ts
foo?.bar;
foo.bar!;
```

## How to use

```json
{
  "rules": {
    "typescript/no-non-null-asserted-optional-chain": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-non-null-asserted-optional-chain": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.6.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-non-null-asserted-optional-chain/)
