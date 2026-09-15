---
title: "import/no-named-default"
rule: "import/no-named-default"
category: "Style"
version: "0.15.3"
default: false
type_aware: false
fix: "none"
upstream: "https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-named-default.md"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | none |
| Type-aware | no |


### What it does

Reports use of a default export as a locally named import.

### Why is this bad?

Rationale: the syntax exists to import default exports expressively, let's use it.

### Examples

Examples of **incorrect** code for this rule:

```js
// message: Using exported name 'bar' as identifier for default export.
import { default as foo } from "./foo.js";
import { default as foo, bar } from "./foo.js";
```

Examples of **correct** code for this rule:

```js
import foo from "./foo.js";
import foo, { bar } from "./foo.js";
```

## How to use

```json
{
  "rules": {
    "import/no-named-default": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "import/no-named-default": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.15.3.

## References

- [Upstream rule documentation](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-named-default.md)
