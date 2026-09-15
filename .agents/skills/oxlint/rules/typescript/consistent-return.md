---
title: "typescript/consistent-return"
rule: "typescript/consistent-return"
category: "Suspicious"
version: "0.0.8"
default: false
type_aware: true
fix: "none"
upstream: "https://typescript-eslint.io/rules/consistent-return/"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | none |
| Type-aware | yes |


### What it does

Enforce consistent return behavior in functions.

### Why is this bad?

Mixing value-returning and non-value-returning code paths makes control flow harder to
reason about and frequently indicates a bug.

> **Warning:** If possible, prefer TypeScript's `noImplicitReturns` compiler option over this rule.
> `noImplicitReturns` uses TypeScript's type information and control-flow analysis,
> so it can catch more implicit return paths than this rule.


### Examples

Examples of **incorrect** code for this rule:

```ts
function maybe(flag: boolean): number {
  if (flag) {
    return 1;
  }
  return;
}
```

Examples of **correct** code for this rule:

```ts
function maybe(flag: boolean): number {
  if (flag) {
    return 1;
  }
  return 0;
}
```

## Configuration

This rule accepts a configuration object with the following properties:

### treatUndefinedAsUnspecified

type: `boolean`

default: `false`

Treat explicit `return undefined` as equivalent to an unspecified return.

## How to use

```json
{
  "rules": {
    "typescript/consistent-return": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/consistent-return": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.8.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/consistent-return/)
