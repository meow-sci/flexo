---
title: "vitest/warn-todo"
rule: "vitest/warn-todo"
category: "Correctness"
version: "1.37.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/warn-todo.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule warns about usage of `.todo` in `describe`, `it`, or `test` functions.

### Why is this bad?

The tests you push should be complete. Any pending/`TODO` code should not be committed.

### Examples

Examples of **incorrect** code for this rule:

```js
describe.todo("foo", () => {});
it.todo("foo", () => {});
test.todo("foo", () => {});
```

Examples of **correct** code for this rule:

```js
describe([])("foo", () => {});
it([])("foo", () => {});
test([])("foo", () => {});
```

## How to use

```json
{
  "rules": {
    "vitest/warn-todo": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vitest/warn-todo": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.37.0.

## References

- [Upstream rule documentation](https://github.com/vitest-dev/eslint-plugin-vitest/blob/main/docs/rules/warn-todo.md)
