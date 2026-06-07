---
title: "import/no-default-export"
rule: "import/no-default-export"
category: "Restriction"
version: "0.2.14"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-default-export.md"
---

| Property | Value |
|----------|-------|
| Category | Restriction |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Forbids a module from having default exports. This helps your editor
provide better auto-import functionality, as named exports offer more
explicit and predictable imports compared to default exports.

### Why is this bad?

Default exports can lead to confusion, as the name of the imported value
can vary based on how it's imported. This can make refactoring and
auto-imports less reliable.

### Examples

Examples of **incorrect** code for this rule:

```javascript
export default 'bar';

const foo = 'foo';
export { foo as default }
```

Examples of **correct** code for this rule:

```javascript
export const foo = "foo";
export const bar = "bar";
```

## How to use

```json
{
  "rules": {
    "import/no-default-export": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "import/no-default-export": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.2.14.

## References

- [Upstream rule documentation](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-default-export.md)
