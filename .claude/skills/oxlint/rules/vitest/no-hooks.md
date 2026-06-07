---
title: "vitest/no-hooks"
rule: "vitest/no-hooks"
category: "Style"
version: "0.0.16"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-hooks.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallows Jest setup and teardown hooks, such as `beforeAll`.

### Why is this bad?

Jest provides global functions for setup and teardown tasks, which are
called before/after each test case and each test suite. The use of these
hooks promotes shared state between tests.

This rule reports for the following function calls:

- `beforeAll`
- `beforeEach`
- `afterAll`
- `afterEach`

### Examples

Examples of **incorrect** code for this rule:

```javascript
function setupFoo(options) {
  /* ... */
}
function setupBar(options) {
  /* ... */
}

describe("foo", () => {
  let foo;
  beforeEach(() => {
    foo = setupFoo();
  });
  afterEach(() => {
    foo = null;
  });
  it("does something", () => {
    expect(foo.doesSomething()).toBe(true);
  });
  describe("with bar", () => {
    let bar;
    beforeEach(() => {
      bar = setupBar();
    });
    afterEach(() => {
      bar = null;
    });
    it("does something with bar", () => {
      expect(foo.doesSomething(bar)).toBe(true);
    });
  });
});
```

## Configuration

This rule accepts a configuration object with the following properties:

### allow

type: `string[]`

default: `[]`

An array of hook function names that are permitted for use.

## How to use

```json
{
  "rules": {
    "vitest/no-hooks": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/no-hooks": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.16.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-hooks.md)
