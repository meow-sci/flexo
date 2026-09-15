---
title: "unicorn/no-lonely-if"
rule: "unicorn/no-lonely-if"
category: "Pedantic"
version: "0.0.18"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-lonely-if.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallow `if` statements as the only statement in `if` blocks without `else`.

### Why is this bad?

It can be confusing to have an `if` statement without an `else` clause as the only statement in an `if` block.

### Examples

Examples of **incorrect** code for this rule:

```javascript
if (foo) {
  if (bar) {
  }
}
if (foo) if (bar) baz();
```

Examples of **correct** code for this rule:

```javascript
if (foo && bar) {
}
if (foo && bar) baz();
```

## How to use

```json
{
  "rules": {
    "unicorn/no-lonely-if": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-lonely-if": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-lonely-if.md)
