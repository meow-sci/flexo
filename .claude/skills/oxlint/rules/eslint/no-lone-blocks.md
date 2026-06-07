---
title: "eslint/no-lone-blocks"
rule: "eslint/no-lone-blocks"
category: "Style"
version: "0.15.6"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-lone-blocks"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallows unnecessary standalone block statements.

### Why is this bad?

Standalone blocks can be confusing as they do not provide any meaningful purpose when used unnecessarily.
They may introduce extra nesting, reducing code readability, and can mislead readers about scope or intent.

### Examples

Examples of **incorrect** code for this rule:

```js
{
  var x = 1;
}
```

Examples of **correct** code for this rule:

```js
if (condition) {
  var x = 1;
}

{
  let x = 1; // Used to create a valid block scope.
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-lone-blocks": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-lone-blocks": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.15.6.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-lone-blocks)
