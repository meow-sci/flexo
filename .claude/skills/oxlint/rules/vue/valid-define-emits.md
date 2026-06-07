---
title: "vue/valid-define-emits"
rule: "vue/valid-define-emits"
category: "Correctness"
version: "1.14.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://eslint.vuejs.org/rules/valid-define-emits.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

This rule checks whether `defineEmits` compiler macro is valid.

This rule reports `defineEmits` compiler macros in the following cases:

- `defineEmits` is referencing locally declared variables.
- `defineEmits` has both a literal type and an argument. e.g. `defineEmits<(e: 'foo')=>void>(['bar'])`
- `defineEmits` has been called multiple times.
- Custom events are defined in both `defineEmits` and `export default {}`.
- Custom events are not defined in either `defineEmits` or `export default {}`.

### Why is this bad?

Misusing `defineEmits` can lead to runtime errors, unclear component contracts, and lost type safety.
Vue may still compile the code, but emitted events may break silently or be typed incorrectly.

### Examples

Examples of **incorrect** code for this rule:

```vue
```

```vue
<script setup lang="ts">
defineEmits<(e: "notify") => void>({ submit: null });
</script>
```

```vue
```

```vue
<script>
export default {
  emits: ["notify"],
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
defineEmits<(e: "notify") => void>();
</script>
```

```vue
<script>
export default {
  emits: ["notify"],
};
</script>
```

## How to use

```json
{
  "rules": {
    "vue/valid-define-emits": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/valid-define-emits": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.14.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/valid-define-emits.html)
