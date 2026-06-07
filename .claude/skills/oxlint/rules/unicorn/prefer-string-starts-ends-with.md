---
title: "unicorn/prefer-string-starts-ends-with"
rule: "unicorn/prefer-string-starts-ends-with"
category: "Correctness"
version: "0.0.18"
default: true
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-string-starts-ends-with.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Prefer [`String#startsWith()`](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/String/startsWith) and [`String#endsWith()`](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/String/endsWith) over using a regex with `/^foo/` or `/foo$/`.

### Why is this bad?

Using `String#startsWith()` and `String#endsWith()` is more readable and performant as it does not need to parse a regex.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const foo = "hello";
/^abc/.test(foo);
```

Examples of **correct** code for this rule:

```javascript
const foo = "hello";
foo.startsWith("abc");
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-string-starts-ends-with": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-string-starts-ends-with": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-string-starts-ends-with.md)
