---
title: "vitest/no-duplicate-hooks"
rule: "vitest/no-duplicate-hooks"
category: "Style"
version: "0.4.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-duplicate-hooks.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallows duplicate hooks in describe blocks.

### Why is this bad?

Having duplicate hooks in a describe block can lead to confusion and unexpected behavior.
When multiple hooks of the same type exist, they all execute in order, which can make it
difficult to understand the test setup flow and may result in redundant or conflicting
operations. This makes tests harder to maintain and debug.

### Examples

Examples of **incorrect** code for this rule:

```javascript
describe("foo", () => {
  beforeEach(() => {
    // some setup
  });
  beforeEach(() => {
    // some setup
  });
  test("foo_test", () => {
    // some test
  });
});

// Nested describe scenario
describe("foo", () => {
  beforeEach(() => {
    // some setup
  });
  test("foo_test", () => {
    // some test
  });
  describe("bar", () => {
    test("bar_test", () => {
      afterAll(() => {
        // some teardown
      });
      afterAll(() => {
        // some teardown
      });
    });
  });
});
```

Examples of **correct** code for this rule:

```javascript
describe("foo", () => {
  beforeEach(() => {
    // some setup
  });
  test("foo_test", () => {
    // some test
  });
});

// Nested describe scenario
describe("foo", () => {
  beforeEach(() => {
    // some setup
  });
  test("foo_test", () => {
    // some test
  });
  describe("bar", () => {
    test("bar_test", () => {
      beforeEach(() => {
        // some setup
      });
    });
  });
});
```

## How to use

```json
{
  "rules": {
    "vitest/no-duplicate-hooks": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/no-duplicate-hooks": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-duplicate-hooks.md)
