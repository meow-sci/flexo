---
title: "vue/prefer-import-from-vue"
rule: "vue/prefer-import-from-vue"
category: "Correctness"
version: "1.20.0"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://eslint.vuejs.org/rules/prefer-import-from-vue.html"
---

| Property | Value |
|----------|-------|
| Category | Correctness |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforce `import from 'vue'` instead of `import from '@vue/*'`.

### Why is this bad?

Imports from the following modules are almost always wrong. You should import from vue instead.

- `@vue/runtime-dom`
- `@vue/runtime-core`
- `@vue/reactivity`
- `@vue/shared`

### Examples

Examples of **incorrect** code for this rule:

```js
import { createApp } from "@vue/runtime-dom";
import { Component } from "@vue/runtime-core";
import { ref } from "@vue/reactivity";
```

Examples of **correct** code for this rule:

```js
import { createApp, ref, Component } from "vue";
```

## How to use

```json
{
  "rules": {
    "vue/prefer-import-from-vue": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/prefer-import-from-vue": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.20.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/prefer-import-from-vue.html)
