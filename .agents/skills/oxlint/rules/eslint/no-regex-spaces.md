---
title: "eslint/no-regex-spaces"
rule: "eslint/no-regex-spaces"
category: "Restriction"
version: "0.0.18"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://eslint.org/docs/latest/rules/no-regex-spaces"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallow 2+ consecutive spaces in regular expressions.

### Why is this bad?

In a regular expression, it is hard to tell how many spaces are
intended to be matched. It is better to use only one space and
then specify how many spaces are expected using a quantifier.

```javascript
var re = /foo {3}bar/;
```

### Examples

Examples of **incorrect** code for this rule:

```javascript
var re = /foo   bar/;
```

## How to use

```json
{
  "rules": {
    "eslint/no-regex-spaces": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-regex-spaces": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.18.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-regex-spaces)
