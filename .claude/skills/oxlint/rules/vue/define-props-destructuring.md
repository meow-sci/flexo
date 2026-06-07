---
title: "vue/define-props-destructuring"
rule: "vue/define-props-destructuring"
category: "Style"
version: "1.20.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.vuejs.org/rules/define-props-destructuring.html"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule enforces a consistent style for handling Vue 3 Composition API props,
allowing you to choose between requiring destructuring or prohibiting it.

### Why is this bad?

By default, the rule requires you to use destructuring syntax when `defineProps`
is assigned to a variable and warns against combining `withDefaults` with destructuring.

### Examples

Examples of **incorrect** code for this rule:

```vue
<script setup lang="ts">
const props = defineProps(["foo"]);
const propsWithDefaults = withDefaults(defineProps(["foo"]), { foo: "default" });
const { baz } = withDefaults(defineProps(["baz"]), { baz: "default" });
const props = defineProps<{ foo?: string }>();
const propsWithDefaults = withDefaults(defineProps<{ foo?: string }>(), { foo: "default" });
</script>
```

Examples of **correct** code for this rule:

```vue
<script setup lang="ts">
const { foo } = defineProps(["foo"]);
const { bar = "default" } = defineProps(["bar"]);
const { foo } = defineProps<{ foo?: string }>();
const { bar = "default" } = defineProps<{ bar?: string }>();
</script>
```

## Configuration

This rule accepts a configuration object with the following properties:

### destructure

type: `"only-when-assigned" | "always" | "never"`

default: `"only-when-assigned"`

Require or prohibit destructuring.

#### `"only-when-assigned"`

Requires destructuring when `defineProps` is assigned to a variable and warns against using `withDefaults` with destructuring

#### `"always"`

Requires destructuring when using `defineProps` and warns against using `withDefaults` with destructuring

#### `"never"`

Requires using a variable to store props and prohibits destructuring

## How to use

```json
{
  "rules": {
    "vue/define-props-destructuring": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/define-props-destructuring": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.20.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/define-props-destructuring.html)
