---
title: "vue/require-slots-as-functions"
rule: "vue/require-slots-as-functions"
category: "Correctness"
version: "1.67.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.vuejs.org/rules/require-slots-as-functions.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforce properties of `$slots` to be used as a function.

### Why is this bad?

In Vue.js 3, `this.$slots.<name>` is a function (slot render function),
not an array of vnodes like in Vue.js 2. Treating slot properties as
values (e.g. `this.$slots.default.filter(...)`) breaks at runtime.

### Examples

Examples of **incorrect** code for this rule:

```vue
<script>
export default {
  render(h) {
    var children = this.$slots.default
    return h('div', children.filter(...))
  }
}
</script>
```

Examples of **correct** code for this rule:

```vue
<script>
export default {
  render(h) {
    var children = this.$slots.default();
    return h("div", children);
  },
};
</script>
```

## How to use

```json
{
  "rules": {
    "vue/require-slots-as-functions": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/require-slots-as-functions": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.67.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/require-slots-as-functions.html)
