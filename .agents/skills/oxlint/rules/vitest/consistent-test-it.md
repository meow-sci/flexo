---
title: "vitest/consistent-test-it"
rule: "vitest/consistent-test-it"
category: "Style"
version: "0.5.3"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/consistent-test-it.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Vitest allows you to choose how you want to define your tests, using the `it`
or the `test` keywords, with multiple permutations for each:

- **it:** `it`, `it.only`, `it.skip`, `it.concurrent`, `it.each`.
- **test:** `test`, `test.only`, `test.skip`, `test.concurrent`, `test.each`.

### Why is this bad?

It's a good practice to be consistent in your test suite, so that all tests are written in the same way.

## Configuration

This rule accepts a configuration object with the following properties:

### fn

type: `"it" | "test"`

default: `"test"`

Decides whether to use `test` or `it`.

Examples of **incorrect** code for `{ "fn": "test" }`:

```javascript
it("foo");
it.only("foo");
```

Examples of **correct** code for `{ "fn": "test" }`:

```javascript
test("foo");
test.only("foo");
```

Examples of **incorrect** code for `{ "fn": "it" }`:

```javascript
test("foo");
test.only("foo");
```

Examples of **correct** code for `{ "fn": "it" }`:

```javascript
it("foo");
it.only("foo");
```

### withinDescribe

type: `"it" | "test"`

default: `"it"`

Decides whether to use `test` or `it` within a `describe` scope.
If only `fn` is provided, this will default to the value of `fn`.

Examples of **incorrect** code for `{ "withinDescribe": "test" }`:

```javascript
describe("foo", function () {
  it("bar");
});
```

Examples of **correct** code for `{ "withinDescribe": "test" }`:

```javascript
describe("foo", function () {
  test("bar");
});
```

## How to use

```json
{
  "rules": {
    "vitest/consistent-test-it": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/consistent-test-it": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.5.3.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/consistent-test-it.md)
