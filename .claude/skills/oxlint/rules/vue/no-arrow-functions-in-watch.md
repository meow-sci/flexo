---
title: "vue/no-arrow-functions-in-watch"
rule: "vue/no-arrow-functions-in-watch"
category: "Correctness"
version: "1.39.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.vuejs.org/rules/no-arrow-functions-in-watch.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

This rule disallows using arrow functions when defining a watcher.

### Why is this bad?

Arrow functions bind `this` lexically, which means they don't have access to the Vue component instance.
In Vue watchers, you often need access to `this` to interact with component data, methods, or other properties.
Using regular functions or method shorthand ensures proper `this` binding.

### Examples

Examples of **incorrect** code for this rule:

```vue
<script>
export default {
  watch: {
    foo: () => {},
    bar: {
      handler: () => {},
    },
    baz: [
      (val) => {},
      {
        handler: () => {},
      },
    ],
  },
};
</script>
```

Examples of **correct** code for this rule:

```vue
<script>
export default {
  watch: {
    foo() {},
    bar: function () {},
    baz: {
      handler: function () {},
    },
  },
};
</script>
```

## How to use

```json
{
  "rules": {
    "vue/no-arrow-functions-in-watch": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/no-arrow-functions-in-watch": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.39.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/no-arrow-functions-in-watch.html)
