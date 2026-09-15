---
title: "typescript/prefer-regexp-exec"
rule: "typescript/prefer-regexp-exec"
category: "Style"
version: "1.49.0"
default: false
type_aware: true
fix: "none"
upstream: "https://typescript-eslint.io/rules/prefer-regexp-exec/"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | yes |


### What it does

Prefer `RegExp#exec()` over `String#match()` when extracting a regex match.

### Why is this bad?

`exec()` is more explicit about matching with a regular expression and avoids the
overloaded behavior of `String#match()`.

### Examples

Examples of **incorrect** code for this rule:

```ts
const text = "value";
text.match(/v/);
```

Examples of **correct** code for this rule:

```ts
const text = "value";
/v/.exec(text);
```

## How to use

```json
{
  "rules": {
    "typescript/prefer-regexp-exec": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/prefer-regexp-exec": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.49.0.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/prefer-regexp-exec/)
