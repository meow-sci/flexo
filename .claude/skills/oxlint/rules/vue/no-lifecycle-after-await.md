---
title: "vue/no-lifecycle-after-await"
rule: "vue/no-lifecycle-after-await"
category: "Correctness"
version: "1.39.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.vuejs.org/rules/no-lifecycle-after-await.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow asynchronously registered lifecycle hooks.

### Why is this bad?

Lifecycle hooks must be registered synchronously during `setup()` execution.
If a lifecycle hook is called after an `await` statement, it may be registered
too late and might not work as expected.

### Examples

Examples of **incorrect** code for this rule:

```vue
<script>
import { onMounted } from "vue";
export default {
  async setup() {
    await doSomething();
    onMounted(() => {
      /* ... */
    }); // error
  },
};
</script>
```

Examples of **correct** code for this rule:

```vue
<script>
import { onMounted } from "vue";
export default {
  async setup() {
    onMounted(() => {
      /* ... */
    }); // ok
    await doSomething();
  },
};
</script>
```

## How to use

```json
{
  "rules": {
    "vue/no-lifecycle-after-await": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/no-lifecycle-after-await": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.39.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/no-lifecycle-after-await.html)
