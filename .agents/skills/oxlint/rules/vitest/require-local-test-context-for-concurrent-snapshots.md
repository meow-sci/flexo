---
title: "vitest/require-local-test-context-for-concurrent-snapshots"
rule: "vitest/require-local-test-context-for-concurrent-snapshots"
category: "Correctness"
version: "0.8.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/require-local-test-context-for-concurrent-snapshots.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

The rule is intended to ensure that concurrent snapshot tests are executed
within a properly configured local test context.

### Why is this bad?

Running snapshot tests concurrently without a proper context can lead to
unreliable or inconsistent snapshots. Ensuring that concurrent tests are
correctly configured with the appropriate context helps maintain accurate
and stable snapshots, avoiding potential conflicts or failures.

### Examples

Examples of **incorrect** code for this rule:

```javascript
test.concurrent("myLogic", () => {
  expect(true).toMatchSnapshot();
});

describe.concurrent("something", () => {
  test("myLogic", () => {
    expect(true).toMatchInlineSnapshot();
  });
});
```

Examples of **correct** code for this rule:

```javascript
test.concurrent("myLogic", ({ expect }) => {
  expect(true).toMatchSnapshot();
});

test.concurrent("myLogic", (context) => {
  context.expect(true).toMatchSnapshot();
});
```

## How to use

```json
{
  "rules": {
    "vitest/require-local-test-context-for-concurrent-snapshots": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/require-local-test-context-for-concurrent-snapshots": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.8.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/require-local-test-context-for-concurrent-snapshots.md)
