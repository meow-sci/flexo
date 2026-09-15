---
title: "typescript/prefer-namespace-keyword"
rule: "typescript/prefer-namespace-keyword"
category: "Correctness"
version: "0.7.0"
default: true
type_aware: false
fix: "fixable_fix"
upstream: "https://typescript-eslint.io/rules/prefer-namespace-keyword/"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

This rule reports when the module keyword is used instead of namespace.
This rule does not report on the use of TypeScript module declarations to describe external APIs (declare module 'foo' {}).

> **Warning:** This rule is deprecated and will be removed in a future release.
> 
> In a future version of TypeScript and Oxlint, this will be a hard error produced by the parser.
> 
> See: https://github.com/microsoft/TypeScript/issues/54500, https://github.com/microsoft/TypeScript/issues/62211 and https://github.com/microsoft/TypeScript/pull/62876.


### Why is this bad?

Namespaces are an outdated way to organize TypeScript code. ES2015 module syntax is now preferred (`import`/`export`).
For projects still using custom modules / namespaces, it's preferred to refer to them as namespaces.

### Examples

Examples of **incorrect** code for this rule:

```typescript
module Example {}
```

Examples of **correct** code for this rule:

```typescript
namespace Example {}
```

## How to use

```json
{
  "rules": {
    "typescript/prefer-namespace-keyword": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/prefer-namespace-keyword": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.7.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/prefer-namespace-keyword/)
