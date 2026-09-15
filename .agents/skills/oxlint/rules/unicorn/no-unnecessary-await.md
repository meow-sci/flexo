---
title: "unicorn/no-unnecessary-await"
rule: "unicorn/no-unnecessary-await"
category: "Correctness"
version: "0.0.12"
default: true
type_aware: false
fix: "conditional_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-unnecessary-await.md"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | yes |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

Disallow awaiting on non-promise values.

### Why is this bad?

The `await` operator should only be used on `Promise` values.

### Examples

Examples of **incorrect** code for this rule:

```javascript
async function bad() {
  await await promise;
}
```

Examples of **correct** code for this rule:

```javascript
async function bad() {
  await promise;
}
```

## How to use

```json
{
  "rules": {
    "unicorn/no-unnecessary-await": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-unnecessary-await": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.12.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-unnecessary-await.md)
