---
title: "unicorn/no-unreadable-array-destructuring"
rule: "unicorn/no-unreadable-array-destructuring"
category: "Style"
version: "0.0.19"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-unreadable-array-destructuring.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallows destructuring values from an array in ways that are difficult to read.

### Why is this bad?

Destructuring can be very useful, but it can also make some code harder to read.
This rule prevents ignoring consecutive values (e.g. `let [,,foo] = array`)
when destructuring from an array.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const [, , foo] = parts;
const [, , ...rest] = parts;
```

Examples of **correct** code for this rule:

```javascript
const [foo] = parts;
const foo = parts[3];
const rest = parts.slice(2);

// One is fine
const [, foo] = parts;
```

## How to use

```json
{
  "rules": {
    "unicorn/no-unreadable-array-destructuring": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-unreadable-array-destructuring": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.19.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-unreadable-array-destructuring.md)
