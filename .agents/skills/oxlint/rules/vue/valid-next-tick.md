---
title: "vue/valid-next-tick"
rule: "vue/valid-next-tick"
category: "Correctness"
version: "1.67.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://eslint.vuejs.org/rules/valid-next-tick.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforce valid `nextTick` function calls.

### Why is this bad?

`nextTick` is a function that takes either a callback or returns a Promise.
Misuse (accessing it as a value, passing extra arguments, both awaiting and
passing a callback) is almost always a bug.

### Examples

Examples of **incorrect** code for this rule:

```vue
<script>
import { nextTick } from "vue";
export default {
  async mounted() {
    nextTick(); // missing await or callback
    this.$nextTick; // not invoked
    this.$nextTick(a, b); // too many args
    await this.$nextTick(callback); // both await and callback
  },
};
</script>
```

Examples of **correct** code for this rule:

```vue
<script>
import { nextTick } from "vue";
export default {
  async mounted() {
    await nextTick();
    this.$nextTick(callback);
    this.$nextTick().then(callback);
  },
};
</script>
```

## How to use

```json
{
  "rules": {
    "vue/valid-next-tick": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/valid-next-tick": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.67.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/valid-next-tick.html)
