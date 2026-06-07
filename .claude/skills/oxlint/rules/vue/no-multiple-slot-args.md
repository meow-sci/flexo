---
title: "vue/no-multiple-slot-args"
rule: "vue/no-multiple-slot-args"
category: "Restriction"
version: "1.15.0"
default: false
type_aware: false
fix: "pending"
upstream: "https://eslint.vuejs.org/rules/no-multiple-slot-args.html"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallow passing multiple arguments to scoped slots.

### Why is this bad?

Users have to use the arguments in fixed order and cannot omit the ones they don't need.
e.g. if you have a slot that passes in 5 arguments but the user actually only need the last 2 of them,
they will have to declare all 5 just to use the last 2.

More information can be found in [vuejs/vue#9468](https://github.com/vuejs/vue/issues/9468#issuecomment-462210146)

### Examples

Examples of **incorrect** code for this rule:

```vue
<script>
export default {
  render(h) {
    var children = this.$scopedSlots.default(foo, bar);
    var children = this.$scopedSlots.default(...foo);
  },
};
</script>
```

Examples of **correct** code for this rule:

```vue
<script>
export default {
  render(h) {
    var children = this.$scopedSlots.default();
    var children = this.$scopedSlots.default(foo);
    var children = this.$scopedSlots.default({ foo, bar });
  },
};
</script>
```

## How to use

```json
{
  "rules": {
    "vue/no-multiple-slot-args": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/no-multiple-slot-args": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.15.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/no-multiple-slot-args.html)
