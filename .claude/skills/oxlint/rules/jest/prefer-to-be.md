---
title: "jest/prefer-to-be"
rule: "jest/prefer-to-be"
category: "Style"
version: "0.2.14"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/prefer-to-be.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Recommends using `toBe` matcher for primitive literals and specific
matchers for `null`, `undefined`, and `NaN`.

### Why is this bad?

When asserting against primitive literals such as numbers and strings,
the equality matchers all operate the same, but read slightly
differently in code.

This rule recommends using the `toBe` matcher in these situations, as
it forms the most grammatically natural sentence. For `null`,
`undefined`, and `NaN` this rule recommends using their specific `toBe`
matchers, as they give better error messages as well.

### Examples

Examples of **incorrect** code for this rule:

```javascript
expect(value).not.toEqual(5);
expect(getMessage()).toStrictEqual("hello world");
expect(loadMessage()).resolves.toEqual("hello world");
```

Examples of **correct** code for this rule:

```javascript
expect(value).not.toBe(5);
expect(getMessage()).toBe("hello world");
expect(loadMessage()).resolves.toBe("hello world");
expect(didError).not.toBe(true);
expect(catchError()).toStrictEqual({ message: "oh noes!" });
```

## How to use

```json
{
  "rules": {
    "jest/prefer-to-be": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jest/prefer-to-be": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.14.

## References

- [Upstream rule documentation](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/prefer-to-be.md)
