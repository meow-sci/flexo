---
title: "vue/return-in-computed-property"
rule: "vue/return-in-computed-property"
category: "Correctness"
version: "1.63.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.vuejs.org/rules/return-in-computed-property.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforce that a `return` statement is present in every computed property.

### Why is this bad?

A Vue computed property is a getter that must produce a value. Forgetting
to return turns the value into `undefined`, which silently breaks
templates and reactive code that depend on the computed.

### Examples

Examples of **incorrect** code for this rule:

```vue
<script>
export default {
  computed: {
    foo() {
      // missing return
    },
  },
};
</script>
```

Examples of **correct** code for this rule:

```vue
<script>
export default {
  computed: {
    foo() {
      return this.bar;
    },
  },
};
</script>
```

## Configuration

### treatUndefinedAsUnspecified

type: `boolean`

default: `true`

When `true` (default), `return;` (without a value) is treated as a missing return.
Set to `false` to allow bare `return;` as if it returned a value.

## How to use

```json
{
  "rules": {
    "vue/return-in-computed-property": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/return-in-computed-property": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.63.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/return-in-computed-property.html)
