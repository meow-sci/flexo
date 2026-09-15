---
title: "jest/prefer-comparison-matcher"
rule: "jest/prefer-comparison-matcher"
category: "Style"
version: "0.2.15"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/prefer-comparison-matcher.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

This rule checks for comparisons in tests that could be replaced with one of the
following built-in comparison matchers:

- `toBeGreaterThan`
- `toBeGreaterThanOrEqual`
- `toBeLessThan`
- `toBeLessThanOrEqual`

### Why is this bad?

Using generic matchers like `toBe(true)` with comparison expressions
makes tests less readable and provides less helpful error messages when
they fail. Jest's specific comparison matchers offer clearer intent and
better error output that shows the actual values being compared.

### Examples

Examples of **incorrect** code for this rule:

```js
expect(x > 5).toBe(true);
expect(x < 7).not.toEqual(true);
expect(x <= y).toStrictEqual(true);
```

Examples of **correct** code for this rule:

```js
expect(x).toBeGreaterThan(5);
expect(x).not.toBeLessThanOrEqual(7);
expect(x).toBeLessThanOrEqual(y);
// special case - see below
expect(x < "Carl").toBe(true);
```

## How to use

```json
{
  "rules": {
    "jest/prefer-comparison-matcher": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jest/prefer-comparison-matcher": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.15.

## References

- [Upstream rule documentation](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/prefer-comparison-matcher.md)
