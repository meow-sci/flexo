---
title: "typescript/no-empty-interface"
rule: "typescript/no-empty-interface"
category: "Style"
version: "0.0.6"
default: false
type_aware: false
fix: "pending"
upstream: "https://typescript-eslint.io/rules/no-empty-interface/"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallow the declaration of empty interfaces.

### Why is this bad?

An empty interface in TypeScript does very little: any non-nullable value is assignable to {}.
Using an empty interface is often a sign of programmer error, such as misunderstanding the concept of {} or forgetting to fill in fields.
This rule aims to ensure that only meaningful interfaces are declared in the code.

### Examples

Examples of **incorrect** code for this rule:

```ts
interface Foo {}
interface Bar extends Foo {}
```

Examples of **correct** code for this rule:

```ts
interface Foo {
  member: string;
}
interface Bar extends Foo {
  member: string;
}
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowSingleExtends

type: `boolean`

default: `false`

When set to `true`, allows empty interfaces that extend a single interface.

## How to use

```json
{
  "rules": {
    "typescript/no-empty-interface": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-empty-interface": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.6.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-empty-interface/)
