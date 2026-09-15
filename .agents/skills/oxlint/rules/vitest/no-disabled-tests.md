---
title: "vitest/no-disabled-tests"
rule: "vitest/no-disabled-tests"
category: "Correctness"
version: "0.0.7"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-disabled-tests.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule raises a warning about disabled tests.

### Why is this bad?

Jest has a feature that allows you to temporarily mark tests as disabled. This
feature is often helpful while debugging or to create placeholders for future
tests. Before committing changes we may want to check that all tests are
running.

### Examples

```js
describe.skip("foo", () => {});
it.skip("foo", () => {});
test.skip("foo", () => {});

describe["skip"]("bar", () => {});
it["skip"]("bar", () => {});
test["skip"]("bar", () => {});

xdescribe("foo", () => {});
xit("foo", () => {});
xtest("foo", () => {});

it("bar");
test("bar");

it("foo", () => {
  pending();
});
```

## How to use

```json
{
  "rules": {
    "vitest/no-disabled-tests": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/no-disabled-tests": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.7.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-disabled-tests.md)
