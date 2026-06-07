---
title: "vue/no-import-compiler-macros"
rule: "vue/no-import-compiler-macros"
category: "Restriction"
version: "1.21.0"
default: false
type_aware: false
fix: "fixable_dangerous_fix"
upstream: "https://eslint.vuejs.org/rules/no-import-compiler-macros.html"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | fixable_dangerous_fix |
| Type-aware | no |


### What it does

Disallow importing Vue compiler macros.

### Why is this bad?

Compiler Macros like:

- `defineProps`
- `defineEmits`
- `defineExpose`
- `withDefaults`
- `defineModel`
- `defineOptions`
- `defineSlots`

are globally available in Vue 3's ````

Examples of **correct** code for this rule:

```vue
```

## How to use

```json
{
  "rules": {
    "vue/no-import-compiler-macros": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/no-import-compiler-macros": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.21.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/no-import-compiler-macros.html)
