---
title: "typescript/consistent-type-definitions"
rule: "typescript/consistent-type-definitions"
category: "Style"
version: "0.2.17"
default: false
type_aware: false
fix: "conditional_dangerous_fix"
upstream: "https://typescript-eslint.io/rules/consistent-type-definitions/"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | conditional_dangerous_fix |
| Type-aware | no |


### What it does

Enforce type definitions to consistently use either `interface` or `type`.

### Why is this bad?

TypeScript provides two common ways to define an object type: `interface` and `type`.
The two are generally very similar, and can often be used interchangeably.
Using the same type declaration style consistently helps with code readability.

### Examples

By default this rule enforces the use of `interface` for defining object types.

Examples of **incorrect** code for this rule:

```typescript
type T = { x: number };
```

Examples of **correct** code for this rule:

```typescript
type T = string;
type Foo = string | {};

interface T {
  x: number;
}
```

## Configuration

This rule accepts one of the following string values:

### `"interface"`

Prefer `interface` over `type` for object type definitions:

```typescript
interface T {
  x: number;
}
```

### `"type"`

Prefer `type` over `interface` for object type definitions:

```typescript
type T = { x: number };
```

## How to use

```json
{
  "rules": {
    "typescript/consistent-type-definitions": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/consistent-type-definitions": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.17.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/consistent-type-definitions/)
