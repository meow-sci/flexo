---
title: "jest/prefer-importing-jest-globals"
rule: "jest/prefer-importing-jest-globals"
category: "Style"
version: "1.60.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/prefer-importing-jest-globals.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Prefer importing Jest globals (`describe`, `test`, `expect`, etc.) from
`@jest/globals` rather than relying on ambient globals.

### Why is this bad?

Using global Jest functions without explicit imports makes dependencies
implicit and can cause issues with type checking, editor tooling, and
when migrating between test runners.

### Examples

Examples of **incorrect** code for this rule:

```javascript
describe("suite", () => {
  test("foo");
  expect(true).toBeDefined();
});
```

Examples of **correct** code for this rule:

```javascript
import { describe, expect, test } from "@jest/globals";
describe("suite", () => {
  test("foo");
  expect(true).toBeDefined();
});
```

## Configuration

This rule accepts a configuration object with the following properties:

### types

type: `array`

default: `["hook", "describe", "test", "expect", "jest", "unknown"]`

Jest function types to enforce importing for.

#### types[n]

type: `"hook" | "describe" | "test" | "expect" | "jest" | "unknown"`

## How to use

```json
{
  "rules": {
    "jest/prefer-importing-jest-globals": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "jest/prefer-importing-jest-globals": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.60.0.

## References

- [Upstream rule documentation](https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/prefer-importing-jest-globals.md)
