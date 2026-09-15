---
title: "vue/no-expose-after-await"
rule: "vue/no-expose-after-await"
category: "Correctness"
version: "1.67.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.vuejs.org/rules/no-expose-after-await.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow asynchronously registered `expose`.

### Why is this bad?

`defineExpose` and `context.expose()` registered after an `await`
expression in ````

Examples of **correct** code for this rule:

```vue
```

## How to use

```json
{
  "rules": {
    "vue/no-expose-after-await": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/no-expose-after-await": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.67.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/no-expose-after-await.html)
