---
title: "vue/no-deprecated-delete-set"
rule: "vue/no-deprecated-delete-set"
category: "Correctness"
version: "1.62.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.vuejs.org/rules/no-deprecated-delete-set.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow using deprecated `$set` / `$delete` (in Vue.js 3.0.0+).

### Why is this bad?

In Vue 3, the instance methods `$set` / `$delete` and the global
`Vue.set` / `Vue.delete` were removed. Reactivity is now backed by
Proxies, so plain assignment and the `delete` operator work as
expected and these helpers are no longer needed.

### Examples

Examples of **incorrect** code for this rule:

```vue
<script>
export default {
  mounted() {
    this.$set(obj, key, value);
    this.$delete(obj, key);
    Vue.set(obj, key, value);
    Vue.delete(obj, key);
  },
};
</script>
```

Examples of **correct** code for this rule:

```vue
<script>
export default {
  mounted() {
    obj[key] = value;
    delete obj[key];
  },
};
</script>
```

## How to use

```json
{
  "rules": {
    "vue/no-deprecated-delete-set": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/no-deprecated-delete-set": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.62.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/no-deprecated-delete-set.html)
