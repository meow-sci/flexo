---
title: "import/no-empty-named-blocks"
rule: "import/no-empty-named-blocks"
category: "Suspicious"
version: "0.16.1"
default: false
type_aware: false
fix: "fixable_fix"
upstream: "https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-empty-named-blocks.md"
---

| Property | Value |
|----------|-------|
| Category | Suspicious |
| Default | no |
| Fix | fixable_fix |
| Type-aware | no |


### What it does

Enforces that named import blocks are not empty.

### Why is this bad?

Empty named imports serve no practical purpose and often
result from accidental deletions or tool-generated code.

### Examples

Examples of **incorrect** code for this rule:

```js
import {} from "mod";
import Default from "mod";
```

Examples of **correct** code for this rule:

```js
import { mod } from "mod";
import Default, { mod } from "mod";
```

## How to use

```json
{
  "rules": {
    "import/no-empty-named-blocks": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "import/no-empty-named-blocks": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.16.1.

## References

- [Upstream rule documentation](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-empty-named-blocks.md)
