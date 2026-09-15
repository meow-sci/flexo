---
title: "unicorn/no-useless-length-check"
rule: "unicorn/no-useless-length-check"
category: "Correctness"
version: "0.0.19"
default: true
type_aware: false
fix: "pending"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-useless-length-check.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

It checks for an unnecessary array length check in a logical expression.

The cases are:

- `array.length === 0 || array.every(Boolean)` (`array.every` returns `true` if array is has elements)
- `array.length > 0 && array.some(Boolean)` (`array.some` returns `false` if array is empty)

### Why is this bad?

An extra unnecessary length check is done.

### Examples

Examples of **incorrect** code for this rule:

```javascript
if (array.length === 0 || array.every(Boolean)) {
  // do something!
}
```

Examples of **correct** code for this rule:

```javascript
if (array.every(Boolean)) {
  // do something!
}
```

## How to use

```json
{
  "rules": {
    "unicorn/no-useless-length-check": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-useless-length-check": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.19.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-useless-length-check.md)
