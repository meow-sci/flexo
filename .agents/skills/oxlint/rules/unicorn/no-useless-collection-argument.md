---
title: "unicorn/no-useless-collection-argument"
rule: "unicorn/no-useless-collection-argument"
category: "Style"
version: "1.28.0"
default: false
type_aware: false
fix: "fixable_suggestion"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-useless-collection-argument.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | fixable_suggestion |
| Type-aware | no |


### What it does

Disallow useless values or fallbacks in `Set`, `Map`, `WeakSet`, or `WeakMap`.

### Why is this bad?

It is unnecessary to pass an empty array or empty string when
constructing a `Set`, `Map`, `WeakSet`, or `WeakMap`, since
they accept nullish values.

It is also unnecessary to provide a fallback for possible nullish values.

### Examples

Examples of **incorrect** code for this rule:

```js
const set = new Set([]);
const set = new Set("");
```

Examples of **correct** code for this rule:

```js
const set = new Set();
```

Examples of **incorrect** code for this rule:

```js
const set = new Set(foo ?? []);
const set = new Set(foo ?? "");
```

Examples of **correct** code for this rule:

```js
const set = new Set(foo);
```

## How to use

```json
{
  "rules": {
    "unicorn/no-useless-collection-argument": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-useless-collection-argument": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.28.0.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-useless-collection-argument.md)
