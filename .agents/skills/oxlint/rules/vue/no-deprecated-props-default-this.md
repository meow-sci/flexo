---
title: "vue/no-deprecated-props-default-this"
rule: "vue/no-deprecated-props-default-this"
category: "Correctness"
version: "1.67.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://eslint.vuejs.org/rules/no-deprecated-props-default-this.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallow deprecated `this` access in props default function (in Vue.js 3.0.0+).

### Why is this bad?

In Vue.js 3.0.0+, props default factory functions no longer have access to
`this`. They are invoked before the component instance is created, so
`this` is `undefined`. The factory should rely on its first argument (the
raw props passed by the parent) instead.

### Examples

Examples of **incorrect** code for this rule:

```vue
<script>
export default {
  props: {
    a: String,
    b: {
      default() {
        return this.a;
      },
    },
  },
};
</script>
```

Examples of **correct** code for this rule:

```vue
<script>
export default {
  props: {
    a: String,
    b: {
      default(props) {
        return props.a;
      },
    },
  },
};
</script>
```

## How to use

```json
{
  "rules": {
    "vue/no-deprecated-props-default-this": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/no-deprecated-props-default-this": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.67.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/no-deprecated-props-default-this.html)
