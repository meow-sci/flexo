---
title: "typescript/no-var-requires"
rule: "typescript/no-var-requires"
category: "Restriction"
version: "0.0.7"
default: false
type_aware: false
fix: "none"
upstream: "https://typescript-eslint.io/rules/no-var-requires/"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow `require` statements except in import statements.

**NOTE**: This rule is intentionally missing the `allow` option from the original typescript-eslint rule.
This rule is deprecated in the upstream plugin and the `typescript/no-require-imports` rule should be
used instead.

### Why is this bad?

In other words, the use of forms such as var foo = require("foo") are banned. Instead use ES module imports or import foo = require("foo") imports.

```typescript
var foo = require("foo");
const foo = require("foo");
let foo = require("foo");
```

## How to use

```json
{
  "rules": {
    "typescript/no-var-requires": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "typescript/no-var-requires": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.7.

## References

- [Upstream rule documentation](https://typescript-eslint.io/rules/no-var-requires/)
