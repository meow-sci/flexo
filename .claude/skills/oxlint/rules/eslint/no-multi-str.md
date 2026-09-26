---
title: "eslint/no-multi-str"
rule: "eslint/no-multi-str"
category: "Style"
version: "0.5.3"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-multi-str"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow multiline strings.

### Why is this bad?

Some consider this to be a bad practice as it was an undocumented feature of JavaScript
that was only formalized later.

### Examples

Examples of **incorrect** code for this rule:

```javascript
var x =
  "Line 1 \
 Line 2";
```

## How to use

```json
{
  "rules": {
    "eslint/no-multi-str": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-multi-str": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.5.3.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-multi-str)
