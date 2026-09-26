---
title: "vitest/consistent-vitest-vi"
rule: "vitest/consistent-vitest-vi"
category: "Style"
version: "1.37.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/consistent-vitest-vi.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

This rule triggers an error when an unexpected vitest accessor is used.

### Why is this bad?

Not having a consistent vitest accessor can lead to confusion
when `vi` and `vitest` are used interchangeably.

### Examples

Examples of **incorrect** code for this rule:

```js
vitest.mock("./src/calculator.ts", { spy: true });

vi.stubEnv("NODE_ENV", "production");
```

Examples of **correct** code for this rule:

```js
vi.mock("./src/calculator.ts", { spy: true });

vi.stubEnv("NODE_ENV", "production");
```

## Configuration

This rule accepts a configuration object with the following properties:

### fn

type: `"vi" | "vitest"`

default: `"vi"`

Decides whether to prefer vitest function accessor

## How to use

```json
{
  "rules": {
    "vitest/consistent-vitest-vi": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/consistent-vitest-vi": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.37.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/consistent-vitest-vi.md)
