---
title: "import/group-exports"
rule: "import/group-exports"
category: "Style"
version: "0.16.6"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/group-exports.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Reports when named exports are not grouped together in a single export declaration
or when multiple assignments to CommonJS module.exports
or exports object are present in a single file.

### Why is this bad?

An export declaration or module.exports assignment can appear anywhere in the code.
By requiring a single export declaration all your exports will remain at one place,
making it easier to see what exports a module provides.

### Examples

Examples of **incorrect** code for this rule:

```js
export const first = true;
export const second = true;
```

Examples of **correct** code for this rule:

```js
const first = true;
const second = true;
export { first, second };
```

## How to use

```json
{
  "rules": {
    "import/group-exports": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "import/group-exports": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.16.6.

## References

- [Upstream rule documentation](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/group-exports.md)
