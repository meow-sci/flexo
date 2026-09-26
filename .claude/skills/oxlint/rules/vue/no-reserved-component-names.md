---
title: "vue/no-reserved-component-names"
rule: "vue/no-reserved-component-names"
category: "Correctness"
version: "next"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.vuejs.org/rules/no-reserved-component-names.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow Vue component names that collide with HTML / SVG element names
(and optionally Vue built-in component names).

### Why is this bad?

Using a reserved name silently shadows the standard element / built-in
component, producing confusing behavior at runtime.

### Examples

Examples of **incorrect** code for this rule:

```vue
<script>
export default {
  name: "div",
};
</script>
```

Examples of **correct** code for this rule:

```vue
<script>
export default {
  name: "MyComponent",
};
</script>
```

## Configuration

This rule accepts a configuration object with the following properties:

### disallowVue3BuiltInComponents

type: `boolean`

default: `false`

Disallow Vue 3 built-in component names (e.g. `Teleport`, `Suspense`).
Note: this also catches Vue 2 built-ins because Vue 3's set includes them.

### disallowVueBuiltInComponents

type: `boolean`

default: `false`

Disallow Vue 2 built-in component names (e.g. `Transition`, `KeepAlive`).

### htmlElementCaseSensitive

type: `boolean`

default: `false`

Match HTML / SVG element names case-sensitively. When `false` (default),
the capitalized form of an HTML element (e.g. `Div`) is also reported.

## How to use

```json
{
  "rules": {
    "vue/no-reserved-component-names": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/no-reserved-component-names": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in vnext.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/no-reserved-component-names.html)
