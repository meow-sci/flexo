---
title: "unicorn/no-length-as-slice-end"
rule: "unicorn/no-length-as-slice-end"
category: "Restriction"
version: "0.7.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-length-as-slice-end.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallow using `length` as the end argument of a `slice` call.

### Why is this bad?

Passing `length` as the end argument of a `slice` call is unnecessary and can be confusing.

### Examples

Examples of **incorrect** code for this rule:

```javascript
foo.slice(1, foo.length);
```

Examples of **correct** code for this rule:

```javascript
foo.slice(1);
```

## How to use

```json
{
  "rules": {
    "unicorn/no-length-as-slice-end": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-length-as-slice-end": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.7.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-length-as-slice-end.md)
