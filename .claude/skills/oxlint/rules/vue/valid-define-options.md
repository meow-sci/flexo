---
title: "vue/valid-define-options"
rule: "vue/valid-define-options"
category: "Correctness"
version: "1.67.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.vuejs.org/rules/valid-define-options.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforce valid `defineOptions` compiler macro.

### Why is this bad?

`defineOptions` is a compiler macro for ````

Examples of **correct** code for this rule:

```vue
```

## How to use

```json
{
  "rules": {
    "vue/valid-define-options": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/valid-define-options": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.67.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/valid-define-options.html)
