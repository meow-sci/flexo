---
title: "unicorn/prefer-array-flat-map"
rule: "unicorn/prefer-array-flat-map"
category: "Perf"
version: "0.0.14"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-array-flat-map.md"
---

| Property | Value |
|----------|-------|
| Category | Perf |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Prefers the use of `.flatMap()` when `map().flat()` are used together.

### Why is this bad?

It is slightly more efficient to use `.flatMap(…)` instead of `.map(…).flat()`.

### Examples

Examples of **incorrect** code for this rule:

```javascript
const bar = [1, 2, 3].map((i) => [i]).flat();
```

Examples of **correct** code for this rule:

```javascript
const bar = [1, 2, 3].flatMap((i) => [i]);
```

## How to use

```json
{
  "rules": {
    "unicorn/prefer-array-flat-map": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/prefer-array-flat-map": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.14.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-array-flat-map.md)
