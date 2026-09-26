---
title: "eslint/sort-imports"
rule: "eslint/sort-imports"
category: "Style"
version: "0.4.4"
default: false
type_aware: false
fix: "conditional_fix"
upstream: "https://eslint.org/docs/latest/rules/sort-imports"
---

| Property | Value |
|----------|-------|
| Category | Style |
| Default | no |
| Fix | 🛠️ conditional fix |
| Type-aware | no |


### What it does

This rule checks all import declarations and verifies that all imports are first sorted
by the used member syntax and then alphabetically by the first member or alias name.

When declaring multiple imports, a sorted list of import declarations make it easier for developers to read
the code and find necessary imports later.

### Why is this bad?

Consistent import sorting can be useful for readability and maintainability of code.

### Examples

Examples of **incorrect** code for this rule:

```javascript
import { b, a, c } from "foo.js";

import d from "foo.js";
import e from "bar.js";
```

## Configuration

This rule accepts a configuration object with the following properties:

### allowSeparatedGroups

type: `boolean`

default: `false`

When `true`, the rule allows import groups separated by blank lines to be treated independently.

### ignoreCase

type: `boolean`

default: `false`

When `true`, the rule ignores case-sensitivity when sorting import names.

### ignoreDeclarationSort

type: `boolean`

default: `false`

When `true`, the rule ignores the sorting of import declarations (the order of `import` statements).

### ignoreMemberSort

type: `boolean`

default: `false`

When `true`, the rule ignores the sorting of import members within a single import declaration.

### memberSyntaxSortOrder

type: `array`

default: `["none", "all", "multiple", "single"]`

Specifies the sort order of different import syntaxes.
Must include all 4 kinds!

#### memberSyntaxSortOrder[n]

type: `"none" | "all" | "multiple" | "single"`

## How to use

```json
{
  "rules": {
    "eslint/sort-imports": "error"
  }
}
```

With options:

```json
{
  "rules": {
    "eslint/sort-imports": ["error", { /* options */ }]
  }
}
```

## Version

This rule was added in v0.4.4.

## References

- [Upstream rule documentation](https://eslint.org/docs/latest/rules/sort-imports)
