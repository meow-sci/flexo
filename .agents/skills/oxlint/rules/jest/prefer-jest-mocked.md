---
title: "jest/prefer-jest-mocked"
rule: "jest/prefer-jest-mocked"
category: "Style"
version: "0.5.0"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/prefer-jest-mocked.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

When working with mocks of functions using Jest, it's recommended to use the
`jest.mocked()` helper function to properly type the mocked functions. This rule
enforces the use of `jest.mocked()` for better type safety and readability.

Restricted types:

- `jest.Mock`
- `jest.MockedFunction`
- `jest.MockedClass`
- `jest.MockedObject`

### Why is this bad?

Using type assertions like `fn as jest.Mock` is a less safe approach
than using `jest.mocked()`. The `jest.mocked()` helper provides better
type safety by preserving the original function signature while adding
mock capabilities. It also makes the code more readable and explicit
about mocking intentions.

### Examples

Examples of **incorrect** code for this rule:

```typescript
(foo as jest.Mock).mockReturnValue(1);
const mock = (foo as jest.Mock).mockReturnValue(1);
(foo as unknown as jest.Mock).mockReturnValue(1);
(Obj.foo as jest.Mock).mockReturnValue(1);
([].foo as jest.Mock).mockReturnValue(1);
```

Examples of **correct** code for this rule:

```typescript
jest.mocked(foo).mockReturnValue(1);
const mock = jest.mocked(foo).mockReturnValue(1);
jest.mocked(Obj.foo).mockReturnValue(1);
jest.mocked([].foo).mockReturnValue(1);
```

## How to use

```json
{
  "rules": {
    "jest/prefer-jest-mocked": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jest/prefer-jest-mocked": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.5.0.

## References

- [Upstream rule documentation](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/prefer-jest-mocked.md)
