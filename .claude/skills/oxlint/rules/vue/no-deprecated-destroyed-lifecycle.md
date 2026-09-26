---
title: "vue/no-deprecated-destroyed-lifecycle"
rule: "vue/no-deprecated-destroyed-lifecycle"
category: "Correctness"
version: "1.35.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://eslint.vuejs.org/rules/no-deprecated-destroyed-lifecycle.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Disallow using deprecated `destroyed` and `beforeDestroy` lifecycle hooks in Vue.js 3.0.0+.

### Why is this bad?

In Vue.js 3.0.0+, the `destroyed` and `beforeDestroy` lifecycle hooks have been renamed
to `unmounted` and `beforeUnmount` respectively. Using the old names is deprecated and
may cause confusion or compatibility issues.

### Examples

Examples of **incorrect** code for this rule:

```vue
<script>
export default {
  beforeDestroy() {},
  destroyed() {},
};
</script>
```

Examples of **correct** code for this rule:

```vue
<script>
export default {
  beforeUnmount() {},
  unmounted() {},
};
</script>
```

## How to use

```json
{
  "rules": {
    "vue/no-deprecated-destroyed-lifecycle": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/no-deprecated-destroyed-lifecycle": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.35.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/no-deprecated-destroyed-lifecycle.html)
