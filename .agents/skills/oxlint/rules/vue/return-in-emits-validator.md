---
title: "vue/return-in-emits-validator"
rule: "vue/return-in-emits-validator"
category: "Correctness"
version: "1.67.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.vuejs.org/rules/return-in-emits-validator.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Enforce that a `return` statement is present in `emits` validators
(in Vue.js 3.0.0+).

### Why is this bad?

An `emits` validator must return a boolean indicating whether the
emitted payload is valid. Forgetting to return a value (or returning
only falsy values) makes the validator effectively reject every emit,
breaking the component contract silently.

### Examples

Examples of **incorrect** code for this rule:

```vue
<script>
export default {
  emits: {
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
  emits: {
    foo(payload) {
      return typeof payload === "string";
    },
  },
};
</script>
```

## How to use

```json
{
  "rules": {
    "vue/return-in-emits-validator": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/return-in-emits-validator": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.67.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/return-in-emits-validator.html)
