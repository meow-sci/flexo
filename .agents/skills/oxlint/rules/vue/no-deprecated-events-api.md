---
title: "vue/no-deprecated-events-api"
rule: "vue/no-deprecated-events-api"
category: "Correctness"
version: "1.62.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.vuejs.org/rules/no-deprecated-events-api.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow using deprecated Events API (`$on`, `$off`, `$once`) in Vue.js 3.0.0+.

### Why is this bad?

In Vue.js 3.0.0+, the internal event APIs `$on`, `$off`, and `$once` have been removed.
These methods were used for event handling between components but are no longer available.

### Examples

Examples of **incorrect** code for this rule:

```vue
<script>
export default {
  mounted() {
    this.$on("event", () => {});
    this.$off("event");
    this.$once("event", () => {});
  },
};
</script>
```

Examples of **correct** code for this rule:

```vue
<script>
import mitt from "mitt";

const emitter = mitt();

export default {
  mounted() {
    emitter.on("event", () => {});
    emitter.off("event");
    emitter.once("event", () => {});
  },
};
</script>
```

## How to use

```json
{
  "rules": {
    "vue/no-deprecated-events-api": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/no-deprecated-events-api": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.62.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/no-deprecated-events-api.html)
