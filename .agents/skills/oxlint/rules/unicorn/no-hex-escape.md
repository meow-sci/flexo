---
title: "unicorn/no-hex-escape"
rule: "unicorn/no-hex-escape"
category: "Pedantic"
version: "0.0.18"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-hex-escape.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforces a convention of using [Unicode escapes](https://mathiasbynens.be/notes/javascript-escapes#unicode)
instead of [hexadecimal escapes](https://mathiasbynens.be/notes/javascript-escapes#hexadecimal) for
consistency and clarity.

### Why is this bad?

Using hexadecimal escapes can be less readable and harder to understand
when compared to Unicode escapes.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const foo = "\x1B";
const foo = `\x1B${bar}`;
```

Examples of **correct** code for this rule:

```javascript
const foo = "\u001B";
const foo = `\u001B${bar}`;
```

## How to use

```json
{
  "rules": {
    "unicorn/no-hex-escape": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-hex-escape": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-hex-escape.md)
