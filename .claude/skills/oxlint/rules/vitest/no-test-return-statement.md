---
title: "vitest/no-test-return-statement"
rule: "vitest/no-test-return-statement"
category: "Style"
version: "0.2.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-test-return-statement.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow explicitly returning from tests.

### Why is this bad?

Tests in Jest should be void and not return values.
If you are returning Promises then you should update the test to use
`async/await`.

### Examples

Examples of **incorrect** code for this rule:

```javascript
test("one", () => {
  return expect(1).toBe(1);
});
```

Examples of **correct** code for this rule:

```javascript
test("one", () => {
  expect(1).toBe(1);
});
```

## How to use

```json
{
  "rules": {
    "vitest/no-test-return-statement": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/no-test-return-statement": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-test-return-statement.md)
