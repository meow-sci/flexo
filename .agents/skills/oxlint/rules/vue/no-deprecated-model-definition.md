---
title: "vue/no-deprecated-model-definition"
rule: "vue/no-deprecated-model-definition"
category: "Correctness"
version: "1.63.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://eslint.vuejs.org/rules/no-deprecated-model-definition.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallow deprecated `model` definition (in Vue.js 3.0.0+).

### Why is this bad?

Vue 3 removed the per-component `model` option. Instead, `v-model`
works through the `modelValue` prop and the `update:modelValue` event,
so a `model: { prop, event }` block is no longer needed.

With `{ "allowVue3Compat": true }`, a `model` block is allowed if it
already uses the Vue 3-compatible `modelValue` / `update:modelValue`
(or kebab-case `model-value` / `update:model-value`) pair, easing
migration.

### Examples

Examples of **incorrect** code for this rule:

```vue
<script>
export default {
  model: {
    prop: "foo",
    event: "update",
  },
};
</script>
```

Examples of **correct** code for this rule with the
`{ "allowVue3Compat": true }` option:

```vue
<script>
export default {
  model: {
    prop: "modelValue",
    event: "update:modelValue",
  },
};
</script>
```

## Configuration

### allowVue3Compat

type: `boolean`

default: `false`

Allow `model: { prop: 'modelValue', event: 'update:modelValue' }` (or
the kebab-case `model-value` variant) which is forwards-compatible with
Vue 3's `v-model`.

## How to use

```json
{
  "rules": {
    "vue/no-deprecated-model-definition": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/no-deprecated-model-definition": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.63.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/no-deprecated-model-definition.html)
