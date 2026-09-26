---
title: "unicorn/no-thenable"
rule: "unicorn/no-thenable"
category: "Correctness"
version: "0.0.13"
default: true
type_aware: false
fix: "none"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-thenable.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow defining a `then` property.

### Why is this bad?

If an object is defined as "thenable", once it's accidentally
used in an `await` expression, it may cause problems.

### Examples

Examples of **incorrect** code for this rule:

```javascript
async function example() {
  const foo = {
    unicorn: 1,
    then() {},
  };

  const { unicorn } = await foo;

  console.log("after"); // <- This will never execute
}
```

Examples of **correct** code for this rule:

```javascript
async function example() {
  const foo = {
    unicorn: 1,
    bar() {},
  };

  const { unicorn } = await foo;

  console.log("after");
}
```

## How to use

```json
{
  "rules": {
    "unicorn/no-thenable": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-thenable": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.13.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-thenable.md)
