---
title: "jest/prefer-to-have-been-called"
rule: "jest/prefer-to-have-been-called"
category: "Style"
version: "1.34.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/prefer-to-have-been-called.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Suggests using `toHaveBeenCalled()` or `not.toHaveBeenCalled()` over `toHaveBeenCalledTimes(0)` or `toBeCalledTimes(0)`.

### Why is this bad?

`toHaveBeenCalled()` is more explicit and readable than `toHaveBeenCalledTimes(0)`.

### Examples

Examples of **incorrect** code for this rule:

```js
expect(mock).toHaveBeenCalledTimes(0);
expect(mock).toBeCalledTimes(0);
expect(mock).not.toHaveBeenCalledTimes(0);
```

Examples of **correct** code for this rule:

```js
expect(mock).not.toHaveBeenCalled();
expect(mock).toHaveBeenCalled();
expect(mock).toHaveBeenCalledTimes(1);
```

## How to use

```json
{
  "rules": {
    "jest/prefer-to-have-been-called": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jest/prefer-to-have-been-called": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.34.0.

## References

- [Upstream rule documentation](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/prefer-to-have-been-called.md)
