---
title: "unicorn/consistent-template-literal-escape"
rule: "unicorn/consistent-template-literal-escape"
category: "Style"
version: "1.60.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/consistent-template-literal-escape.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforce consistent style for escaping ${ in template literals.

### Why is this bad?

Using `\${` instead of `${` can improve readability and prevent confusion.

### Examples

Examples of **incorrect** code for this rule:

```js
const foo = `$\{a}`;
```

```js
const foo = `\$\{a}`;
```

Examples of **correct** code for this rule:

```js
const foo = `\${a}`;
```

## How to use

```json
{
  "rules": {
    "unicorn/consistent-template-literal-escape": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/consistent-template-literal-escape": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.60.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/consistent-template-literal-escape.md)
