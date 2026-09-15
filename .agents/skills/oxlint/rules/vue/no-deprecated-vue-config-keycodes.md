---
title: "vue/no-deprecated-vue-config-keycodes"
rule: "vue/no-deprecated-vue-config-keycodes"
category: "Correctness"
version: "1.62.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.vuejs.org/rules/no-deprecated-vue-config-keycodes.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Disallow using deprecated `Vue.config.keyCodes` (in Vue.js 3.0.0+).

### Why is this bad?

`Vue.config.keyCodes` was removed in Vue 3. Code that relies on it will
silently stop working when upgrading.

### Examples

Examples of **incorrect** code for this rule:

```js
Vue.config.keyCodes = { enter: 13 };
```

Examples of **correct** code for this rule:

```js
Vue.config.silent = true;
```

## How to use

```json
{
  "rules": {
    "vue/no-deprecated-vue-config-keycodes": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/no-deprecated-vue-config-keycodes": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.62.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/no-deprecated-vue-config-keycodes.html)
