---
title: "vitest/max-nested-describe"
rule: "vitest/max-nested-describe"
category: "Style"
version: "0.4.4"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/max-nested-describe.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule enforces a maximum depth to nested `describe()` calls.

### Why is this bad?

Nesting `describe()` blocks too deeply can make the test suite hard to read and understand.

### Examples

The following patterns are considered warnings (with the default option of
`{ "max": 5 } `):

Examples of **incorrect** code for this rule:

```javascript
describe("foo", () => {
  describe("bar", () => {
    describe("baz", () => {
      describe("qux", () => {
        describe("quxx", () => {
          describe("too many", () => {
            it("should get something", () => {
              expect(getSomething()).toBe("Something");
            });
          });
        });
      });
    });
  });
});

describe("foo", function () {
  describe("bar", function () {
    describe("baz", function () {
      describe("qux", function () {
        describe("quxx", function () {
          describe("too many", function () {
            it("should get something", () => {
              expect(getSomething()).toBe("Something");
            });
          });
        });
      });
    });
  });
});
```

Examples of **correct** code for this rule:

```ts
describe("foo", () => {
  describe("bar", () => {
    it("should get something", () => {
      expect(getSomething()).toBe("Something");
    });
  });
  describe("qux", () => {
    it("should get something", () => {
      expect(getSomething()).toBe("Something");
    });
  });
});

describe("foo2", function () {
  it("should get something", () => {
    expect(getSomething()).toBe("Something");
  });
});

describe("foo", function () {
  describe("bar", function () {
    describe("baz", function () {
      describe("qux", function () {
        describe("this is the limit", function () {
          it("should get something", () => {
            expect(getSomething()).toBe("Something");
          });
        });
      });
    });
  });
});
```

## Configuration

This rule accepts a configuration object with the following properties:

### max

type: `integer`

default: `5`

Maximum allowed depth of nested describe calls.

## How to use

```json
{
  "rules": {
    "vitest/max-nested-describe": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/max-nested-describe": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.4.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/max-nested-describe.md)
