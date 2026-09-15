---
title: "vitest/prefer-strict-boolean-matchers"
rule: "vitest/prefer-strict-boolean-matchers"
category: "Style"
version: "1.57.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-strict-boolean-matchers.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforce using `toBe(true)` and `toBe(false)` over matchers that coerce types to boolean.

### Why is this bad?

Truthy/falsy matchers coerce values to boolean and can hide type mistakes.
Strict boolean assertions make intent explicit and avoid accidental coercion.

### Examples

Examples of **incorrect** code for this rule:

```javascript
expect(foo).toBeTruthy();
expectTypeOf(foo).toBeTruthy();
expect(foo).toBeFalsy();
expectTypeOf(foo).toBeFalsy();
```

Examples of **correct** code for this rule:

```javascript
expect(foo).toBe(true);
expectTypeOf(foo).toBe(true);
expect(foo).toBe(false);
expectTypeOf(foo).toBe(false);
```

## How to use

```json
{
  "rules": {
    "vitest/prefer-strict-boolean-matchers": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/prefer-strict-boolean-matchers": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.57.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-strict-boolean-matchers.md)
