---
title: "vitest/prefer-to-have-length"
rule: "vitest/prefer-to-have-length"
category: "Style"
version: "0.2.13"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-to-have-length.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

In order to have a better failure message, `toHaveLength()` should be used upon
asserting expectations on objects length property.

### Why is this bad?

This rule triggers a warning if `toBe()`, `toEqual()` or `toStrictEqual()` is
used to assert objects length property.

### Examples

Examples of **incorrect** code for this rule:

```javascript
expect(files["length"]).toBe(1);
expect(files["length"]).toBe(1);
expect(files["length"])["not"].toBe(1);
```

Examples of **correct** code for this rule:

```javascript
expect(files).toHaveLength(1);
```

## How to use

```json
{
  "rules": {
    "vitest/prefer-to-have-length": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/prefer-to-have-length": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.13.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-to-have-length.md)
