---
title: "typescript/no-unnecessary-qualifier"
rule: "typescript/no-unnecessary-qualifier"
category: "Style"
version: "1.49.0"
default: false
type_aware: true
fix: "none"
upstream: "https://typescript-eslint.io/rules/no-unnecessary-qualifier/"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | yes |


### What it does

Disallow namespace qualifiers when the referenced name is already in scope.

### Why is this bad?

Redundant qualifiers add noise and make type references harder to read.

### Examples

Examples of **incorrect** code for this rule:

```ts
namespace A {
  export type B = number;
  const value: A.B = 1;
}
```

Examples of **correct** code for this rule:

```ts
namespace A {
  export type B = number;
  const value: B = 1;
}
```

## How to use

```json
{
  "rules": {
    "typescript/no-unnecessary-qualifier": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-unnecessary-qualifier": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.49.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-unnecessary-qualifier/)
