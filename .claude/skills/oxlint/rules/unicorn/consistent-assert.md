---
title: "unicorn/consistent-assert"
rule: "unicorn/consistent-assert"
category: "Pedantic"
version: "0.16.9"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/consistent-assert.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforces consistent usage of the `assert` module.

### Why is this bad?

Inconsistent usage of the `assert` module can make code
harder to follow and understand.

`assert.ok(...)` is preferred as it makes the intent of
the assertion clearer.

### Examples

Examples of **incorrect** code for this rule:

```js
import assert from "node:assert";

assert(divide(10, 2) === 5);
```

Examples of **correct** code for this rule:

```js
import assert from "node:assert";

assert.ok(divide(10, 2) === 5);
```

## How to use

```json
{
  "rules": {
    "unicorn/consistent-assert": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/consistent-assert": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.16.9.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/consistent-assert.md)
