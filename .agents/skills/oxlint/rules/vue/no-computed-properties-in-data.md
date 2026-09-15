---
title: "vue/no-computed-properties-in-data"
rule: "vue/no-computed-properties-in-data"
category: "Correctness"
version: "1.67.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.vuejs.org/rules/no-computed-properties-in-data.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow accessing computed properties inside `data()`.

### Why is this bad?

`data()` runs **before** computed properties are initialized, so
`this.<computedName>` evaluates to `undefined` and leaves silently
broken state in the component instance.

### Examples

Examples of **incorrect** code for this rule:

```vue
<script>
export default {
  data() {
    const foo = this.foo; // `foo` is a computed property
    return {};
  },
  computed: {
    foo() {},
  },
};
</script>
```

Examples of **correct** code for this rule:

```vue
<script>
export default {
  data() {
    const foo = this.foo; // `foo` is a prop, not a computed
    return {};
  },
  props: ["foo"],
};
</script>
```

## How to use

```json
{
  "rules": {
    "vue/no-computed-properties-in-data": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/no-computed-properties-in-data": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.67.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/no-computed-properties-in-data.html)
