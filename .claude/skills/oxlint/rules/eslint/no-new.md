---
title: "eslint/no-new"
rule: "eslint/no-new"
category: "Suspicious"
version: "0.4.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.org/docs/latest/rules/no-new"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow new operators outside of assignments or comparisons.

### Why is this bad?

Calling new without assigning or comparing it the reference is thrown away and in many
cases the constructor can be replaced with a function.

### Examples

Examples of **incorrect** code for this rule:

```javascript
new Person();

() => {
  new Date();
};
```

Examples of **correct** code for this rule:

```javascript
var a = new Date()(() => new Date());
```

## How to use

```json
{
  "rules": {
    "eslint/no-new": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/no-new": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.0.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/no-new)
