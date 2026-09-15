---
title: "vue/no-this-in-before-route-enter"
rule: "vue/no-this-in-before-route-enter"
category: "Correctness"
version: "1.37.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.vuejs.org/rules/no-this-in-before-route-enter.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow `this` usage in a `beforeRouteEnter` method.

This rule is only relevant when using `vue-router`.

### Why is this bad?

Inside a `beforeRouteEnter` method, there is no access to `this`.
See [the vue-router docs](https://router.vuejs.org/guide/advanced/navigation-guards.html#in-component-guards).
This behavior isn't obvious, and so this lint rule can help prevent runtime errors in some cases.

### Examples

Examples of **incorrect** code for this rule:

```js
export default {
  beforeRouteEnter(to, from, next) {
    this.a; // Error: 'this' is not available
    next();
  },
};
```

Examples of **correct** code for this rule:

```js
export default {
  beforeRouteEnter(to, from, next) {
    // anything without `this`
  },
};
```

## How to use

```json
{
  "rules": {
    "vue/no-this-in-before-route-enter": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/no-this-in-before-route-enter": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.37.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/no-this-in-before-route-enter.html)
