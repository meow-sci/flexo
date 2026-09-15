---
title: "unicorn/no-invalid-fetch-options"
rule: "unicorn/no-invalid-fetch-options"
category: "Correctness"
version: "0.15.12"
default: true
type_aware: false
fix: "none"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-invalid-fetch-options.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | none |
| Type-aware | no |


### What it does

Disallow invalid options in `fetch()` and `new Request()`. Specifically, this rule ensures that
a body is not provided when the method is `GET` or `HEAD`, as it will result in a `TypeError`.

### Why is this bad?

The `fetch()` function throws a `TypeError` when the method is `GET` or `HEAD` and a body is provided.
This can lead to unexpected behavior and errors in your code. By disallowing such invalid options,
the rule ensures that requests are correctly configured and prevents unnecessary errors.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const response = await fetch("/", { method: "GET", body: "foo=bar" });

const request = new Request("/", { method: "GET", body: "foo=bar" });
```

Examples of **correct** code for this rule:

```javascript
const response = await fetch("/", { method: "POST", body: "foo=bar" });

const request = new Request("/", { method: "POST", body: "foo=bar" });
```

## How to use

```json
{
  "rules": {
    "unicorn/no-invalid-fetch-options": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-invalid-fetch-options": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.15.12.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-invalid-fetch-options.md)
