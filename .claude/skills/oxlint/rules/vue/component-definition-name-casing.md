---
title: "vue/component-definition-name-casing"
rule: "vue/component-definition-name-casing"
category: "Style"
version: "next"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://eslint.vuejs.org/rules/component-definition-name-casing.html"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforce specific casing for component definition names.

### Why is this bad?

Defining component names without a consistent casing makes templates
harder to read and harder to grep. Picking either `PascalCase` or
`kebab-case` and sticking with it across the codebase removes a class
of bikeshedding and search misses.

### Examples

Examples of **incorrect** code for this rule (default `PascalCase`):

```vue
<script>
export default {
  name: "foo-bar",
};
</script>
```

Examples of **correct** code for this rule (default `PascalCase`):

```vue
<script>
export default {
  name: "FooBar",
};
</script>
```

## Configuration

This rule accepts one of the following string values:

type: `"PascalCase" | "kebab-case"`

## How to use

```json
{
  "rules": {
    "vue/component-definition-name-casing": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/component-definition-name-casing": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in vnext.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/component-definition-name-casing.html)
