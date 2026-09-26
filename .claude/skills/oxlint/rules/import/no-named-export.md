---
title: "import/no-named-export"
rule: "import/no-named-export"
category: "Style"
version: "1.19.0"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-named-export.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Prohibit named exports.

### Why is this bad?

Named exports require strict identifier matching and can lead to fragile imports,
while default exports enforce a single, consistent module entry point.

### Examples

Examples of **incorrect** code for this rule:

```js
export const foo = "foo";

const bar = "bar";
export { bar };
```

Examples of **correct** code for this rule:

```js
export default 'bar';

const foo = 'foo';
export { foo as default }
```

## How to use

```json
{
  "rules": {
    "import/no-named-export": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "import/no-named-export": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v1.19.0.

## References

- [Upstream rule documentation](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-named-export.md)
