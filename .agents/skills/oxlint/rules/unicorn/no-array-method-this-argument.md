---
title: "unicorn/no-array-method-this-argument"
rule: "unicorn/no-array-method-this-argument"
category: "Style"
version: "0.16.12"
default: false
type_aware: false
fix: "pending"
upstream: "https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-array-method-this-argument.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🚧 fix pending |
| Type-aware | no |


### What it does

Disallows the use of the `thisArg` parameter in array iteration methods such as
`map`, `filter`, `some`, `every`, and similar.

### Why is this bad?

The `thisArg` parameter makes code harder to understand and reason about. Instead,
prefer arrow functions or bind explicitly in a clearer way. Arrow functions inherit
`this` from the lexical scope, which is more intuitive and less error-prone.

### Examples

Examples of **incorrect** code for this rule:

```js
array.map(function (x) {
  return x + this.y;
}, this);
array.filter(function (x) {
  return x !== this.value;
}, this);
```

Examples of **correct** code for this rule:

```js
array.map((x) => x + this.y);
array.filter((x) => x !== this.value);
const self = this;
array.map(function (x) {
  return x + self.y;
});
```

## How to use

```json
{
  "rules": {
    "unicorn/no-array-method-this-argument": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "unicorn/no-array-method-this-argument": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.16.12.

## References

- [Upstream rule documentation](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-array-method-this-argument.md)
