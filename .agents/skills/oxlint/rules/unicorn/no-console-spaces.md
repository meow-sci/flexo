---
title: "unicorn/no-console-spaces"
rule: "unicorn/no-console-spaces"
category: "Style"
version: "0.0.14"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-console-spaces.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallows leading/trailing space inside `console.log()` and similar methods.

### Why is this bad?

The `console.log()` method and similar methods join the parameters
with a space so adding a leading/trailing space to a parameter,
results in two spaces being added.

### Examples

Examples of **incorrect** code for this rule:

```javascript
console.log("abc ", "def");
```

Examples of **correct** code for this rule:

```javascript
console.log("abc", "def");
```

## How to use

```json
{
  "rules": {
    "unicorn/no-console-spaces": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-console-spaces": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.14.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-console-spaces.md)
