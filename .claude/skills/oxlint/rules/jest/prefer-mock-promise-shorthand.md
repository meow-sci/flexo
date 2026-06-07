---
title: "jest/prefer-mock-promise-shorthand"
rule: "jest/prefer-mock-promise-shorthand"
category: "Style"
version: "0.2.16"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/prefer-mock-promise-shorthand.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

When working with mocks of functions that return promises, Jest provides some
API sugar functions to reduce the amount of boilerplate you have to write.
These methods should be preferred when possible.

### Why is this bad?

Using generic mock functions like `mockImplementation(() => Promise.resolve())`
or `mockReturnValue(Promise.reject())` is more verbose and less readable than
Jest's specialized promise shorthands. The shorthand methods like
`mockResolvedValue()` and `mockRejectedValue()` are more expressive and
make the test intent clearer.

### Examples

Examples of **incorrect** code for this rule:

```javascript
jest.fn().mockImplementation(() => Promise.resolve(123));
jest.spyOn(fs.promises, "readFile").mockReturnValue(Promise.reject(new Error("oh noes!")));

myFunction
  .mockReturnValueOnce(Promise.resolve(42))
  .mockImplementationOnce(() => Promise.resolve(42))
  .mockReturnValue(Promise.reject(new Error("too many calls!")));
```

Examples of **correct** code for this rule:

```javascript
jest.fn().mockResolvedValue(123);
jest.spyOn(fs.promises, "readFile").mockRejectedValue(new Error("oh noes!"));

myFunction
  .mockResolvedValueOnce(42)
  .mockResolvedValueOnce(42)
  .mockRejectedValue(new Error("too many calls!"));
```

## How to use

```json
{
  "rules": {
    "jest/prefer-mock-promise-shorthand": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jest/prefer-mock-promise-shorthand": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.16.

## References

- [Upstream rule documentation](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/prefer-mock-promise-shorthand.md)
