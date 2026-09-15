---
title: "vitest/prefer-importing-vitest-globals"
rule: "vitest/prefer-importing-vitest-globals"
category: "Style"
version: "1.59.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-importing-vitest-globals.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforces explicit imports from 'vitest' instead of using vitest globals.

### Why is this bad?

Using vitest globals without importing them relies on implicit global configuration
(`globals: true` in vitest config). Explicit imports make dependencies clear,
improve IDE support, and ensure compatibility across different setups.

### Examples

Examples of **incorrect** code for this rule:

```js
describe("suite", () => {
  it("test", () => {
    expect(true).toBe(true);
  });
});
```

Examples of **correct** code for this rule:

```js
import { describe, it, expect } from "vitest";

describe("suite", () => {
  it("test", () => {
    expect(true).toBe(true);
  });
});
```

## How to use

```json
{
  "rules": {
    "vitest/prefer-importing-vitest-globals": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/prefer-importing-vitest-globals": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.59.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-importing-vitest-globals.md)
