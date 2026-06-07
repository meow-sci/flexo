---
title: "vitest/prefer-to-be-falsy"
rule: "vitest/prefer-to-be-falsy"
category: "Style"
version: "0.7.1"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-to-be-falsy.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

This rule warns when `toBe(false)` is used with `expect` or `expectTypeOf`.
With `--fix`, it will be replaced with `toBeFalsy()`.

### Why is this bad?

Using `toBe(false)` is less expressive and may not account for other falsy
values like `0`, `null`, or `undefined`. `toBeFalsy()` provides a more
comprehensive check for any falsy value, improving the robustness of the tests.

### Examples

Examples of **incorrect** code for this rule:

```javascript
expect(foo).toBe(false);
expectTypeOf(foo).toBe(false);
```

Examples of **correct** code for this rule:

```javascript
expect(foo).toBeFalsy();
expectTypeOf(foo).toBeFalsy();
```

## How to use

```json
{
  "rules": {
    "vitest/prefer-to-be-falsy": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/prefer-to-be-falsy": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.7.1.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-to-be-falsy.md)
