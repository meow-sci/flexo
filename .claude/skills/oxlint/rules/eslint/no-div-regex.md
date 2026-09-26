---
title: "eslint/no-div-regex"
rule: "eslint/no-div-regex"
category: "Restriction"
version: "0.4.2"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://eslint.org/docs/latest/rules/no-div-regex"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallow equal signs explicitly at the beginning of regular expressions.

### Why is this bad?

Characters /= at the beginning of a regular expression literal can be confused with a
division assignment operator.

### Examples

Examples of **incorrect** code for this rule:

```javascript
function bar() {
  return /=foo/;
}
```

Examples of **correct** code for this rule:

```javascript
function bar() {
  return /[=]foo/;
}
```

## How to use

```json
{
  "rules": {
    "eslint/no-div-regex": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-div-regex": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.2.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-div-regex)
