---
title: "vue/valid-define-props"
rule: "vue/valid-define-props"
category: "Correctness"
version: "1.15.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://eslint.vuejs.org/rules/valid-define-props.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

This rule checks whether `defineProps` compiler macro is valid.

This rule reports `defineProps` compiler macros in the following cases:

- `defineProps` is referencing locally declared variables.
- `defineProps` has both a literal type and an argument. e.g. `defineProps<{ /*props*/ }>({ /*props*/ })`
- `defineProps` has been called multiple times.
- Props are defined in both `defineProps` and `export default {}`.
- Props are not defined in either `defineProps` or `export default {}`.

### Why is this bad?

Misusing `defineProps` can lead to runtime errors, and lost type safety.
Vue may still compile the code, but properties may break silently or be typed incorrectly.

### Examples

Examples of **incorrect** code for this rule:

```vue
```

```vue
<script setup lang="ts">
defineProps<{ msg?: string }>({ msg: String });
</script>
```

```vue
```

```vue
<script>
export default {
  props: { msg: String },
};
</script>
```

Examples of **correct** code for this rule:

```vue
```

```vue
```

```vue
<script setup lang="ts">
defineProps<{ msg?: string }>();
</script>
```

```vue
<script>
export default {
  props: { msg: String },
};
</script>
```

## How to use

```json
{
  "rules": {
    "vue/valid-define-props": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/valid-define-props": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.15.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/valid-define-props.html)
