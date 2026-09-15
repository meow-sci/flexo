---
title: "import/export"
rule: "import/export"
category: "Nursery"
version: "0.0.21"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/export.md"
---

| Property | Value |
|----------|-------|
| Category | Nursery |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Reports funny business with exports, like repeated exports of names or defaults.

### Why is this bad?

Having multiple exports of the same name can lead to ambiguity and confusion
in the codebase. It makes it difficult to track which export is being used
and can result in runtime errors if the wrong export is referenced.

### Examples

Examples of **incorrect** code for this rule:

```javascript
let foo;
export { foo }; // Multiple exports of name 'foo'.
export * from "./export-all"; // Conflicts if export-all.js also exports foo
```

Examples of **correct** code for this rule:

```javascript
let foo;
export { foo as foo1 }; // Renamed export to avoid conflict
export * from "./export-all"; // No conflict if export-all.js also exports foo
```

## How to use

```json
{
  "rules": {
    "import/export": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "import/export": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.0.21.

## References

- [Upstream rule documentation](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/export.md)
