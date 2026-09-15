---
title: "unicorn/no-object-as-default-parameter"
rule: "unicorn/no-object-as-default-parameter"
category: "Pedantic"
version: "0.0.16"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-object-as-default-parameter.md"
---

| Property | Value |
|----------|-------|
| Category | Pedantic |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow the use of an object literal as a default value for a parameter.

### Why is this bad?

Default parameters should not be passed to a function through an object literal. The `foo = {a: false}` parameter works fine if only used with one option. As soon as additional options are added, you risk replacing the whole `foo = {a: false, b: true}` object when passing only one option: `{a: true}`. For this reason, object destructuring should be used instead.

### Examples

Examples of **incorrect** code for this rule:

```javascript
function foo(foo = { a: false }) {}
```

Examples of **correct** code for this rule:

```javascript
function foo({ a = false } = {}) {}
```

## How to use

```json
{
  "rules": {
    "unicorn/no-object-as-default-parameter": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-object-as-default-parameter": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.16.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-object-as-default-parameter.md)
