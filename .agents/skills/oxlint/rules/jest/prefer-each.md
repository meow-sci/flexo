---
title: "jest/prefer-each"
rule: "jest/prefer-each"
category: "Style"
version: "0.9.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/prefer-each.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule enforces using `each` rather than manual loops.

### Why is this bad?

Manual loops for tests can be less readable and more error-prone. Using
`each` provides a clearer and more concise way to run parameterized tests,
improving readability and maintainability.

### Examples

Examples of **incorrect** code for this rule:

```js
for (const item of items) {
  describe(item, () => {
    expect(item).toBe("foo");
  });
}
```

Examples of **correct** code for this rule:

```js
describe.each(items)("item", (item) => {
  expect(item).toBe("foo");
});
```

## How to use

```json
{
  "rules": {
    "jest/prefer-each": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jest/prefer-each": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.9.0.

## References

- [Upstream rule documentation](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/prefer-each.md)
