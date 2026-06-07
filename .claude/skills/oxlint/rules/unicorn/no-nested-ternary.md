---
title: "unicorn/no-nested-ternary"
rule: "unicorn/no-nested-ternary"
category: "Style"
version: "0.0.18"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-nested-ternary.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

This rule disallows deeply nested ternary expressions.
Nested ternary expressions that are only one level deep and wrapped in parentheses are allowed.

### Why is this bad?

Nesting ternary expressions can make code more difficult to understand.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const foo = i > 5 ? (i < 100 ? true : false) : true;
const foo = i > 5 ? true : i < 100 ? true : i < 1000 ? true : false;
```

Examples of **correct** code for this rule:

```javascript
const foo = i > 5 ? (i < 100 ? true : false) : true;
const foo = i > 5 ? (i < 100 ? true : false) : i < 100 ? true : false;
```

## How to use

```json
{
  "rules": {
    "unicorn/no-nested-ternary": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-nested-ternary": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-nested-ternary.md)
