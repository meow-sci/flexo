---
title: "unicorn/no-await-expression-member"
rule: "unicorn/no-await-expression-member"
category: "Style"
version: "0.0.19"
default: false
type_aware: false
fix: "fixable_dangerous_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-await-expression-member.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_dangerous_fix |
| Type-aware | no |


### What it does

Disallows member access from `await` expressions.

### Why is this bad?

When accessing a member from an `await` expression,
the `await` expression has to be parenthesized, which is not readable.

### Examples

Examples of **incorrect** code for this rule:

```javascript
async function bad() {
  const secondElement = (await getArray())[1];
}
```

Examples of **correct** code for this rule:

```javascript
async function good() {
  const [, secondElement] = await getArray();
}
```

## How to use

```json
{
  "rules": {
    "unicorn/no-await-expression-member": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-await-expression-member": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.19.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-await-expression-member.md)
