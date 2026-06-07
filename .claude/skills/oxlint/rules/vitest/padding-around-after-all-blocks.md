---
title: "vitest/padding-around-after-all-blocks"
rule: "vitest/padding-around-after-all-blocks"
category: "Style"
version: "1.66.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/padding-around-after-all-blocks.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

This rule enforces a line of padding before and after 1 or more
`afterAll` statements.

### Why is this bad?

Inconsistent formatting of code can make the code more difficult to read
and follow. This rule helps ensure that `afterAll` blocks are visually
separated from the rest of the code, making them easier to identify while
looking through test files.

### Examples

Examples of **incorrect** code for this rule:

```js
const thing = 123;
afterAll(() => {});
```

Examples of **correct** code for this rule:

```js
const thing = 123;

afterAll(() => {});
```

## How to use

```json
{
  "rules": {
    "vitest/padding-around-after-all-blocks": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/padding-around-after-all-blocks": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.66.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/padding-around-after-all-blocks.md)
