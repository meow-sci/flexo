---
title: "vue/require-prop-type-constructor"
rule: "vue/require-prop-type-constructor"
category: "Correctness"
version: "next"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://eslint.vuejs.org/rules/require-prop-type-constructor.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Require `props` type values to be a constructor function (e.g. `String`,
`Number`, `Boolean`) rather than a string, number, or other literal.

### Why is this bad?

Vue uses the prop type for runtime validation and dev-time warnings. A
string like `'String'` looks like the constructor but is never matched
against an actual value, silently disabling the check.

### Examples

Examples of **incorrect** code for this rule:

```vue
<script>
export default {
  props: {
    foo: "String",
    bar: { type: "Number" },
  },
};
</script>
```

Examples of **correct** code for this rule:

```vue
<script>
export default {
  props: {
    foo: String,
    bar: { type: Number },
  },
};
</script>
```

## How to use

```json
{
  "rules": {
    "vue/require-prop-type-constructor": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/require-prop-type-constructor": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in vnext.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/require-prop-type-constructor.html)
