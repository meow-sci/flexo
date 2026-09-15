---
title: "unicorn/prefer-string-raw"
rule: "unicorn/prefer-string-raw"
category: "Style"
version: "0.12.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-string-raw.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Prefers use of `String.raw` to avoid escaping `\`.

### Why is this bad?

Excessive backslashes can make string values less readable which can be avoided by using `String.raw`.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const file = "C:\\windows\\style\\path\\to\\file.js";
const regexp = new RegExp("foo\\.bar");
```

Examples of **correct** code for this rule:

```javascript
const file = String.raw`C:\windows\style\path\to\file.js`;
const regexp = new RegExp(String.raw`foo\.bar`);
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-string-raw": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-string-raw": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.12.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-string-raw.md)
