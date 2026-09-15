---
title: "vitest/require-top-level-describe"
rule: "vitest/require-top-level-describe"
category: "Style"
version: "0.4.2"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/require-top-level-describe.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Requires test cases and hooks to be inside a top-level `describe` block.

### Why is this bad?

Having tests and hooks organized within `describe` blocks provides better
structure and grouping for test suites. It makes test output more readable
and helps with test organization, especially in larger codebases.

This rule triggers a warning if a test case (`test` and `it`) or a hook
(`beforeAll`, `beforeEach`, `afterEach`, `afterAll`) is not located in a
top-level `describe` block.

### Examples

Examples of **incorrect** code for this rule:

```javascript
// Above a describe block
test("my test", () => {});
describe("test suite", () => {
  it("test", () => {});
});

// Below a describe block
describe("test suite", () => {});
test("my test", () => {});

// Same for hooks
beforeAll("my beforeAll", () => {});
describe("test suite", () => {});
afterEach("my afterEach", () => {});
```

Examples of **correct** code for this rule:

```javascript
// Above a describe block
// In a describe block
describe("test suite", () => {
  test("my test", () => {});
});

// In a nested describe block
describe("test suite", () => {
  test("my test", () => {});
  describe("another test suite", () => {
    test("my other test", () => {});
  });
});
```

## Configuration

This rule accepts a configuration object with the following properties:

### maxNumberOfTopLevelDescribes

type: `integer`

default: `Infinity`

The maximum number of top-level `describe` blocks allowed in a test file.

## How to use

```json
{
  "rules": {
    "vitest/require-top-level-describe": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/require-top-level-describe": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.2.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/require-top-level-describe.md)
