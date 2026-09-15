---
title: "vue/define-props-declaration"
rule: "vue/define-props-declaration"
category: "Style"
version: "1.15.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.vuejs.org/rules/define-props-declaration.html"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule enforces `defineProps` typing style which you should use `type-based` or `runtime` declaration.
This rule only works in `// "vue/define-props-declaration": ["error", "runtime"]
<script setup lang="ts">
const props = defineProps<{
  kind: string;
}>();
</script>
```

Examples of **correct** code for this rule:

```vue
// "vue/define-props-declaration": ["error", "type-based"]
<script setup lang="ts">
const props = defineProps<{
  kind: string;
}>();
</script>

// "vue/define-props-declaration": ["error", "runtime"]
<script setup lang="ts">
const props = defineProps({
  kind: { type: String },
});
</script>
```

## Configuration

This rule accepts one of the following string values:

### `"type-based"`

Enforce type-based declaration.

### `"runtime"`

Enforce runtime declaration.

## How to use

```json
{
  "rules": {
    "vue/define-props-declaration": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/define-props-declaration": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.15.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/define-props-declaration.html)
