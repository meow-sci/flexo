---
title: "vitest/no-mocks-import"
rule: "vitest/no-mocks-import"
category: "Style"
version: "0.0.13"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-mocks-import.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule reports imports from a path containing a `__mocks__` component.

### Why is this bad?

Manually importing mocks from a `__mocks__` directory can lead to unexpected behavior
and breaks Jest's automatic mocking system. Jest is designed to automatically resolve
and use mocks from `__mocks__` directories when `jest.mock()` is called. Directly
importing from these directories bypasses Jest's module resolution system and can cause
inconsistencies between test and production environments.

### Examples

Examples of **incorrect** code for this rule:

```ts
import thing from "./__mocks__/index";
require("./__mocks__/index");
```

Examples of **correct** code for this rule:

```ts
import thing from "thing";
require("thing");
```

## How to use

```json
{
  "rules": {
    "vitest/no-mocks-import": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/no-mocks-import": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.13.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/no-mocks-import.md)
