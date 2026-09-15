---
title: "vitest/prefer-to-be-truthy"
rule: "vitest/prefer-to-be-truthy"
category: "Style"
version: "0.7.1"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-to-be-truthy.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

This rule warns when `toBe(true)` is used with `expect` or `expectTypeOf`.
With `--fix`, it will be replaced with `toBeTruthy()`.

### Why is this bad?

Using `toBe(true)` is less flexible and may not account for other truthy
values like non-empty strings or objects. `toBeTruthy()` checks for any
truthy value, which makes the tests more comprehensive and robust.

### Examples

Examples of **incorrect** code for this rule:

```javascript
expect(foo).toBe(true);
expectTypeOf(foo).toBe(true);
```

Examples of **correct** code for this rule:

```javascript
expect(foo).toBeTruthy();
expectTypeOf(foo).toBeTruthy();
```

## How to use

```json
{
  "rules": {
    "vitest/prefer-to-be-truthy": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/prefer-to-be-truthy": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.7.1.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-to-be-truthy.md)
