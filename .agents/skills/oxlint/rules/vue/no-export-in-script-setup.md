---
title: "vue/no-export-in-script-setup"
rule: "vue/no-export-in-script-setup"
category: "Correctness"
version: "1.20.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.vuejs.org/rules/no-export-in-script-setup.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow `export` in ````

Examples of **correct** code for this rule:

```vue
```

## How to use

```json
{
  "rules": {
    "vue/no-export-in-script-setup": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/no-export-in-script-setup": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.20.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/no-export-in-script-setup.html)
