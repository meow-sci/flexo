---
title: "typescript/ban-tslint-comment"
rule: "typescript/ban-tslint-comment"
category: "Style"
version: "0.2.9"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://typescript-eslint.io/rules/ban-tslint-comment/"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

This rule disallows `tslint:<rule-flag>` comments.

### Why is this bad?

Useful when migrating from TSLint to ESLint. Once TSLint has been
removed, this rule helps locate TSLint annotations

### Examples

Examples of **incorrect** code for this rule:

```ts
// tslint:disable-next-line
someCode();
```

Examples of **correct** code for this rule:

```ts
someCode();
```

## How to use

```json
{
  "rules": {
    "typescript/ban-tslint-comment": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/ban-tslint-comment": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.9.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/ban-tslint-comment/)
