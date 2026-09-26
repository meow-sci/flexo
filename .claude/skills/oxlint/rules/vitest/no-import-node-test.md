---
title: "vitest/no-import-node-test"
rule: "vitest/no-import-node-test"
category: "Style"
version: "0.7.0"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-import-node-test.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

This rule warns when `node:test` is imported (usually accidentally).
With `--fix`, it will replace the import with `vitest`.

### Why is this bad?

Using `node:test` instead of `vitest` can lead to inconsistent test results
and missing features. `vitest` should be used for all testing to ensure
compatibility and access to its full functionality.

### Examples

Examples of **incorrect** code for this rule:

```javascript
import { test } from "node:test";
import { expect } from "vitest";

test("foo", () => {
  expect(1).toBe(1);
});
```

Examples of **correct** code for this rule:

```javascript
import { test, expect } from "vitest";

test("foo", () => {
  expect(1).toBe(1);
});
```

## How to use

```json
{
  "rules": {
    "vitest/no-import-node-test": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/no-import-node-test": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.7.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-import-node-test.md)
