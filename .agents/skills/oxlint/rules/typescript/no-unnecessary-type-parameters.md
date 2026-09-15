---
title: "typescript/no-unnecessary-type-parameters"
rule: "typescript/no-unnecessary-type-parameters"
category: "Suspicious"
version: "1.49.0"
default: false
type_aware: true
fix: "none"
upstream: "https://typescript-eslint.io/rules/no-unnecessary-type-parameters/"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | none |
| Type-aware | yes |


### What it does

Disallow type parameters that are declared but not meaningfully used.

### Why is this bad?

Unnecessary type parameters make signatures noisier and harder to understand, and they
often hide opportunities to simplify APIs.

### Examples

Examples of **incorrect** code for this rule:

```ts
function parseYAML<T>(input: string): T {
  return input as any as T;
}
```

Examples of **correct** code for this rule:

```ts
function parseYAML(input: string): unknown {
  return input;
}

function identity<T>(value: T): T {
  return value;
}
```

## How to use

```json
{
  "rules": {
    "typescript/no-unnecessary-type-parameters": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-unnecessary-type-parameters": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.49.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-unnecessary-type-parameters/)
