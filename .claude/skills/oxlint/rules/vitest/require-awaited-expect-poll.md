---
title: "vitest/require-awaited-expect-poll"
rule: "vitest/require-awaited-expect-poll"
category: "Correctness"
version: "1.58.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/require-awaited-expect-poll.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule ensures that promises returned by `expect.poll` and `expect.element` calls are handled properly.

### Why is this bad?

`expect.poll` and `expect.element` return promises. If not awaited or returned,
the test completes before the assertion resolves, meaning the test will pass
regardless of whether the assertion succeeds or fails.

### Examples

Examples of **incorrect** code for this rule:

```js
test("element exists", () => {
  asyncInjectElement();

  expect.poll(() => document.querySelector(".element")).toBeInTheDocument();
});
```

Examples of **correct** code for this rule:

```js
test("element exists", () => {
  asyncInjectElement();

  return expect.poll(() => document.querySelector(".element")).toBeInTheDocument();
});
test("element exists", async () => {
  asyncInjectElement();

  await expect.poll(() => document.querySelector(".element")).toBeInTheDocument();
});
```

## How to use

```json
{
  "rules": {
    "vitest/require-awaited-expect-poll": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/require-awaited-expect-poll": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.58.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/require-awaited-expect-poll.md)
