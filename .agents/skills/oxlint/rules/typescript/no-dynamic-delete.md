---
title: "typescript/no-dynamic-delete"
rule: "typescript/no-dynamic-delete"
category: "Restriction"
version: "0.5.2"
default: false
type_aware: false
fix: "none"
upstream: "https://typescript-eslint.io/rules/no-dynamic-delete/"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow using the delete operator on computed key expressions.

### Why is this bad?

Deleting dynamically computed keys can be dangerous and in some cases not well optimized.
Using the delete operator on keys that aren't runtime constants could be a sign that you're using the wrong data structures.
Consider using a Map or Set if you’re using an object as a key-value collection.

### Examples

Examples of **incorrect** code for this rule:

```ts
const container: { [i: string]: 0 } = {};
delete container["aa" + "b"];
```

Examples of **correct** code for this rule:

```ts
const container: { [i: string]: 0 } = {};
delete container.aab;
```

## How to use

```json
{
  "rules": {
    "typescript/no-dynamic-delete": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-dynamic-delete": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.5.2.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-dynamic-delete/)
