---
title: "jest/no-confusing-set-timeout"
rule: "jest/no-confusing-set-timeout"
category: "Style"
version: "0.0.14"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/no-confusing-set-timeout.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow confusing usages of `jest.setTimeout`.

### Why is this bad?

- being called anywhere other than in global scope
- being called multiple times
- being called after other Jest functions like hooks, `describe`, `test`, or `it`

### Examples

All of these are invalid case:

```javascript
escribe("test foo", () => {
  jest.setTimeout(1000);
  it("test-description", () => {
    // test logic;
  });
});

describe("test bar", () => {
  it("test-description", () => {
    jest.setTimeout(1000);
    // test logic;
  });
});

test("foo-bar", () => {
  jest.setTimeout(1000);
});

describe("unit test", () => {
  beforeEach(() => {
    jest.setTimeout(1000);
  });
});
```

## How to use

```json
{
  "rules": {
    "jest/no-confusing-set-timeout": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jest/no-confusing-set-timeout": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.14.

## References

- [Upstream rule documentation](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/no-confusing-set-timeout.md)
