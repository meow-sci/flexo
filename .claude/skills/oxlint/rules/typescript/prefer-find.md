---
title: "typescript/prefer-find"
rule: "typescript/prefer-find"
category: "Style"
version: "1.49.0"
default: false
type_aware: true
fix: "none"
upstream: "https://typescript-eslint.io/rules/prefer-find/"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | yes |


### What it does

Prefer `.find(...)` over `.filter(...)[0]` for retrieving a single element.

### Why is this bad?

`.filter(...)[0]` builds an intermediate array and is less clear about intent.
`.find(...)` directly expresses that only the first matching element is needed.

### Examples

Examples of **incorrect** code for this rule:

```ts
const first = list.filter((item) => item.active)[0];
```

Examples of **correct** code for this rule:

```ts
const first = list.find((item) => item.active);
```

## How to use

```json
{
  "rules": {
    "typescript/prefer-find": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/prefer-find": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.49.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/prefer-find/)
