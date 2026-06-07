---
title: "unicorn/consistent-existence-index-check"
rule: "unicorn/consistent-existence-index-check"
category: "Style"
version: "0.12.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/consistent-existence-index-check.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforce consistent style for element existence checks with `indexOf()`,
`lastIndexOf()`, `findIndex()`, and `findLastIndex()`. This ensures
that comparisons are performed in a standard and clear way.

### Why is this bad?

This rule is meant to enforce a specific style and improve code clarity.
Using inconsistent comparison styles (e.g., `index < 0`, `index >= 0`)
can make the intention behind the code unclear, especially in large
codebases.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const index = foo.indexOf("bar");
if (index < 0) {
}

const index = foo.indexOf("bar");
if (index >= 0) {
}
```

Examples of **correct** code for this rule:

```javascript
const index = foo.indexOf("bar");
if (index === -1) {
}

const index = foo.indexOf("bar");
if (index !== -1) {
}
```

## How to use

```json
{
  "rules": {
    "unicorn/consistent-existence-index-check": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/consistent-existence-index-check": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.12.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/consistent-existence-index-check.md)
