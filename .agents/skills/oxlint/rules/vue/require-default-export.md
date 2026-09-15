---
title: "vue/require-default-export"
rule: "vue/require-default-export"
category: "Suspicious"
version: "1.21.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.vuejs.org/rules/require-default-export.html"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Require components to be the default export.

### Why is this bad?

Using SFCs (Single File Components) without a default export is
not supported in Vue 3. Components should be exported as the default export.

### Examples

Examples of **incorrect** code for this rule:

```vue
<script>
const foo = "foo";
</script>
```

Examples of **correct** code for this rule:

```vue
<script>
export default {
  data() {
    return {
      foo: "foo",
    };
  },
};
</script>
```

## How to use

```json
{
  "rules": {
    "vue/require-default-export": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/require-default-export": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.21.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/require-default-export.html)
