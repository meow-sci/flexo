---
title: "unicorn/prefer-code-point"
rule: "unicorn/prefer-code-point"
category: "Pedantic"
version: "0.0.16"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-code-point.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Prefers usage of `String.prototype.codePointAt` over `String.prototype.charCodeAt`.
Prefers usage of `String.fromCodePoint` over `String.fromCharCode`.

### Why is this bad?

Unicode is better supported in [`String#codePointAt()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/codePointAt) and [`String.fromCodePoint()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/fromCodePoint).

[Difference between `String.fromCodePoint()` and `String.fromCharCode()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/fromCodePoint#compared_to_fromcharcode)

### Examples

Examples of **incorrect** code for this rule:

```javascript
"🦄".charCodeAt(0);
String.fromCharCode(0x1f984);
```

Examples of **correct** code for this rule:

```javascript
"🦄".codePointAt(0);
String.fromCodePoint(0x1f984);
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-code-point": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-code-point": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.16.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-code-point.md)
