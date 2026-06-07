---
title: "vue/no-watch-after-await"
rule: "vue/no-watch-after-await"
category: "Correctness"
version: "1.67.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.vuejs.org/rules/no-watch-after-await.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow asynchronously registered `watch`.

### Why is this bad?

`watch` and `watchEffect` registered after an `await` expression in
`setup()` may not work as expected because they are registered after
the component instance has finished setting up.

### Examples

Examples of **incorrect** code for this rule:

```vue
<script>
import { watch } from "vue";
export default {
  async setup() {
    await doSomething();
    watch(foo, () => {
      /* ... */
    }); // error
  },
};
</script>
```

Examples of **correct** code for this rule:

```vue
<script>
import { watch } from "vue";
export default {
  async setup() {
    watch(foo, () => {
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
    "vue/no-watch-after-await": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/no-watch-after-await": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.67.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/no-watch-after-await.html)
