---
title: "unicorn/prefer-string-slice"
rule: "unicorn/prefer-string-slice"
category: "Pedantic"
version: "0.0.18"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-string-slice.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

Prefer [`String#slice()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/slice) over [`String#substr()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/substr) and [`String#substring()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/substring).

### Why is this bad?

[`String#substr()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/substr) and [`String#substring()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/substring) are the two lesser known legacy ways to slice a string. It's better to use [`String#slice()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/slice) as it's a more popular option with clearer behavior that has a consistent [`Array` counterpart](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice).

### Examples

Examples of **incorrect** code for this rule:

```javascript
"foo".substr(1, 2);
```

Examples of **correct** code for this rule:

```javascript
"foo".slice(1, 2);
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-string-slice": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-string-slice": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-string-slice.md)
