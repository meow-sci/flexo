---
title: "typescript/no-unsafe-declaration-merging"
rule: "typescript/no-unsafe-declaration-merging"
category: "Correctness"
version: "0.0.11"
default: true
type_aware: false
fix: "none"
upstream: "https://typescript-eslint.io/rules/no-unsafe-declaration-merging/"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow unsafe declaration merging.

### Why is this bad?

Declaration merging between classes and interfaces is unsafe.
The TypeScript compiler doesn't check whether properties are initialized, which can lead to TypeScript not detecting code that will cause runtime errors.

### Examples

Examples of **incorrect** code for this rule:

```ts
interface Foo {}
class Foo {}
```

Examples of **correct** code for this rule:

```ts
interface Foo {}
class Bar {}
```

## How to use

```json
{
  "rules": {
    "typescript/no-unsafe-declaration-merging": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-unsafe-declaration-merging": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.11.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-unsafe-declaration-merging/)
