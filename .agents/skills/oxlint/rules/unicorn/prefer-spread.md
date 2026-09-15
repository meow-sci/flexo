---
title: "unicorn/prefer-spread"
rule: "unicorn/prefer-spread"
category: "Style"
version: "0.0.17"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-spread.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

Enforces the use of [the spread operator (`...`)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax) over outdated patterns.

### Why is this bad?

Using the spread operator is more concise and readable.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const foo = Array.from(set);
const foo = Array.from(new Set([1, 2]));
```

Examples of **correct** code for this rule:

```javascript
[...set].map(() => {});
Array.from(...argumentsArray);
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-spread": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-spread": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.17.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-spread.md)
