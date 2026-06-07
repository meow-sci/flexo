---
title: "vue/require-typed-ref"
rule: "vue/require-typed-ref"
category: "Style"
version: "1.17.0"
default: false
type_aware: false
fix: "none"
upstream: "https://eslint.vuejs.org/rules/require-typed-ref.html"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Require `ref` and `shallowRef` functions to be strongly typed.

### Why is this bad?

With TypeScript it is easy to prevent usage of `any` by using `noImplicitAny`.
Unfortunately this rule is easily bypassed with Vue `ref()` function.
Calling `ref()` function without a generic parameter or an initial value leads to ref having `Ref<any>` type.

### Examples

Examples of **incorrect** code for this rule:

```typescript
const count = ref();
const name = shallowRef();
```

Examples of **correct** code for this rule:

```typescript
const count = ref<number>();
const a = ref(0);
```

## How to use

```json
{
  "rules": {
    "vue/require-typed-ref": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "vue/require-typed-ref": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.17.0.

## References

- [Upstream rule documentation](https://eslint.vuejs.org/rules/require-typed-ref.html)
