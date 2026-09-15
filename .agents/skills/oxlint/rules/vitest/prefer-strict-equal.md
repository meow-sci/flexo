---
title: "vitest/prefer-strict-equal"
rule: "vitest/prefer-strict-equal"
category: "Style"
version: "0.2.13"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-strict-equal.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

This rule triggers a warning if `toEqual()` is used to assert equality.

### Why is this bad?

The `toEqual()` matcher performs a deep equality check but ignores
`undefined` values in objects and arrays. This can lead to false
positives where tests pass when they should fail. `toStrictEqual()`
provides more accurate comparison by checking for `undefined` values.

### Examples

Examples of **incorrect** code for this rule:

```javascript
expect({ a: "a", b: undefined }).toEqual({ a: "a" });
```

Examples of **correct** code for this rule:

```javascript
expect({ a: "a", b: undefined }).toStrictEqual({ a: "a" });
```

## How to use

```json
{
  "rules": {
    "vitest/prefer-strict-equal": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/prefer-strict-equal": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.13.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-strict-equal.md)
