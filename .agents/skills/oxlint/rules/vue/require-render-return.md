---
title: "vue/require-render-return"
rule: "vue/require-render-return"
category: "Correctness"
version: "1.67.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.vuejs.org/rules/require-render-return.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforce that a `render` function always returns a value.

### Why is this bad?

A Vue component's `render` function must produce a VNode tree. If a
code path falls through without returning, Vue receives `undefined`
and silently renders nothing.

### Examples

Examples of **incorrect** code for this rule:

```vue
<script>
export default {
  render() {
    if (foo) {
      return h("div");
    }
    // falls through without returning
  },
};
</script>
```

Examples of **correct** code for this rule:

```vue
<script>
export default {
  render() {
    return h("div");
  },
};
</script>
```

## How to use

```json
{
  "rules": {
    "vue/require-render-return": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/require-render-return": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.67.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/require-render-return.html)
