---
title: "jest/prefer-called-with"
rule: "jest/prefer-called-with"
category: "Style"
version: "0.2.5"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/prefer-called-with.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Suggest using `toBeCalledWith()` or `toHaveBeenCalledWith()`

### Why is this bad?

When testing function calls, it's often more valuable to assert both
that a function was called AND what arguments it was called with.
Using `toBeCalled()` or `toHaveBeenCalled()` only verifies the function
was invoked, but doesn't validate the arguments, potentially missing
bugs where functions are called with incorrect parameters.

### Examples

Examples of **incorrect** code for this rule:

```javascript
expect(someFunction).toBeCalled();
expect(someFunction).toHaveBeenCalled();
```

Examples of **correct** code for this rule:

```javascript
expect(noArgsFunction).toBeCalledWith();
expect(roughArgsFunction).toBeCalledWith(expect.anything(), expect.any(Date));
expect(anyArgsFunction).toBeCalledTimes(1);
expect(uncalledFunction).not.toBeCalled();
```

## How to use

```json
{
  "rules": {
    "jest/prefer-called-with": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jest/prefer-called-with": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.5.

## References

- [Upstream rule documentation](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/prefer-called-with.md)
