---
title: "vitest/no-commented-out-tests"
rule: "vitest/no-commented-out-tests"
category: "Suspicious"
version: "0.0.8"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-commented-out-tests.md"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule raises a warning about commented-out tests. It's similar to the
`no-disabled-tests` rule.

### Why is this bad?

You may forget to uncomment some tests. This rule raises a warning about commented-out tests.

It is generally better to skip a test if it's flaky, or remove it if it's no longer needed.

### Examples

Examples of **incorrect** code for this rule:

```javascript
// describe('foo', () => {});
// it('foo', () => {});
// test('foo', () => {});

// describe.skip('foo', () => {});
// it.skip('foo', () => {});
// test.skip('foo', () => {});
```

## How to use

```json
{
  "rules": {
    "vitest/no-commented-out-tests": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/no-commented-out-tests": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.8.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-commented-out-tests.md)
