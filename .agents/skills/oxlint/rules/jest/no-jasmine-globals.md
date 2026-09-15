---
title: "jest/no-jasmine-globals"
rule: "jest/no-jasmine-globals"
category: "Style"
version: "0.0.13"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/no-jasmine-globals.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

This rule reports on any usage of Jasmine globals, which is not ported to
Jest, and suggests alternatives from Jest's own API.

### Why is this bad?

When migrating from Jasmine to Jest, relying on Jasmine-specific globals
creates compatibility issues and prevents taking advantage of Jest's
improved testing features and better error reporting.

### Examples

Examples of **incorrect** code for this rule:

```javascript
jasmine.DEFAULT_TIMEOUT_INTERVAL = 5000;
test("my test", () => {
  pending();
});
test("my test", () => {
  jasmine.createSpy();
});
```

Examples of **correct** code for this rule:

```javascript
jest.setTimeout(5000);
test("my test", () => {
  // Use test.skip() instead of pending()
});
test.skip("my test", () => {
  // Skipped test
});
test("my test", () => {
  jest.fn(); // Use jest.fn() instead of jasmine.createSpy()
});
```

## How to use

```json
{
  "rules": {
    "jest/no-jasmine-globals": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jest/no-jasmine-globals": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.13.

## References

- [Upstream rule documentation](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/no-jasmine-globals.md)
