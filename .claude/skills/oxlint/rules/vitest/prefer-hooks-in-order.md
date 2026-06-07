---
title: "vitest/prefer-hooks-in-order"
rule: "vitest/prefer-hooks-in-order"
category: "Style"
version: "0.6.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-hooks-in-order.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Ensures that hooks are in the order that they are called in.

### Why is this bad?

While hooks can be setup in any order, they're always called by `jest` in this
specific order:

1. `beforeAll`
2. `beforeEach`
3. `afterEach`
4. `afterAll`

This rule aims to make that more obvious by enforcing grouped hooks be setup in
that order within tests.

### Examples

Examples of **incorrect** code for this rule:

```javascript
describe("foo", () => {
  beforeEach(() => {
    seedMyDatabase();
  });
  beforeAll(() => {
    createMyDatabase();
  });
  it("accepts this input", () => {
    // ...
  });
  it("returns that value", () => {
    // ...
  });
  describe("when the database has specific values", () => {
    const specificValue = "...";
    beforeEach(() => {
      seedMyDatabase(specificValue);
    });
    it("accepts that input", () => {
      // ...
    });
    it("throws an error", () => {
      // ...
    });
    afterEach(() => {
      clearLogger();
    });
    beforeEach(() => {
      mockLogger();
    });
    it("logs a message", () => {
      // ...
    });
  });
  afterAll(() => {
    removeMyDatabase();
  });
});
```

Examples of **correct** code for this rule:

```javascript
describe("foo", () => {
  beforeAll(() => {
    createMyDatabase();
  });
  beforeEach(() => {
    seedMyDatabase();
  });
  it("accepts this input", () => {
    // ...
  });
  it("returns that value", () => {
    // ...
  });
  describe("when the database has specific values", () => {
    const specificValue = "...";
    beforeEach(() => {
      seedMyDatabase(specificValue);
    });
    it("accepts that input", () => {
      // ...
    });
    it("throws an error", () => {
      // ...
    });
    beforeEach(() => {
      mockLogger();
    });
    afterEach(() => {
      clearLogger();
    });
    it("logs a message", () => {
      // ...
    });
  });
  afterAll(() => {
    removeMyDatabase();
  });
});
```

## How to use

```json
{
  "rules": {
    "vitest/prefer-hooks-in-order": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/prefer-hooks-in-order": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.6.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-hooks-in-order.md)
