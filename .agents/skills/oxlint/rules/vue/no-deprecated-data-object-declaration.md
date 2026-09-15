---
title: "vue/no-deprecated-data-object-declaration"
rule: "vue/no-deprecated-data-object-declaration"
category: "Correctness"
version: "1.62.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://eslint.vuejs.org/rules/no-deprecated-data-object-declaration.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallow object declaration on `data` (in Vue.js 3.0.0+).

### Why is this bad?

In Vue 3, declaring `data` as an object causes the same object to be
shared between every instance of the component, which leads to cross-
instance state pollution. `data` must be a function that returns a
fresh object per instance.

### Examples

Examples of **incorrect** code for this rule:

```vue
<script>
export default {
  data: {
    foo: "bar",
  },
};
</script>
```

Examples of **correct** code for this rule:

```vue
<script>
export default {
  data() {
    return { foo: "bar" };
  },
};
</script>
```

## How to use

```json
{
  "rules": {
    "vue/no-deprecated-data-object-declaration": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/no-deprecated-data-object-declaration": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.62.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/no-deprecated-data-object-declaration.html)
