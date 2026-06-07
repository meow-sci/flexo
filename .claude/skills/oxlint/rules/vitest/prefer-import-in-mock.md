---
title: "vitest/prefer-import-in-mock"
rule: "vitest/prefer-import-in-mock"
category: "Style"
version: "1.49.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-import-in-mock.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

This rule enforces using a dynamic `import()` in `vi.mock()` or `vi.doMock()`, which improves type information and IntelliSense for the mocked module.

### Why is this bad?

A lack of type information and IntelliSense increases the risk of mismatches between the real module and its mock.

### Examples

Examples of **incorrect** code for this rule:

```js
vi.mock("./path/to/module");
vi.doMock("./path/to/module");
```

Examples of **correct** code for this rule:

```js
vi.mock(import("./path/to/module"));
vi.doMock(import("./path/to/module"));
```

## Configuration

This rule accepts a configuration object with the following properties:

### fixable

type: `boolean`

default: `true`

Whether the rule should generate fixes or not.

## How to use

```json
{
  "rules": {
    "vitest/prefer-import-in-mock": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/prefer-import-in-mock": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.49.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-import-in-mock.md)
