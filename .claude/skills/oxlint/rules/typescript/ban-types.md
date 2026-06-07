---
title: "typescript/ban-types"
rule: "typescript/ban-types"
category: "Pedantic"
version: "0.0.14"
default: false
type_aware: false
fix: "none"
upstream: "https://typescript-eslint.io/rules/ban-types/"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule bans specific types and can suggest alternatives. Note that it does not ban the corresponding runtime objects from being used.

> **Warning:** This rule is deprecated and will be removed in a future release.
> 
> Prefer these replacement rules:
> 
> - `typescript/no-empty-object-type`
> - `typescript/no-unsafe-function-type`
> - `typescript/no-wrapper-object-types`
> - `typescript/no-restricted-types` (for custom type bans)


### Why is this bad?

Some built-in types have aliases, while some types are considered dangerous or harmful. It's often a good idea to ban certain types to help with consistency and safety.

### Examples

Examples of **incorrect** code for this rule:

```typescript
let foo: String = "foo";

let bar: Boolean = true;
```

Examples of **correct** code for this rule:

```typescript
let foo: string = "foo";

let bar: boolean = true;
```

## How to use

```json
{
  "rules": {
    "typescript/ban-types": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/ban-types": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.14.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/ban-types/)
