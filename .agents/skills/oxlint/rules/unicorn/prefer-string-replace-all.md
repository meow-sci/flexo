---
title: "unicorn/prefer-string-replace-all"
rule: "unicorn/prefer-string-replace-all"
category: "Pedantic"
version: "0.0.18"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-string-replace-all.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Prefers [`String#replaceAll()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replaceAll) over [`String#replace()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace) when using a regex with the global flag.

### Why is this bad?

The [`String#replaceAll()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replaceAll) method is both faster and safer as you don't have to use a regex and remember to escape it if the string is not a literal. And when used with a regex, it makes the intent clearer.

### Examples

Examples of **incorrect** code for this rule:

```js
foo.replace(/a/g, bar);
```

Examples of **correct** code for this rule:

```js
foo.replace(/a/, bar);
foo.replaceAll(/a/, bar);

const pattern = "not-a-regexp";
foo.replace(pattern, bar);
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-string-replace-all": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-string-replace-all": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-string-replace-all.md)
