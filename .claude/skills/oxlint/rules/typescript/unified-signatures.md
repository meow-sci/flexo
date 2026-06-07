---
title: "typescript/unified-signatures"
rule: "typescript/unified-signatures"
category: "Style"
version: "1.48.0"
default: false
type_aware: false
fix: "none"
upstream: "https://typescript-eslint.io/rules/unified-signatures/"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow overload signatures that can be unified into one.

### Why is this bad?

Duplicate overload signatures that only differ by a single type, or by an optional/rest
parameter, are harder to maintain and read than a single unified signature.

### Examples

Examples of **incorrect** code for this rule:

```ts
function f(a: number): void;
function f(a: string): void;
```

Examples of **correct** code for this rule:

```ts
function f(a: number | string): void;
```

## Configuration

This rule accepts a configuration object with the following properties:

### ignoreDifferentlyNamedParameters

type: `boolean`

default: `false`

Whether to ignore parameter name differences when comparing signatures. If `false`, signatures
will not be considered unifiable if they have parameters in the same position with different
names, even if the parameter types are the same.

### ignoreOverloadsWithDifferentJSDoc

type: `boolean`

default: `false`

Whether to ignore JSDoc differences when comparing signatures. If `false`, signatures will not
be considered unifiable if the closest leading block comments for the signatures are different,
even if the signatures themselves are identical.

## How to use

```json
{
  "rules": {
    "typescript/unified-signatures": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/unified-signatures": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.48.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/unified-signatures/)
