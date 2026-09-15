---
title: "jest/prefer-to-have-been-called-times"
rule: "jest/prefer-to-have-been-called-times"
category: "Style"
version: "1.34.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/prefer-to-have-been-called-times.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

In order to have a better failure message, [`toHaveBeenCalledTimes` should be used
instead of directly checking the length of `mock.calls`](https://github.com/jest-community/eslint-plugin-jest/blob/v29.5.0/docs/rules/prefer-to-have-been-called-times.md).

### Why is this bad?

This rule triggers a warning if `toHaveLength` is used to assert the number of times a mock is called.

### Examples

Examples of **incorrect** code for this rule:

```js
expect(someFunction.mock.calls).toHaveLength(1);
expect(someFunction.mock.calls).toHaveLength(0);
expect(someFunction.mock.calls).not.toHaveLength(1);
```

Examples of **correct** code for this rule:

```js
expect(someFunction).toHaveBeenCalledTimes(1);
expect(someFunction).toHaveBeenCalledTimes(0);
expect(someFunction).not.toHaveBeenCalledTimes(0);
expect(uncalledFunction).not.toBeCalled();
expect(method.mock.calls[0][0]).toStrictEqual(value);
```

## How to use

```json
{
  "rules": {
    "jest/prefer-to-have-been-called-times": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jest/prefer-to-have-been-called-times": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.34.0.

## References

- [Upstream rule documentation](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/prefer-to-have-been-called-times.md)
