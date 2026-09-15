---
title: "vitest/prefer-todo"
rule: "vitest/prefer-todo"
category: "Style"
version: "0.0.16"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-todo.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

When test cases are empty then it is better to mark them as `test.todo` as it
will be highlighted in the summary output.

### Why is this bad?

This rule triggers a warning if empty test cases are used without 'test.todo'.

### Examples

Examples of **incorrect** code for this rule:

```javascript
test("i need to write this test"); // invalid
test("i need to write this test", () => {}); // invalid
test.skip("i need to write this test", () => {}); // invalid
```

Examples of **correct** code for this rule:

```javascript
test.todo("i need to write this test");
```

## How to use

```json
{
  "rules": {
    "vitest/prefer-todo": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/prefer-todo": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.16.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/prefer-todo.md)
