---
title: "vue/define-emits-declaration"
rule: "vue/define-emits-declaration"
category: "Style"
version: "1.15.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://eslint.vuejs.org/rules/define-emits-declaration.html"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

This rule enforces `defineEmits` typing style which you should use `type-based`, strict `type-literal` (introduced in Vue 3.3), or `runtime` declaration.
This rule only works in setup script and `lang="ts"`.

### Why is this bad?

Inconsistent code style can be confusing and make code harder to read
through.

### Examples

Examples of **incorrect** code for this rule:

```vue
// "vue/define-emits-declaration": ["error", "type-based"]
<script setup lang="ts">
const emit = defineEmits(["change", "update"]);
const emit2 = defineEmits({
  change: (id) => typeof id === "number",
  update: (value) => typeof value === "string",
});
</script>

// "vue/define-emits-declaration": ["error", "type-literal"]
<script setup lang="ts">
const emit = defineEmits<{
  (e: "change", id: number): void;
  (e: "update", value: string): void;
}>();
</script>

// "vue/define-emits-declaration": ["error", "runtime"]
<script setup lang="ts">
const emit = defineEmits<{
  (e: "change", id: number): void;
  (e: "update", value: string): void;
}>();
</script>
```

Examples of **correct** code for this rule:

```vue
// "vue/define-emits-declaration": ["error", "type-based"]
<script setup lang="ts">
const emit = defineEmits<{
  (e: "change", id: number): void;
  (e: "update", value: string): void;
}>();
const emit2 = defineEmits<{
  change: [id: number];
  update: [value: string];
}>();
</script>

// "vue/define-emits-declaration": ["error", "type-literal"]
<script setup lang="ts">
const emit = defineEmits<{
  change: [id: number];
  update: [value: string];
}>();
</script>

// "vue/define-emits-declaration": ["error", "runtime"]
<script setup lang="ts">
const emit = defineEmits<{
  (e: "change", id: number): void;
  (e: "update", value: string): void;
}>();
const emit2 = defineEmits({
  change: (id) => typeof id === "number",
  update: (value) => typeof value === "string",
});
</script>
```

## Configuration

This rule accepts one of the following string values:

### `"type-based"`

Enforces the use of a named TypeScript type or interface as the
argument to `defineEmits`, e.g. `defineEmits<MyEmits>()`.

### `"type-literal"`

Enforces the use of an inline type literal as the argument to
`defineEmits`, e.g. `defineEmits<{ (event: string): void }>()`.

### `"runtime"`

Enforces the use of runtime declaration, where emits are declared
using an array or object, e.g. `defineEmits(['event1', 'event2'])`.

## How to use

```json
{
  "rules": {
    "vue/define-emits-declaration": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/define-emits-declaration": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.15.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/define-emits-declaration.html)
